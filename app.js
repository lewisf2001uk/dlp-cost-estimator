const SETTINGS_KEY = "dlp-cost-estimator.settings";
const RATE_KEY = "dlp-cost-estimator.rate-cache";
const DEFAULT_SETTINGS = {
  passDiscountPct: 15,
  vatRatePct: 20,
  vatRefundSharePct: 80,
  defaultPassSelected: true,
};

const state = {
  settings: loadSettings(),
  ui: {
    itemPrice: "",
    applyPassDiscount: false,
    applySkipTax: true,
    view: "calculator",
  },
  rate: loadCachedRate(),
  rateStatus: {
    kind: "loading",
  },
  install: {
    deferredPrompt: null,
    canPrompt: false,
    isStandalone: isStandaloneMode(),
    isIos: isIosDevice(),
  },
};

state.ui.applyPassDiscount = state.settings.defaultPassSelected;

const eurFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

const elements = {
  priceInput: document.querySelector("#item-price"),
  applyPassInput: document.querySelector("#apply-pass"),
  applySkipTaxInput: document.querySelector("#apply-skiptax"),
  finalGbp: document.querySelector("#final-gbp"),
  finalEur: document.querySelector("#final-eur"),
  resultSubtext: document.querySelector("#result-subtext"),
  lineBase: document.querySelector("#line-base"),
  lineDiscount: document.querySelector("#line-discount"),
  lineDiscounted: document.querySelector("#line-discounted"),
  lineVat: document.querySelector("#line-vat"),
  lineRefund: document.querySelector("#line-refund"),
  lineFinalEur: document.querySelector("#line-final-eur"),
  rateDisplay: document.querySelector("#rate-display"),
  rateDescription: document.querySelector("#rate-description"),
  rateNote: document.querySelector("#rate-note"),
  rateStatusPill: document.querySelector("#rate-status-pill"),
  refreshRateButton: document.querySelector("#refresh-rate"),
  passDiscountInput: document.querySelector("#setting-pass-discount"),
  vatRateInput: document.querySelector("#setting-vat-rate"),
  vatRefundShareInput: document.querySelector("#setting-vat-refund-share"),
  defaultPassInput: document.querySelector("#setting-default-pass"),
  resetSettingsButton: document.querySelector("#reset-settings"),
  tabs: [...document.querySelectorAll("[data-view-target]")],
  views: [...document.querySelectorAll("[data-view]")],
  installBanner: document.querySelector("#install-banner"),
  installTitle: document.querySelector("#install-title"),
  installCopy: document.querySelector("#install-copy"),
  installButton: document.querySelector("#install-button"),
};

hydrateControls();
bindEvents();
render();
fetchLatestRate({ silent: false });
registerServiceWorker();

function bindEvents() {
  elements.priceInput.addEventListener("input", (event) => {
    state.ui.itemPrice = event.target.value;
    renderCalculation();
  });

  elements.applyPassInput.addEventListener("change", (event) => {
    state.ui.applyPassDiscount = event.target.checked;
    renderCalculation();
  });

  elements.applySkipTaxInput.addEventListener("change", (event) => {
    state.ui.applySkipTax = event.target.checked;
    renderCalculation();
  });

  elements.refreshRateButton.addEventListener("click", () => {
    fetchLatestRate({ silent: false });
  });

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.ui.view = tab.dataset.viewTarget;
      renderView();
    });
  });

  elements.passDiscountInput.addEventListener("input", () => {
    updateSetting("passDiscountPct", elements.passDiscountInput.value);
  });

  elements.vatRateInput.addEventListener("input", () => {
    updateSetting("vatRatePct", elements.vatRateInput.value);
  });

  elements.vatRefundShareInput.addEventListener("input", () => {
    updateSetting("vatRefundSharePct", elements.vatRefundShareInput.value);
  });

  elements.defaultPassInput.addEventListener("change", () => {
    state.settings.defaultPassSelected = elements.defaultPassInput.checked;
    persistSettings();
  });

  elements.resetSettingsButton.addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    persistSettings();
    syncSettingsInputs();
    render();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.install.deferredPrompt = event;
    state.install.canPrompt = true;
    renderInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    state.install.canPrompt = false;
    state.install.deferredPrompt = null;
    state.install.isStandalone = true;
    renderInstallBanner();
  });

  elements.installButton.addEventListener("click", async () => {
    if (!state.install.deferredPrompt) {
      return;
    }

    state.install.deferredPrompt.prompt();
    await state.install.deferredPrompt.userChoice.catch(() => null);
    state.install.deferredPrompt = null;
    state.install.canPrompt = false;
    renderInstallBanner();
  });
}

