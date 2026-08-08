// OnlineJourno Self-Host Installer — local orchestration server
// Serves the wizard UI and runs Docker Compose on the user's behalf.
// Zero runtime dependencies beyond Node 18+.

import { createServer } from "node:http";
import { readFile, stat, access, constants } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.INSTALLER_PORT ? Number(process.env.INSTALLER_PORT) : 7000;
const HOST = "127.0.0.1";

// In-progress installs keyed by job id.
const jobs = new Map();

const PRODUCTS = {
  newsroom: {
    name: "OnlineJourno Newsroom",
    slug: "newsroom",
    repo: "https://github.com/onlinejourno/newsroom.git",
    liveUrl: "https://app.onlinejourno.com",
    description: "The flagship editorial-intelligence desk.",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  daybook: {
    name: "Daybook",
    slug: "daybook",
    repo: "https://github.com/onlinejourno/daybook.git",
    liveUrl: "https://daybook.onlinejourno.com",
    description: "Editorial calendar and planning desk (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    comingSoon: true,
  },
  galley: {
    name: "Galley",
    slug: "galley",
    repo: "https://github.com/onlinejourno/galley.git",
    liveUrl: "https://galley.onlinejourno.com",
    description: "Story report and copy-fit tool (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    comingSoon: true,
  },
  frontmatter: {
    name: "Frontmatter",
    slug: "frontmatter",
    repo: "https://github.com/onlinejourno/frontmatter.git",
    liveUrl: "https://frontmatter.onlinejourno.com",
    description: "Merit↔reach distribution-fit engine (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    comingSoon: true,
  },
  loupe: {
    name: "Loupe",
    slug: "loupe",
    liveUrl: "https://loupe.onlinejourno.com",
    description: "Frame and editorial-lens analyser (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  dispatch: {
    name: "Dispatch",
    slug: "dispatch",
    repo: "https://github.com/onlinejourno/dispatch.git",
    liveUrl: "https://dispatch.onlinejourno.com",
    description: "Editorial-intelligence dashboard (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    comingSoon: true,
  },
  regwatch: {
    name: "RegWatch",
    slug: "regwatch",
    liveUrl: "https://regwatch.onlinejourno.com",
    description: "Regulatory and policy signal watch (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  lawwatch: {
    name: "LawWatch",
    slug: "lawwatch",
    liveUrl: "https://lawwatch.onlinejourno.com",
    description: "Legal and judiciary signal watch (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  policywatch: {
    name: "PolicyWatch",
    slug: "policywatch",
    liveUrl: "https://policywatch.onlinejourno.com",
    description: "Government and policy signal watch (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  techwatch: {
    name: "TechWatch",
    slug: "techwatch",
    liveUrl: "https://techwatch.onlinejourno.com",
    description: "Technology and platform signal watch (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  pulse: {
    name: "Pulse",
    slug: "pulse",
    liveUrl: "https://onlinejourno.com/in",
    description: "Curated editorial digest and briefing (proprietary).",
    licence: "Proprietary",
    gated: true,
    requestUrl: "https://onlinejourno.com/contact/",
  },
  tare: {
    name: "Tare",
    slug: "tare",
    repo: "https://github.com/onlinejourno/tare.git",
    liveUrl: "https://tare.onlinejourno.com",
    description: "Privacy-and-bloat page analyser (MIT).",
    licence: "MIT",
    comingSoon: true,
  },
  forage: {
    name: "Forage",
    slug: "forage",
    repo: "https://github.com/onlinejourno/crawl-budget-analyser.git",
    liveUrl: "https://forage.onlinejourno.com",
    description: "Crawl-budget and crawler-attention reporter (MIT).",
    licence: "MIT",
    comingSoon: true,
  },
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function sendError(res, status, message) {
  send(res, status, { ok: false, error: message });
}

async function staticFile(pathname) {
  const safe = pathname.replace(/\.{2,}/g, "").replace(/^\/+/, "") || "index.html";
  const filePath = join(__dirname, safe);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) return null;
  const data = await readFile(filePath);
  return { data, type: MIME[extname(filePath)] || "application/octet-stream" };
}

async function commandExists(cmd) {
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(cmd, ["--version"], { shell: false, stdio: "ignore" });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject()));
    });
    return true;
  } catch {
    return false;
  }
}

async function dockerComposeVersion() {
  try {
    const out = await runCommand("docker", ["compose", "version"], { collect: true, timeout: 10_000 });
    return out.stdout.trim();
  } catch {
    try {
      const out = await runCommand("docker-compose", ["--version"], { collect: true, timeout: 10_000 });
      return out.stdout.trim();
    } catch {
      return null;
    }
  }
}

