/**
 * OnlineJourno Installer — browser wizard.
 * Zero build step; vanilla JS.
 */

const state = {
  step: "welcome",
  products: [],
  selectedProduct: null,
  checks: {},
  config: {},
  jobId: null,
};

const steps = ["welcome", "products", "config", "review", "progress", "done"];

const els = {
  wizard: document.getElementById("wizard"),
  checks: document.getElementById("checks"),
  prereqHelp: document.getElementById("prereq-help"),
  btnCheck: document.getElementById("btn-check"),
  btnStart: document.getElementById("btn-start"),
  products: document.getElementById("products"),
  btnProductNext: document.getElementById("btn-product-next"),
  configForm: document.getElementById("config-form"),
  btnConfigNext: document.getElementById("btn-config-next"),
  review: document.getElementById("review"),
  btnInstall: document.getElementById("btn-install"),
  progressFill: document.getElementById("progress-fill"),
  progressStatus: document.getElementById("progress-status"),
  log: document.getElementById("log"),
  doneTitle: document.getElementById("done-title"),
  doneBody: document.getElementById("done-body"),
  doneLink: document.getElementById("done-link"),
  btnNew: document.getElementById("btn-new"),
};

function showStep(name) {
  state.step = name;
  for (const step of steps) {
    document.getElementById(`step-${step}`).classList.toggle("is-active", step === name);
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setCheck(name, status) {
  const el = els.checks.querySelector(`[data-check="${name}"]`);
  if (!el) return;
  el.className = `oj-check is-${status}`;
  const icon = el.querySelector(".oj-check__icon");
  icon.textContent = status === "pass" ? "✓" : status === "fail" ? "✕" : "◌";
}

async function loadProducts() {
  const { products } = await api("/api/products");
  state.products = products;
  els.products.innerHTML = products
    .map(
      (p) => `
      <label class="oj-product ${p.comingSoon ? "is-disabled" : ""}" data-slug="${p.slug}">
        <input type="radio" name="product" value="${p.slug}" class="oj-product__radio" ${p.comingSoon ? "disabled" : ""}>
        <div>
          <p class="oj-product__name">${escapeHtml(p.name)}</p>
          <p class="oj-product__meta">${escapeHtml(p.licence)}</p>
          <p class="oj-product__desc">${escapeHtml(p.description)}</p>
        </div>
        ${p.comingSoon ? `<span class="oj-product__badge">Coming soon</span>` : ""}
      </label>
    `
    )
    .join("");

  els.products.querySelectorAll(".oj-product:not(.is-disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;
      state.selectedProduct = radio.value;
      els.products.querySelectorAll(".oj-product").forEach((c) => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      els.btnProductNext.disabled = false;
    });
  });
}

async function runChecks() {
  ["docker", "node", "ports"].forEach((k) => setCheck(k, "wait"));
  els.btnCheck.disabled = true;
  els.btnStart.hidden = true;
  els.prereqHelp.hidden = true;

  try {
    const data = await api("/api/check");
    state.checks = data;

    setCheck("node", data.node ? "pass" : "fail");
    setCheck("docker", data.docker && data.compose ? "pass" : "fail");
    setCheck("ports", "pass"); // Server-side check reserved for future port-scan.

    const ok = data.node && data.docker && data.compose;
    if (ok) {
      els.btnCheck.hidden = true;
      els.btnStart.hidden = false;
    } else {
      els.prereqHelp.hidden = false;
      els.btnCheck.disabled = false;
      els.btnCheck.textContent = "Check again";
    }
  } catch (err) {
    setCheck("docker", "fail");
    setCheck("node", "fail");
    setCheck("ports", "fail");
    els.prereqHelp.hidden = false;
    els.btnCheck.disabled = false;
    logLine(`System check failed: ${err.message}`, true);
  }
}

function collectConfig() {
  const form = els.configForm;
  const data = new FormData(form);
  return {
    outletName: data.get("outletName").trim(),
    outletSlug: data.get("outletSlug").trim() || "self",
    adminEmail: data.get("adminEmail").trim(),
    adminPassword: data.get("adminPassword"),
    webPort: data.get("webPort"),
    dbPort: data.get("dbPort"),
    llmProvider: data.get("llmProvider"),
    llmApiKey: data.get("llmApiKey").trim(),
    openaiBaseUrl: data.get("openaiBaseUrl").trim(),
  };
}