function hydrateControls() {
  elements.priceInput.value = state.ui.itemPrice;
  elements.applyPassInput.checked = state.ui.applyPassDiscount;
  elements.applySkipTaxInput.checked = state.ui.applySkipTax;
  syncSettingsInputs();
}

function syncSettingsInputs() {
  elements.passDiscountInput.value = state.settings.passDiscountPct;
  elements.vatRateInput.value = state.settings.vatRatePct;
  elements.vatRefundShareInput.value = state.settings.vatRefundSharePct;
  elements.defaultPassInput.checked = state.settings.defaultPassSelected;
}

function updateSetting(key, rawValue) {
  const numericValue = Number.parseFloat(rawValue);

  if (!Number.isFinite(numericValue)) {
    return;
  }

  state.settings[key] = clamp(numericValue, 0, 100);
  persistSettings();
  syncSettingsInputs();
  renderCalculation();
}

function render() {
  renderView();
  renderCalculation();
  renderRate();
  renderInstallBanner();
}

function renderView() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.viewTarget === state.ui.view);
  });

  elements.views.forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === state.ui.view);
  });
}

function renderCalculation() {
  const amount = parseAmount(state.ui.itemPrice);
  const calculation = calculateEstimate({
    amount,
    settings: state.settings,
    applyPassDiscount: state.ui.applyPassDiscount,
    applyVatRefund: state.ui.applySkipTax,
    rate: state.rate?.rate ?? null,
  });

  elements.lineBase.textContent = formatEur(calculation.baseAmount);
  elements.lineDiscount.textContent =
    calculation.discountAmount > 0 ? `-${formatEur(calculation.discountAmount)}` : formatEur(0);
  elements.lineDiscounted.textContent = formatEur(calculation.discountedAmount);
  elements.lineVat.textContent = formatEur(calculation.vatAmount);
  elements.lineRefund.textContent =
    calculation.vatRefundAmount > 0 ? `-${formatEur(calculation.vatRefundAmount)}` : formatEur(0);
  elements.lineFinalEur.textContent = formatEur(calculation.finalEur);
  elements.finalEur.textContent = formatEur(calculation.finalEur);

  if (calculation.finalGbp === null) {
    elements.finalGbp.textContent = "GBP unavailable";
  } else {
    elements.finalGbp.textContent = formatGbp(calculation.finalGbp);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    elements.resultSubtext.textContent =
      "Enter a shelf price in Euros to see the Gold Pass, SkipTax, and GBP estimate.";
    return;
  }

  const passText = state.ui.applyPassDiscount
    ? `Gold Pass applied at ${formatPct(state.settings.passDiscountPct)}.`
    : "Gold Pass not applied.";
  const skipTaxText = state.ui.applySkipTax
    ? `SkipTax included at ${formatPct(state.settings.vatRefundSharePct)}.`
    : "SkipTax not applied.";
  const rateText = state.rate?.date
    ? `GBP uses the saved rate from ${formatApiDate(state.rate.date)}.`
    : "Save an exchange rate in Settings to enable GBP conversions.";

  elements.resultSubtext.textContent = `${passText} ${skipTaxText} ${rateText}`;
}