function runCommand(cmd, args, options = {}) {
  const { cwd, env, collect = false, timeout = 0, onLine, abortSignal } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
    });

    const stdout = [];
    const stderr = [];
    let killed = false;

    const timer = timeout
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGTERM");
          reject(new Error(`Timed out after ${timeout}ms`));
        }, timeout)
      : null;

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        if (!killed) {
          killed = true;
          child.kill("SIGTERM");
        }
      });
      if (abortSignal.aborted) child.kill("SIGTERM");
    }

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      if (collect) stdout.push(text);
      onLine?.(text);
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      if (collect) stderr.push(text);
      onLine?.(text);
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (killed) return;
      const result = { code, stdout: stdout.join(""), stderr: stderr.join("") };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`Command failed with code ${code}`), result));
    });
  });
}

async function findProjectRoot(product) {
  const cwd = process.cwd();
  // 1. Current directory looks like the product source.
  if (
    await fileExists(join(cwd, product.composeFile)).catch(() => false) &&
    await fileExists(join(cwd, "Dockerfile")).catch(() => false)
  ) {
    return cwd;
  }

  // 2. A sibling directory named after the product.
  const sibling = resolve(cwd, product.slug);
  if (
    await fileExists(join(sibling, product.composeFile)).catch(() => false)
  ) {
    return sibling;
  }

  // 3. Clone from GitHub into a local subdirectory.
  const cloneTarget = resolve(cwd, product.slug);
  await runCommand("git", ["clone", "--depth", "1", product.repo, cloneTarget], {
    collect: true,
    timeout: 120_000,
  });
  return cloneTarget;
}

async function fileExists(path) {
  await access(path, constants.F_OK);
  return true;
}

function generateEnv(product, inputs) {
  const lines = [
    `# Generated by OnlineJourno Installer on ${new Date().toISOString()}`,
    `# Product: ${product.name}`,
    "",
    "# === Required ===",
    `SESSION_SECRET=${inputs.sessionSecret}`,
    "",
    "# === Database ===",
    `DATABASE_URL=postgres://onlinejourno:${inputs.postgresPassword || product.envDefaults.POSTGRES_PASSWORD}@db:5432/onlinejourno`,
    `POSTGRES_PASSWORD=${inputs.postgresPassword || product.envDefaults.POSTGRES_PASSWORD}`,
    "",
    "# === Web app ===",
    `WEB_PORT=${inputs.webPort || product.envDefaults.WEB_PORT}`,
    `DB_PORT=${inputs.dbPort || product.envDefaults.DB_PORT}`,
    `NEXT_PUBLIC_APP_URL=http://localhost:${inputs.webPort || product.envDefaults.WEB_PORT}`,
    `NEXT_PUBLIC_PRODUCT_NAME=${product.envDefaults.NEXT_PUBLIC_PRODUCT_NAME}`,
    "",
    "# === LLM provider (optional for web; required for enrichment worker) ===",
    `LLM_PROVIDER=${inputs.llmProvider || product.envDefaults.LLM_PROVIDER}`,
    `LLM_MODEL=${inputs.llmModel || ""}`,
    `LLM_API_KEY=${inputs.llmApiKey || ""}`,
    `ANTHROPIC_API_KEY=${inputs.llmProvider === "anthropic" ? inputs.llmApiKey || "" : ""}`,
    `OPENAI_API_KEY=${inputs.llmProvider === "openai" ? inputs.llmApiKey || "" : ""}`,
    `OPENAI_BASE_URL=${inputs.openaiBaseUrl || ""}`,
    "",
    "# === Optional connectors ===",
    `KEYWORDS_EVERYWHERE_API_KEY=${inputs.keywordsEverywhereApiKey || ""}`,
    "",
    "# === Worker ===",
    "WORKER_CONCURRENCY=4",
    "WORKER_LOG_LEVEL=info",
    "",
    "# === Defaults ===",
    "DEFAULT_MODULES=source-intel,framing-pej",
    "DEFAULT_NEWSROOM_DAILY_BUDGET_USD=8",
  ];
  return lines.join("\n") + "\n";
}

