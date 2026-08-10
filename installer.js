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

const steps = ["welcome", "products", "gated", "config", "review", "progress", "done"];

const els = {
  wizard: document.getElementById("wizard"),
  checks: document.getElementById("checks"),
  prereqHelp: document.getElementById("prereq-help"),
  btnCheck: document.getElementById("btn-check"),
  btnStart: document.getElementById("btn-start"),
  products: document.getElementById("products"),
  btnProductNext: document.getElementById("btn-product-next"),
  gatedBody: document.getElementById("gated-body"),
  btnRequest: document.getElementById("btn-request"),
  configForm: document.getElementById("config-form"),
  configTitle: document.getElementById("config-title"),
  configDeck: document.getElementById("config-deck"),
  licenseFieldset: document.getElementById("license-fieldset"),
  newsroomFieldset: document.getElementById("newsroom-fieldset"),
  adminFieldset: document.getElementById("admin-fieldset"),
  portsFieldset: document.getElementById("ports-fieldset"),
  btnCheckPort: document.getElementById("btn-check-port"),
  portCheckStatus: document.getElementById("port-check-status"),
  llmFieldset: document.getElementById("llm-fieldset"),
  connectorsFieldset: document.getElementById("connectors-fieldset"),
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
    .map((p) => {
      const isSelectable = !p.comingSoon && !p.gated;
      const badge = p.gated
        ? `<span class="oj-product__badge">Request access</span>`
        : p.comingSoon
        ? `<span class="oj-product__badge">Coming soon</span>`
        : `<span class="oj-product__badge oj-product__badge--available">Available</span>`;
      return `
      <label class="oj-product ${isSelectable ? "oj-product--selectable" : "oj-product--disabled"}" data-slug="${p.slug}">
        <input type="radio" name="product" value="${p.slug}" class="oj-product__radio" ${isSelectable ? "" : "disabled"}>
        <div>
          <p class="oj-product__name">${escapeHtml(p.name)}</p>
          <p class="oj-product__meta">${escapeHtml(p.licence)}</p>
          <p class="oj-product__desc">${escapeHtml(p.description)}</p>
        </div>
        ${badge}
      </label>
    `;
    })
    .join("");

  els.products.querySelectorAll(".oj-product").forEach((card) => {
    const radio = card.querySelector('input[type="radio"]');
    if (radio.disabled) return;
    card.addEventListener("click", () => {
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
  const product = state.products.find((p) => p.slug === state.selectedProduct);
  const cfg = {
    webPort: data.get("webPort"),
    licenseKey: data.get("licenseKey")?.trim() || "",
  };

  if (product?.needsAdmin) {
    cfg.outletName = data.get("outletName").trim();
    cfg.outletSlug = data.get("outletSlug").trim() || "self";
    cfg.adminEmail = data.get("adminEmail").trim();
    cfg.adminPassword = data.get("adminPassword");
    cfg.dbPort = data.get("dbPort");
    cfg.llmProvider = data.get("llmProvider");
    cfg.llmApiKey = data.get("llmApiKey").trim();
    cfg.openaiBaseUrl = data.get("openaiBaseUrl").trim();
    cfg.keywordsEverywhereApiKey = data.get("keywordsEverywhereApiKey")?.trim() || "";
    cfg.dataforseoLogin = data.get("dataforseoLogin")?.trim() || "";
    cfg.dataforseoPassword = data.get("dataforseoPassword")?.trim() || "";
  }

  return cfg;
}

function renderReview() {
  const c = state.config;
  const p = state.products.find((x) => x.slug === state.selectedProduct);
  const licenseLine = p.licence === "Proprietary" && !p.gated
    ? `<dt>Licence key</dt><dd>${c.licenseKey ? "Provided" : "Missing"}</dd>`
    : "";
  const hasConnectorKey = c.keywordsEverywhereApiKey || c.dataforseoLogin || c.dataforseoPassword;
  const adminLines = p.needsAdmin
    ? `
      <dt>Newsroom</dt><dd>${escapeHtml(c.outletName)}</dd>
      <dt>Admin email</dt><dd>${escapeHtml(c.adminEmail)}</dd>
      <dt>Database port</dt><dd>${escapeHtml(c.dbPort)}</dd>
      <dt>LLM provider</dt><dd>${escapeHtml(c.llmProvider)} ${c.llmApiKey ? "(key set)" : "(skipped)"}</dd>
      <dt>SEO connectors</dt><dd>${hasConnectorKey ? "Key(s) set" : "Skipped"}</dd>
    `
    : "";
  els.review.innerHTML = `
    <dl>
      <dt>Product</dt><dd>${escapeHtml(p.name)}</dd>
      ${adminLines}
      <dt>Web URL</dt><dd>http://localhost:${escapeHtml(c.webPort)}</dd>
      ${licenseLine}
    </dl>
  `;
}

async function checkPort() {
  const port = els.configForm.querySelector("[name='webPort']")?.value;
  if (!port) return false;

  els.btnCheckPort.disabled = true;
  els.portCheckStatus.textContent = "Checking…";
  els.portCheckStatus.className = "oj-port-check__status";

  try {
    const { free } = await api(`/api/port-check?port=${encodeURIComponent(port)}`);
    if (free) {
      els.portCheckStatus.textContent = `Port ${port} is available`;
      els.portCheckStatus.classList.add("is-pass");
      return true;
    }
    els.portCheckStatus.textContent = `Port ${port} is already in use`;
    els.portCheckStatus.classList.add("is-fail");
    return false;
  } catch (err) {
    els.portCheckStatus.textContent = err.message || "Could not check port";
    els.portCheckStatus.classList.add("is-fail");
    return false;
  } finally {
    els.btnCheckPort.disabled = false;
  }
}

async function validateConfig() {
  const product = state.products.find((p) => p.slug === state.selectedProduct);
  const formValid = els.configForm.reportValidity();
  if (!formValid) return false;

  if (product?.licence === "Proprietary" && !product.gated) {
    const key = els.configForm.querySelector("[name='licenseKey']")?.value.trim() || "";
    if (!isValidLicenseKey(key)) {
      alert("Please enter a valid Newsroom licence key (format: OJNR-XXXX-XXXX-XXXX-XXXX).");
      return false;
    }
  }

  const portFree = await checkPort();
  if (!portFree) {
    alert("The chosen web port is not available. Pick a different port or check what is using it.");
    return false;
  }
  return true;
}

function isValidLicenseKey(key) {
  return /^OJNR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
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
      showDone(data.status === "done", data.result, data.error);
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
  else if (line.includes("health-check")) setProgress(70, "Waiting for service to respond");
  else if (line.includes("bootstrap")) setProgress(85, "Creating admin account");
  else if (line.includes("complete")) setProgress(100, "Finishing");
}

function showDone(ok, result = null, error = null) {
  const product = state.products.find((p) => p.slug === state.selectedProduct);
  const productName = product?.name || "OnlineJourno";

  if (ok && result) {
    els.doneTitle.textContent = "Installation complete";
    if (product?.needsAdmin) {
      els.doneBody.innerHTML = `
        <p><strong>${escapeHtml(productName)} is ready.</strong></p>
        <p>Open <code>${escapeHtml(result.url)}</code> and sign in with:</p>
        <p>Email: <strong>${escapeHtml(result.adminEmail)}</strong><br>Password: <strong>the password you entered</strong></p>
      `;
    } else {
      els.doneBody.innerHTML = `
        <p><strong>${escapeHtml(productName)} is ready.</strong></p>
        <p>Open <code>${escapeHtml(result.url)}</code> in your browser.</p>
        <p>This public product has no admin step. See the repo README for next steps.</p>
      `;
    }
    els.doneLink.href = result.url;
    els.doneLink.hidden = false;
    els.doneLink.textContent = `Open ${escapeHtml(productName)}`;
  } else {
    els.doneTitle.textContent = "Installation failed";
    const reason = error
      ? `<p><strong>${escapeHtml(error)}</strong></p>`
      : "<p>Something went wrong. Check the log above for details.</p>";
    els.doneBody.innerHTML = `
      ${reason}
      <p>Common fixes:</p>
      <ul>
        <li>Make sure Docker Desktop is running.</li>
        <li>Make sure port ${escapeHtml(state.config.webPort || product?.defaultWebPort || "3000")} is free.</li>
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

function configureFormForProduct(product) {
  const needsAdmin = !!product.needsAdmin;
  const needsKey = product.licence === "Proprietary" && !product.gated;

  els.configTitle.textContent = needsAdmin ? "Configure your newsroom" : `Configure ${product.name}`;
  els.configDeck.textContent = needsAdmin
    ? "These values are stored only in the .env file on your machine."
    : "This public product needs almost no configuration. Pick a port and install.";

  if (els.newsroomFieldset) {
    els.newsroomFieldset.hidden = !needsAdmin;
    els.newsroomFieldset.querySelectorAll("[name]").forEach((el) => {
      el.required = needsAdmin && el.name !== "outletSlug";
    });
  }

  if (els.adminFieldset) {
    els.adminFieldset.hidden = !needsAdmin;
    els.adminFieldset.querySelectorAll("[name]").forEach((el) => {
      el.required = needsAdmin;
    });
  }

  if (els.portsFieldset) {
    els.portsFieldset.hidden = false;
    const webPortInput = els.portsFieldset.querySelector("[name='webPort']");
    if (webPortInput) webPortInput.value = product.defaultWebPort || "3000";
    const dbPortInput = els.portsFieldset.querySelector("[name='dbPort']");
    if (dbPortInput) dbPortInput.required = needsAdmin;
  }

  if (els.llmFieldset) {
    els.llmFieldset.hidden = !needsAdmin;
  }

  if (els.connectorsFieldset) {
    els.connectorsFieldset.hidden = !needsAdmin;
  }

  if (els.licenseFieldset) {
    els.licenseFieldset.hidden = !needsKey;
    const keyInput = els.licenseFieldset.querySelector("[name='licenseKey']");
    if (keyInput) keyInput.required = needsKey;
  }
}

els.btnProductNext.addEventListener("click", () => {
  const product = state.products.find((p) => p.slug === state.selectedProduct);
  if (product?.gated) {
    els.gatedBody.innerHTML = `
      <p><strong>${escapeHtml(product.name)}</strong> is a proprietary OnlineJourno product.</p>
      <p>To install it in your newsroom, request access. The OnlineJourno team will review your request and follow up.</p>
    `;
    els.btnRequest.href = product.requestUrl || "https://onlinejourno.com/contact/";
    showStep("gated");
  } else {
    configureFormForProduct(product);
    showStep("config");
  }
});

els.btnCheckPort?.addEventListener("click", checkPort);

els.btnConfigNext.addEventListener("click", async () => {
  if (!(await validateConfig())) return;
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