function renderRate() {
  if (state.rate?.rate) {
    const rateValue = Number(state.rate.rate);
    elements.rateDisplay.textContent = `1 EUR = ${rateValue.toFixed(5)} GBP`;
  } else {
    elements.rateDisplay.textContent = "1 EUR = -- GBP";
  }

  const status = state.rateStatus.kind;
  elements.rateStatusPill.textContent = rateStatusLabel(status);

  if (status === "loading") {
    elements.rateDescription.textContent = "Fetching the latest EUR to GBP rate...";
    elements.rateNote.textContent = "If the refresh fails, the app will keep using the last saved rate.";
    return;
  }

  if (status === "live" && state.rate) {
    const savedAt = state.rate.fetchedAt
      ? timeFormatter.format(new Date(state.rate.fetchedAt))
      : "just now";
    elements.rateDescription.textContent = state.rate.date
      ? `Latest ECB-backed rate saved successfully for ${formatApiDate(state.rate.date)}.`
      : "Latest ECB-backed rate saved successfully.";
    elements.rateNote.textContent = `Saved locally at ${savedAt} for offline use in the parks.`;
    return;
  }

  if (status === "cached" && state.rate) {
    elements.rateDescription.textContent = state.rate.date
      ? `Live refresh failed, so the app is using the saved rate from ${formatApiDate(state.rate.date)}.`
      : "Live refresh failed, so the app is using the last saved rate.";
    elements.rateNote.textContent = state.rate.fetchedAt
      ? `That saved rate was stored locally on ${timeFormatter.format(new Date(state.rate.fetchedAt))}.`
      : "Saved locally for offline use.";
    return;
  }

  elements.rateDescription.textContent = "No exchange rate is available yet.";
  elements.rateNote.textContent = "Connect briefly to the internet so the app can save a rate for later use.";
}

function renderInstallBanner() {
  const { isStandalone, isIos, canPrompt } = state.install;
  const shouldShow = !isStandalone && (isIos || canPrompt);

  elements.installBanner.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    return;
  }

  if (canPrompt) {
    elements.installTitle.textContent = "Install this estimator";
    elements.installCopy.textContent =
      "On Android and supported browsers, you can install the app for faster park-side access.";
    elements.installButton.classList.remove("hidden");
    return;
  }

  if (isIos) {
    elements.installTitle.textContent = "Install on iPhone";
    elements.installCopy.textContent =
      "Open this page in Safari, tap Share, then choose Add to Home Screen.";
    elements.installButton.classList.add("hidden");
  }
}

