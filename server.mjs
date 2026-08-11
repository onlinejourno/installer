// OnlineJourno Self-Host Installer — local orchestration server
// Serves the wizard UI and runs Docker Compose on the user's behalf.
// Zero runtime dependencies beyond Node 18+.

import { createServer, request as httpRequest } from "node:http";
import { readFile, stat, access, constants, readdir } from "node:fs/promises";
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
    composeFile: "docker-compose.yml",
    bootstrap: {
      service: "web",
      command: ["node", "apps/web/scripts/bootstrap.mjs"],
    },
    envDefaults: {
      WEB_PORT: "3000",
      DB_PORT: "5432",
      POSTGRES_PASSWORD: "onlinejourno",
      NEXT_PUBLIC_PRODUCT_NAME: "OnlineJourno",
      LLM_PROVIDER: "anthropic",
    },
    requiredEnv: ["SESSION_SECRET"],
    optionalEnv: [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "OPENAI_BASE_URL",
      "KEYWORDS_EVERYWHERE_API_KEY",
      "DATAFORSEO_LOGIN",
      "DATAFORSEO_PASSWORD",
      "GSC_SITE_URL",
      "GSC_SERVICE_ACCOUNT_JSON",
      "GA4_PROPERTY_ID",
      "GA4_SERVICE_ACCOUNT_JSON",
      "CHARTBEAT_SITE",
      "CHARTBEAT_API_KEY",
      "MATOMO_BASE_URL",
      "MATOMO_SITE_ID",
      "MATOMO_API_TOKEN",
      "PLAUSIBLE_BASE_URL",
      "PLAUSIBLE_SITE_ID",
      "PLAUSIBLE_API_KEY",
      "PIANO_AID",
      "PIANO_API_KEY",
      "NEWZDASH_API_KEY",
      "SEOPANEL_BASE_URL",
      "SEOPANEL_API_KEY",
      "GOOGLE_TRENDS_GEO",
    ],
    needsAdmin: true,
  },
  daybook: {
    name: "Daybook",
    slug: "daybook",
    repo: "https://github.com/onlinejourno/daybook.git",
    liveUrl: "https://daybook.onlinejourno.com",
    description: "Editorial calendar and planning desk (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "8080",
    },
  },
  galley: {
    name: "Galley",
    slug: "galley",
    repo: "https://github.com/onlinejourno/galley.git",
    liveUrl: "https://galley.onlinejourno.com",
    description: "Story report and copy-fit tool (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "8080",
    },
  },
  frontmatter: {
    name: "Frontmatter",
    slug: "frontmatter",
    repo: "https://github.com/onlinejourno/frontmatter.git",
    liveUrl: "https://frontmatter.onlinejourno.com",
    description: "Merit↔reach distribution-fit engine (FSL).",
    licence: "FSL-1.1 → Apache 2.0",
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "8080",
    },
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
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "8501",
    },
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
    liveUrl: "https://tools.onlinejourno.com/tare",
    description: "Privacy-and-bloat page analyser (MIT).",
    licence: "MIT",
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "3000",
    },
  },
  forage: {
    name: "Forage",
    slug: "forage",
    repo: "https://github.com/onlinejourno/tools.git",
    liveUrl: "https://tools.onlinejourno.com/crawl-budget-analyser",
    description: "Crawl-budget and crawler-attention reporter (MIT).",
    licence: "MIT",
    composeFile: "docker-compose.yml",
    envDefaults: {
      WEB_PORT: "8080",
    },
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

function isValidLicenseKey(key) {
  return typeof key === "string" && /^OJNR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim());
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", (err) => {
      probe.close();
      resolve(err.code === "EADDRINUSE" ? false : false);
    });
    probe.once("listening", () => {
      probe.close();
      resolve(true);
    });
    probe.listen(Number(port), HOST);
  });
}