async function runInstall(job, product, inputs) {
  const log = (line) => {
    const entry = { time: Date.now(), line };
    job.logs.push(entry);
    for (const res of job.listeners) {
      try {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      } catch {
        // Client disconnected; cleaned up elsewhere.
      }
    }
  };

  try {
    job.status = "preparing";
    log(`Locating ${product.name} source…`);
    const projectRoot = await findProjectRoot(product);
    log(`Source: ${projectRoot}`);

    job.status = "writing-config";
    log("Writing .env…");
    const envPath = join(projectRoot, ".env");
    const fs = await import("node:fs/promises");
    await fs.writeFile(envPath, generateEnv(product, inputs));
    log("Wrote .env");

    log("Writing installer manifest…");
    const manifest = {
      product: product.slug,
      installedAt: new Date().toISOString(),
      projectRoot,
      webPort: Number(inputs.webPort || product.envDefaults.WEB_PORT),
      adminEmail: inputs.adminEmail,
    };
    await fs.writeFile(
      join(projectRoot, "onlinejourno-installer-manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n"
    );

    job.status = "building";
    log("Building and starting services (this may take a few minutes)…");
    await runCommand("docker", ["compose", "up", "--build", "-d"], {
      cwd: projectRoot,
      onLine: (line) => log(line.trimEnd()),
    });

    job.status = "bootstrapping";
    log("Creating your newsroom and admin account…");
    await runCommand("docker", ["compose", "run", "--rm", "-e", `ADMIN_EMAIL=${inputs.adminEmail}`, "-e", `ADMIN_PASSWORD=${inputs.adminPassword}`, "-e", `OUTLET_NAME=${inputs.outletName}`, "-e", `OUTLET_SLUG=${inputs.outletSlug || "self"}`, product.bootstrap.service, ...product.bootstrap.command], {
      cwd: projectRoot,
      onLine: (line) => log(line.trimEnd()),
    });

    job.status = "done";
    job.result = {
      url: `http://localhost:${inputs.webPort || product.envDefaults.WEB_PORT}`,
      adminEmail: inputs.adminEmail,
      projectRoot,
    };
    log("Installation complete.");
  } catch (err) {
    job.status = "failed";
    const message = err?.message || String(err);
    log(`ERROR: ${message}`);
    if (err?.stderr) log(err.stderr);
    if (err?.stdout) log(err.stdout);
  } finally {
    job.listeners.forEach((res) => {
      try {
        res.write(`data: ${JSON.stringify({ time: Date.now(), done: true, status: job.status, result: job.result })}\n\n`);
        res.end();
      } catch {
        // ignore
      }
    });
    job.listeners = [];
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS for local development only.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static files.
  if (req.method === "GET" && !pathname.startsWith("/api/")) {
    const file = await staticFile(pathname);
    if (file) {
      res.writeHead(200, { "Content-Type": file.type });
      res.end(file.data);
      return;
    }
    // SPA fallback.
    const index = await staticFile("index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(index.data);
    return;
  }

  // API: list products.
  if (pathname === "/api/products" && req.method === "GET") {
    send(res, 200, {
      ok: true,
      products: Object.values(PRODUCTS).map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        licence: p.licence,
        comingSoon: !!p.comingSoon,
        gated: !!p.gated,
        requestUrl: p.requestUrl || null,
        liveUrl: p.liveUrl || null,
        repoUrl: p.repo || null,
      })),
    });
    return;
  }

  // API: prerequisite check.
  if (pathname === "/api/check" && req.method === "GET") {
    const [node, docker, compose] = await Promise.all([
      commandExists("node"),
      commandExists("docker"),
      dockerComposeVersion(),
    ]);
    send(res, 200, {
      ok: node && docker && !!compose,
      node,
      docker,
      compose,
      platform: process.platform,
    });
    return;
  }

  // API: start install.
  if (pathname === "/api/install" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let inputs;
    try {
      inputs = JSON.parse(body);
    } catch {
      return sendError(res, 400, "Invalid JSON body");
    }

    const product = PRODUCTS[inputs.product];
    if (!product) return sendError(res, 400, "Unknown product");
    if (product.gated) return sendError(res, 403, "Proprietary product — request access via the wizard");
    if (product.comingSoon) return sendError(res, 400, "Product not yet installable via wizard");
    if (!inputs.adminEmail || !inputs.adminPassword || !inputs.outletName) {
      return sendError(res, 400, "Missing required fields");
    }

    const id = randomUUID();
    const sessionSecret = inputs.sessionSecret || randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const job = {
      id,
      status: "queued",
      logs: [],
      listeners: [],
      result: null,
    };
    jobs.set(id, job);

    runInstall(job, product, { ...inputs, sessionSecret });
    send(res, 202, { ok: true, id });
    return;
  }

  // API: stream logs (SSE).
  const logsMatch = pathname.match(/^\/api\/logs\/([^/]+)$/);
  if (logsMatch && req.method === "GET") {
    const id = logsMatch[1];
    const job = jobs.get(id);
    if (!job) return sendError(res, 404, "Job not found");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Replay existing logs.
    for (const entry of job.logs) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    if (job.status === "done" || job.status === "failed") {
      res.write(`data: ${JSON.stringify({ time: Date.now(), done: true, status: job.status, result: job.result })}\n\n`);
      res.end();
      return;
    }

    job.listeners.push(res);
    req.on("close", () => {
      const idx = job.listeners.indexOf(res);
      if (idx >= 0) job.listeners.splice(idx, 1);
    });
    return;
  }

  // API: job status.
  const statusMatch = pathname.match(/^\/api\/status\/([^/]+)$/);
  if (statusMatch && req.method === "GET") {
    const id = statusMatch[1];
    const job = jobs.get(id);
    if (!job) return sendError(res, 404, "Job not found");
    send(res, 200, { ok: true, status: job.status, result: job.result });
    return;
  }

  sendError(res, 404, "Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`OnlineJourno Installer running at http://${HOST}:${PORT}`);
});