async function fetchLatestRate({ silent }) {
  if (!silent) {
    state.rateStatus = { kind: "loading" };
    renderRate();
  }

  try {
    const response = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=GBP", {
      mode: "cors",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Rate request failed with ${response.status}`);
    }

    const payload = await response.json();
    const rate = payload?.rates?.GBP;

    if (!Number.isFinite(rate)) {
      throw new Error("GBP rate missing from response");
    }

    state.rate = {
      rate,
      date: payload.date,
      fetchedAt: new Date().toISOString(),
      source: "Frankfurter (ECB-backed)",
    };
    persistRate();
    state.rateStatus = { kind: "live" };
  } catch (error) {
    if (state.rate?.rate) {
      state.rateStatus = { kind: "cached", error: getErrorMessage(error) };
    } else {
      state.rateStatus = { kind: "error", error: getErrorMessage(error) };
    }
  }

  renderRate();
  renderCalculation();
}

function calculateEstimate({ amount, settings, applyPassDiscount, applyVatRefund, rate }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      baseAmount: 0,
      discountAmount: 0,
      discountedAmount: 0,
      vatAmount: 0,
      vatRefundAmount: 0,
      finalEur: 0,
      finalGbp: Number.isFinite(rate) ? 0 : null,
    };
  }

  const discountRate = applyPassDiscount ? settings.passDiscountPct / 100 : 0;
  const discountedAmount = amount * (1 - discountRate);
  const discountAmount = amount - discountedAmount;
  const vatAmount = discountedAmount * (settings.vatRatePct / (100 + settings.vatRatePct));
  const vatRefundAmount = applyVatRefund ? vatAmount * (settings.vatRefundSharePct / 100) : 0;
  const finalEur = discountedAmount - vatRefundAmount;
  const finalGbp = Number.isFinite(rate) ? finalEur * rate : null;

  return {
    baseAmount: amount,
    discountAmount,
    discountedAmount,
    vatAmount,
    vatRefundAmount,
    finalEur,
    finalGbp,
  };
}

function parseAmount(value) {
  if (typeof value !== "string") {
    return Number.NaN;
  }

  const cleaned = value.trim().replace(/[^\d.,]/g, "");

  if (!cleaned) {
    return Number.NaN;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    normalized = cleaned.split(groupingSeparator).join("").replace(decimalSeparator, ".");
  } else if (lastComma !== -1) {
    normalized = normalizeSingleSeparatorNumber(cleaned, ",");
  } else if (lastDot !== -1) {
    normalized = normalizeSingleSeparatorNumber(cleaned, ".");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function loadSettings() {
  const raw = readJson(SETTINGS_KEY);

  return {
    passDiscountPct: sanitizePercent(raw?.passDiscountPct, DEFAULT_SETTINGS.passDiscountPct),
    vatRatePct: sanitizePercent(raw?.vatRatePct, DEFAULT_SETTINGS.vatRatePct),
    vatRefundSharePct: sanitizePercent(raw?.vatRefundSharePct, DEFAULT_SETTINGS.vatRefundSharePct),
    defaultPassSelected:
      typeof raw?.defaultPassSelected === "boolean"
        ? raw.defaultPassSelected
        : DEFAULT_SETTINGS.defaultPassSelected,
  };
}

function loadCachedRate() {
  const raw = readJson(RATE_KEY);

  if (!Number.isFinite(raw?.rate)) {
    return null;
  }

  return {
    rate: raw.rate,
    date: raw.date ?? null,
    fetchedAt: raw.fetchedAt ?? null,
    source: raw.source ?? "Saved rate",
  };
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // Local persistence is best-effort only.
  }
}

function persistRate() {
  try {
    localStorage.setItem(RATE_KEY, JSON.stringify(state.rate));
  } catch {
    // Local persistence is best-effort only.
  }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sanitizePercent(value, fallback) {
  return Number.isFinite(value) ? clamp(value, 0, 100) : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSingleSeparatorNumber(value, separator) {
  const parts = value.split(separator);

  if (parts.length === 1) {
    return value;
  }

  const fraction = parts[parts.length - 1];
  const whole = parts.slice(0, -1).join("");
  const looksLikeGrouping = fraction.length === 3 && whole.length > 0;

  return looksLikeGrouping ? `${whole}${fraction}` : `${whole}.${fraction}`;
}

function formatEur(value) {
  return eurFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatGbp(value) {
  return gbpFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPct(value) {
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatApiDate(value) {
  if (typeof value !== "string") {
    return "the latest saved rate";
  }

  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return dateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

function rateStatusLabel(kind) {
  switch (kind) {
    case "live":
      return "Live rate";
    case "cached":
      return "Using saved rate";
    case "error":
      return "Rate unavailable";
    default:
      return "Loading rate";
  }
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (isLocalDevelopmentHost()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {
        // Ignore local cleanup failures.
      });

      if ("caches" in window) {
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("dlp-cost-estimator-"))
              .map((key) => caches.delete(key)),
          ),
        ).catch(() => {
          // Ignore local cache cleanup failures.
        });
      }
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Service worker registration is a progressive enhancement.
    });
  });
}

function isLocalDevelopmentHost() {
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