function waitForHealth(url, options = {}) {
  const { timeout = 120_000, interval = 2_000 } = options;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = createHttpRequest(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve({ ok: true, statusCode: res.statusCode });
        } else {
          scheduleNext();
        }
      });
      req.on("error", scheduleNext);
      req.setTimeout(5_000, () => {
        req.destroy();
        scheduleNext();
      });
      req.end();
    };

    const scheduleNext = () => {
      if (Date.now() - start > timeout) {
        reject(new Error(`Health check timed out after ${timeout / 1000}s`));
        return;
      }
      setTimeout(attempt, interval);
    };

    attempt();
  });
}

function createHttpRequest(url, callback) {
  return httpRequest(url, callback);
}

function classifyInstallError(err, product) {
  const text = `${err?.message || ""} ${err?.stderr || ""} ${err?.stdout || ""}`.toLowerCase();
  const port = product?.envDefaults?.WEB_PORT || "3000";

  if (text.includes("eaddrinuse") || text.includes("already in use") || text.includes("bind: address already in use")) {
    return `Port ${port} (or another required port) is already in use. Pick a different port and try again.`;
  }
  if (text.includes("cannot connect to the docker daemon") || text.includes("docker daemon")) {
    return "Docker is not running. Start Docker Desktop or the Docker service, then try again.";
  }
  if (text.includes("no such file or directory") && text.includes("dockerfile")) {
    return "The product source is missing a Dockerfile. Try deleting the product folder and installing again.";
  }
  if (text.includes("timed out") || text.includes("timeout")) {
    return "The operation timed out. This usually means a slow network or a service that failed to start. Check the log above.";
  }
  return err?.message || "Installation failed. Check the log above for details.";
}