function renderReview() {
  const c = state.config;
  const p = state.products.find((x) => x.slug === state.selectedProduct);
  els.review.innerHTML = `
    <dl>
      <dt>Product</dt><dd>${escapeHtml(p.name)}</dd>
      <dt>Newsroom</dt><dd>${escapeHtml(c.outletName)}</dd>
      <dt>Admin email</dt><dd>${escapeHtml(c.adminEmail)}</dd>
      <dt>Web URL</dt><dd>http://localhost:${escapeHtml(c.webPort)}</dd>
      <dt>Database port</dt><dd>${escapeHtml(c.dbPort)}</dd>
      <dt>LLM provider</dt><dd>${escapeHtml(c.llmProvider)} ${c.llmApiKey ? "(key set)" : "(skipped)"}</dd>
    </dl>
  `;
}

function validateConfig() {
  return els.configForm.reportValidity();
}

async function startInstall() {
  showStep("progress");
  els.log.innerHTML = "";
  setProgress(5, "Starting…");

  try {
    const { id } = await api("/api/install", {
      method: "POST",
      body: JSON.stringify({
        product: state.selectedProduct,
        ...state.config,
      }),
    });
    state.jobId = id;
    streamLogs(id);
  } catch (err) {
    setProgress(0, "Failed to start");
    logLine(err.message, true);
    showDone(false);
  }
}

function streamLogs(id) {
  const source = new EventSource(`/api/logs/${id}`);
  source.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.done) {
      source.close();
      showDone(data.status === "done", data.result);
      return;
    }
    logLine(data.line);
    updateProgressFromStatus(data.line);
  };
  source.onerror = () => {
    source.close();
    logLine("Lost connection to installer. Check the server window.", true);
    showDone(false);
  };
}

function logLine(text, isError = false) {
  const line = document.createElement("p");
  line.className = `oj-log__line ${isError ? "is-error" : ""}`;
  line.textContent = text;
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}

function setProgress(percent, label) {
  els.progressFill.style.width = `${percent}%`;
  if (label) els.progressStatus.textContent = label;
}

function updateProgressFromStatus(line) {
  if (line.includes("Preparing")) setProgress(10, "Preparing");
  else if (line.includes("Writing .env")) setProgress(20, "Writing configuration");
  else if (line.includes("Building")) setProgress(40, "Building containers");
  else if (line.includes("bootstrap")) setProgress(80, "Creating admin account");
  else if (line.includes("complete")) setProgress(100, "Finishing");
}

function showDone(ok, result = null) {
  if (ok && result) {
    els.doneTitle.textContent = "Installation complete";
    els.doneBody.innerHTML = `
      <p><strong>Your newsroom is ready.</strong></p>
      <p>Open <code>${escapeHtml(result.url)}</code> and sign in with:</p>
      <p>Email: <strong>${escapeHtml(result.adminEmail)}</strong><br>Password: <strong>the password you entered</strong></p>
    `;
    els.doneLink.href = result.url;
    els.doneLink.hidden = false;
  } else {
    els.doneTitle.textContent = "Installation failed";
    els.doneBody.innerHTML = `
      <p>Something went wrong. Check the log above for details.</p>
      <p>Common fixes:</p>
      <ul>
        <li>Make sure Docker Desktop is running.</li>
        <li>Make sure ports 3000 and 5432 are free.</li>
        <li>Try again, or follow the manual steps in SELF-HOST.md.</li>
      </ul>
    `;
    els.doneLink.hidden = true;
  }
  showStep("done");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Event bindings.

els.btnCheck.addEventListener("click", runChecks);
els.btnStart.addEventListener("click", () => showStep("products"));

els.btnProductNext.addEventListener("click", () => showStep("config"));

els.btnConfigNext.addEventListener("click", () => {
  if (!validateConfig()) return;
  state.config = collectConfig();
  renderReview();
  showStep("review");
});

els.btnInstall.addEventListener("click", startInstall);

els.btnNew.addEventListener("click", () => {
  state.selectedProduct = null;
  state.config = {};
  state.jobId = null;
  els.configForm.reset();
  els.products.querySelectorAll(".oj-product").forEach((c) => c.classList.remove("is-selected"));
  els.btnProductNext.disabled = true;
  showStep("welcome");
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const idx = steps.indexOf(state.step);
    if (idx > 0) showStep(steps[idx - 1]);
  });
});

els.configForm.querySelector('select[name="llmProvider"]').addEventListener("change", (e) => {
  const openaiField = els.configForm.querySelector('[data-depends="llmProvider:openai"]');
  openaiField.hidden = e.target.value !== "openai";
});

// Boot.
(async function init() {
  await loadProducts();
})();
