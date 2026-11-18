const CONSENT_KEY = "brick-bun-cookie-consent";
const POST_INSTALL_NOTICE_DELAY = 2000;
let postInstallNoticePending = false;
let postInstallNoticeTimer = null;

async function requestPersistentStorage() {
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== "function") return false;

  try {
    if (typeof storage.persisted === "function" && await storage.persisted()) return true;
    return await storage.persist();
  } catch (error) {
    console.warn("BRICK & BUN could not request persistent storage.", error);
    return false;
  }
}

function injectPwaStyles() {
  if (document.getElementById("brick-bun-pwa-ui-styles")) return;
  const style = document.createElement("style");
  style.id = "brick-bun-pwa-ui-styles";
  style.textContent = `
    .bb-cookie-banner{font-family:Arial,Helvetica,sans-serif;color:#292824;background:#fff;border:1px solid rgba(41,40,36,.12);box-shadow:0 24px 80px rgba(0,0,0,.24)}
    .bb-cookie-banner button{border:0;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer;font:inherit}
    .bb-cookie-banner{position:fixed;left:18px;right:18px;bottom:18px;z-index:9999;width:min(680px,calc(100% - 36px));margin:auto;border-radius:14px;padding:18px;box-sizing:border-box}
    .bb-cookie-banner strong{display:block;margin-bottom:5px}.bb-cookie-banner p{margin:0;color:#69665f;font-size:.88rem;line-height:1.45}.bb-cookie-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}.bb-cookie-actions button:first-child{background:#c45a3c;color:#fff}.bb-cookie-actions button:last-child{background:#eeeae3;color:#292824}
    .bb-offline-info-banner{position:fixed;left:50%;top:50%;z-index:9998;width:min(760px,calc(100% - 36px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:24px;display:flex;flex-direction:column;align-items:stretch;gap:20px;background:#fff;color:#292824;border:1px solid rgba(41,40,36,.12);box-shadow:0 24px 80px rgba(0,0,0,.24);border-radius:14px;transform:translate(-50%,-50%);animation:bb-offline-info-enter .35s ease}
    .bb-offline-info-banner.is-dismissing{opacity:0;transition:opacity .25s ease}
    .bb-offline-info-copy{flex:1;min-width:0}.bb-offline-info-copy strong{display:block;margin-bottom:5px}.bb-offline-info-copy p{margin:0;color:#69665f;font-size:.88rem;line-height:1.45}
    .bb-offline-info-banner button{align-self:flex-start;border:0;border-radius:9px;padding:11px 16px;background:#c45a3c;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    @keyframes bb-offline-info-enter{from{opacity:0}to{opacity:1}}
    @media(max-width:520px){.bb-cookie-actions{flex-direction:column}.bb-cookie-banner{left:10px;right:10px;width:auto;bottom:10px}.bb-cookie-actions button{width:100%}.bb-offline-info-banner{width:calc(100% - 20px);padding:20px}.bb-offline-info-banner button{width:100%}}
    @media(prefers-reduced-motion:reduce){.bb-offline-info-banner{animation:none}}
  `;
  document.head.appendChild(style);
}

function removeCookieBanner() {
  document.getElementById("brick-bun-cookie-banner")?.remove();
}

function showCookieConsent() {
  if (localStorage.getItem(CONSENT_KEY) || document.getElementById("brick-bun-cookie-banner")) return;
  injectPwaStyles();
  const banner = document.createElement("section");
  banner.id = "brick-bun-cookie-banner";
  banner.className = "bb-cookie-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Cookie consent");
  banner.innerHTML = `
    <strong>Your privacy choices</strong>
    <p>We use essential storage to keep your preferences and offline app working. Optional cookies are only used with your permission.</p>
    <div class="bb-cookie-actions">
      <button type="button" data-choice="all">Accept all</button>
      <button type="button" data-choice="essential">Essential only</button>
    </div>`;
  banner.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    void requestPersistentStorage();
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: button.dataset.choice, date: new Date().toISOString() }));
    removeCookieBanner();
    schedulePostInstallNotice();
  }));
  document.body.appendChild(banner);
}

function schedulePostInstallNotice() {
  if (!postInstallNoticePending || !localStorage.getItem(CONSENT_KEY) ||
    document.getElementById("brick-bun-cookie-banner") || postInstallNoticeTimer !== null) return;
  postInstallNoticeTimer = window.setTimeout(() => {
    postInstallNoticeTimer = null;
    if (!postInstallNoticePending || !localStorage.getItem(CONSENT_KEY) ||
      document.getElementById("brick-bun-cookie-banner")) return;
    postInstallNoticePending = false;
    showOfflineArchitectureNotice();
  }, POST_INSTALL_NOTICE_DELAY);
}

function showOfflineArchitectureNotice() {
  if (!localStorage.getItem(CONSENT_KEY) || document.getElementById("brick-bun-cookie-banner") ||
    document.getElementById("brick-bun-offline-info-banner")) return;
  injectPwaStyles();
  const banner = document.createElement("section");
  banner.id = "brick-bun-offline-info-banner";
  banner.className = "bb-offline-info-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-labelledby", "bb-offline-info-title");
  banner.innerHTML = `
    <div class="bb-offline-info-copy">
      <strong id="bb-offline-info-title">Offline Architecture Notice</strong>
      <p>Offline functionality in this web app has architectural limitations that require navigating through pages to cache them for offline use. As long as the browser cache is not cleared, it will continue to work offline.</p>
    </div>
    <button type="button">Got it</button>`;
  banner.querySelector("button").addEventListener("click", () => {
    banner.classList.add("is-dismissing");
    window.setTimeout(() => banner.remove(), 260);
  });
  document.body.appendChild(banner);
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        if (localStorage.getItem(CONSENT_KEY)) void requestPersistentStorage();
      })
      .catch((error) => console.error("BRICK & BUN could not register offline support.", error));
  }, { once: true });
}

window.addEventListener("load", () => {
  if (localStorage.getItem(CONSENT_KEY)) void requestPersistentStorage();
  window.setTimeout(() => {
    if (!localStorage.getItem(CONSENT_KEY)) showCookieConsent();
  }, 2200);
}, { once: true });

window.addEventListener("appinstalled", () => {
  postInstallNoticePending = true;
  schedulePostInstallNotice();
});

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  return nativeFetch(...args);
};