function openBrowser(url) {
  const command = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve) => {
    const child = spawn(command, [url], { shell: true, detached: true, stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function listInstalled() {
  const cwd = process.cwd();
  const entries = await readdir(cwd, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(cwd, entry.name, "onlinejourno-installer-manifest.json");
    const info = await stat(manifestPath).catch(() => null);
    if (!info) continue;
    try {
      const data = JSON.parse(await readFile(manifestPath, "utf-8"));
      manifests.push(data);
    } catch {
      // ignore malformed manifest
    }
  }
  return manifests.sort((a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime());
}

async function runUninstall(job, manifest) {
  const log = (line) => {
    const entry = { time: Date.now(), line };
    job.logs.push(entry);
    for (const res of job.listeners) {
      try {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      } catch {
        // Client disconnected.
      }
    }
  };

  try {
    job.status = "stopping";
    log(`Stopping ${manifest.product} containers…`);
    await runCommand("docker", ["compose", "down", "--volumes"], {
      cwd: manifest.projectRoot,
      onLine: (line) => log(line.trimEnd()),
    }).catch((err) => log(`Warning: ${err.message}`));

    job.status = "cleaning";
    log(`Removing project folder…`);
    await runCommand("rm", ["-rf", manifest.projectRoot], {
      onLine: (line) => log(line.trimEnd()),
    });

    job.status = "done";
    log("Uninstall complete.");
  } catch (err) {
    job.status = "failed";
    log(`ERROR: ${err.message || String(err)}`);
  } finally {
    job.listeners.forEach((res) => {
      try {
        res.write(`data: ${JSON.stringify({ time: Date.now(), done: true, status: job.status, result: null })}\n\n`);
        res.end();
      } catch {
        // ignore
      }
    });
    job.listeners = [];
  }
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
  const webPort = inputs.webPort || product.envDefaults?.WEB_PORT || "3000";
  const dbPort = inputs.dbPort || product.envDefaults?.DB_PORT || "5432";
  const postgresPassword = inputs.postgresPassword || product.envDefaults?.POSTGRES_PASSWORD || "onlinejourno";

  const header = [
    `# Generated by OnlineJourno Installer on ${new Date().toISOString()}`,
    `# Product: ${product.name}`,
    "",
  ];

  if (product.slug === "newsroom") {
    return (
      header.join("\n") +
      [
        "# === Required ===",
        `SESSION_SECRET=${inputs.sessionSecret}`,
        "",
        "# === Database ===",
        `DATABASE_URL=postgres://onlinejourno:${postgresPassword}@db:5432/onlinejourno`,
        `POSTGRES_PASSWORD=${postgresPassword}`,
        "",
        "# === Web app ===",
        `WEB_PORT=${webPort}`,
        `DB_PORT=${dbPort}`,
        `NEXT_PUBLIC_APP_URL=http://localhost:${webPort}`,
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
        "# === Optional SEO/connector keys ===",
        "# The newsroom supports multiple keyword/SEO/analytics providers. Leave unused ones blank.",
        "# In the admin UI, reference these env var names in the connector's 'secret_ref' field.",
        "",
        "# --- Keywords / SEO ---",
        `KEYWORDS_EVERYWHERE_API_KEY=${inputs.keywordsEverywhereApiKey || ""}`,
        `DATAFORSEO_LOGIN=${inputs.dataforseoLogin || ""}`,
        `DATAFORSEO_PASSWORD=${inputs.dataforseoPassword || ""}`,
        `NEWZDASH_API_KEY=${inputs.newzdashApiKey || ""}`,
        `SEOPANEL_BASE_URL=${inputs.seopanelBaseUrl || ""}`,
        `SEOPANEL_API_KEY=${inputs.seopanelApiKey || ""}`,
        "",
        "# --- Search Console ---",
        `GSC_SITE_URL=${inputs.gscSiteUrl || ""}`,
        `GSC_SERVICE_ACCOUNT_JSON=${inputs.gscServiceAccountJson || ""}`,
        "",
        "# --- Analytics ---",
        `GA4_PROPERTY_ID=${inputs.ga4PropertyId || ""}`,
        `GA4_SERVICE_ACCOUNT_JSON=${inputs.ga4ServiceAccountJson || ""}`,
        `CHARTBEAT_SITE=${inputs.chartbeatSite || ""}`,
        `CHARTBEAT_API_KEY=${inputs.chartbeatApiKey || ""}`,
        `MATOMO_BASE_URL=${inputs.matomoBaseUrl || ""}`,
        `MATOMO_SITE_ID=${inputs.matomoSiteId || ""}`,
        `MATOMO_API_TOKEN=${inputs.matomoApiToken || ""}`,
        `PLAUSIBLE_BASE_URL=${inputs.plausibleBaseUrl || ""}`,
        `PLAUSIBLE_SITE_ID=${inputs.plausibleSiteId || ""}`,
        `PLAUSIBLE_API_KEY=${inputs.plausibleApiKey || ""}`,
        `PIANO_AID=${inputs.pianoAid || ""}`,
        `PIANO_API_KEY=${inputs.pianoApiKey || ""}`,
        "",
        "# --- Trends ---",
        `GOOGLE_TRENDS_GEO=${inputs.googleTrendsGeo || ""}`,
        "",
        "# === Worker ===",
        "WORKER_CONCURRENCY=4",
        "WORKER_LOG_LEVEL=info",
        "",
        "# === Defaults ===",
        "DEFAULT_MODULES=source-intel,framing-pej",
        "DEFAULT_NEWSROOM_DAILY_BUDGET_USD=8",
      ].join("\n") +
      "\n"
    );
  }

  // Minimal env for FSL/MIT public products. Compose files can choose to honour
  // PORT / WEB_PORT / DB_PORT; if they don't, the defaults baked into the image
  // still work and the installer reports the documented default URL.
  return (
    header.join("\n") +
    [
      "# === Network ===",
      `WEB_PORT=${webPort}`,
      `PORT=${webPort}`,
      "",
      "# === Database (only used by products that ship Postgres) ===",
      `DB_PORT=${dbPort}`,
      `POSTGRES_PASSWORD=${postgresPassword}`,
      "",
      "# === Optional: add keys here after install if the product supports them ===",
      "# LLM_PROVIDER=anthropic",
      "# LLM_API_KEY=",
    ].join("\n") +
    "\n"
  );
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

    const targetUrl = `http://localhost:${inputs.webPort || product.envDefaults?.WEB_PORT || "3000"}`;
    job.status = "health-check";
    log(`Waiting for ${product.name} to respond at ${targetUrl}…`);
    try {
      await waitForHealth(targetUrl, { timeout: 120_000, interval: 2_000 });
      log(`${product.name} is responding.`);
    } catch (healthErr) {
      throw Object.assign(new Error(`${product.name} started but did not respond in time. Check the log above.`), {
        cause: healthErr,
      });
    }

    if (product.bootstrap) {
      job.status = "bootstrapping";
      log("Creating your newsroom and admin account…");
      await runCommand("docker", ["compose", "run", "--rm", "-e", `ADMIN_EMAIL=${inputs.adminEmail}`, "-e", `ADMIN_PASSWORD=${inputs.adminPassword}`, "-e", `OUTLET_NAME=${inputs.outletName}`, "-e", `OUTLET_SLUG=${inputs.outletSlug || "self"}`, product.bootstrap.service, ...product.bootstrap.command], {
        cwd: projectRoot,
        onLine: (line) => log(line.trimEnd()),
      });
    }

    job.status = "done";
    job.result = {
      url: `http://localhost:${inputs.webPort || product.envDefaults?.WEB_PORT || "3000"}`,
      adminEmail: inputs.adminEmail || null,
      projectRoot,
    };
    log("Installation complete.");

    if (inputs.openBrowser !== false) {
      log(`Opening ${job.result.url} in your browser…`);
      const opened = await openBrowser(job.result.url);
      if (!opened) log("Could not open browser automatically. Use the link above.");
    }
  } catch (err) {
    job.status = "failed";
    const message = classifyInstallError(err, product);
    log(`ERROR: ${message}`);
    if (err?.stderr) log(err.stderr);
    if (err?.stdout) log(err.stdout);
    job.error = message;
  } finally {
    job.listeners.forEach((res) => {
      try {
        res.write(`data: ${JSON.stringify({ time: Date.now(), done: true, status: job.status, result: job.result, error: job.error || null })}\n\n`);
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
        needsAdmin: !!p.needsAdmin,
        defaultWebPort: p.envDefaults?.WEB_PORT || null,
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

  // API: port availability check.
  if (pathname === "/api/port-check" && req.method === "GET") {
    const port = Number(url.searchParams.get("port"));
    if (!port || port < 1024 || port > 65535) {
      return sendError(res, 400, "Invalid port");
    }
    const free = await isPortFree(port);
    send(res, 200, { ok: free, port, free });
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
    if (product.licence === "Proprietary" && !isValidLicenseKey(inputs.licenseKey)) {
      return sendError(res, 403, "A valid licence key is required for this product");
    }
    if (product.needsAdmin && (!inputs.adminEmail || !inputs.adminPassword || !inputs.outletName)) {
      return sendError(res, 400, "Missing required fields");
    }

    const webPort = Number(inputs.webPort || product.envDefaults?.WEB_PORT || "3000");
    if (!(await isPortFree(webPort))) {
      return sendError(res, 409, `Port ${webPort} is already in use. Choose a different port.`);
    }

    const projectRoot = resolve(process.cwd(), product.slug);
    if (await fileExists(join(projectRoot, product.composeFile)).catch(() => false)) {
      return sendError(res, 409, `A ${product.name} folder already exists here. Delete it or install in a different directory.`);
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

  // API: list installed products.
  if (pathname === "/api/installed" && req.method === "GET") {
    const installed = await listInstalled();
    send(res, 200, { ok: true, installed });
    return;
  }

  // API: uninstall a product.
  if (pathname === "/api/uninstall" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let inputs;
    try {
      inputs = JSON.parse(body);
    } catch {
      return sendError(res, 400, "Invalid JSON body");
    }

    const installed = await listInstalled();
    const manifest = installed.find((m) => m.product === inputs.product);
    if (!manifest) return sendError(res, 404, "Product not found in this directory");

    const id = randomUUID();
    const job = {
      id,
      status: "queued",
      logs: [],
      listeners: [],
      result: null,
    };
    jobs.set(id, job);

    runUninstall(job, manifest);
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
      res.write(`data: ${JSON.stringify({ time: Date.now(), done: true, status: job.status, result: job.result, error: job.error || null })}\n\n`);
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
    send(res, 200, { ok: true, status: job.status, result: job.result, error: job.error || null });
    return;
  }

  sendError(res, 404, "Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`OnlineJourno Installer running at http://${HOST}:${PORT}`);
});
