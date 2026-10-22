// kindnod: loads the Kindnod banner script once. Works with no options at all.
//   import { loadKindnod } from "@kindnod/consent";
//   loadKindnod();                              // keyless: the site is provisioned on first load
//   loadKindnod({ owner: "you@example.com" });  // get the claim link by email
//   loadKindnod({ siteKey: "abc123" });         // a site you already created
const DEFAULT_SRC = "https://kindnod.com/kindnod.js";
let pending = null;

export function loadKindnod(opts = {}) {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Kindnod) return Promise.resolve(window.Kindnod);
  if (pending) return pending;
  const src = opts.src || DEFAULT_SRC;
  pending = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) { existing.addEventListener("load", () => resolve(window.Kindnod || null)); return; }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (opts.siteKey) s.setAttribute("data-site", opts.siteKey);
    if (opts.owner) s.setAttribute("data-owner", opts.owner);
    s.setAttribute("data-via", opts.via || "npm");
    if (opts.config) s.setAttribute("data-config", JSON.stringify(opts.config));
    s.onload = () => resolve(window.Kindnod || null);
    s.onerror = () => { pending = null; reject(new Error("kindnod.js failed to load")); };
    (document.head || document.documentElement).appendChild(s);
  });
  return pending;
}

// Subscribe to consent decisions. The callback receives { necessary, preferences, statistics, marketing, method }.
export function onConsent(fn) {
  if (typeof window === "undefined") return () => {};
  const handler = () => { const c = window.Kindnod && window.Kindnod.consent; if (c) fn(c); };
  loadKindnod().then((w) => { if (!w) return; w.on("consent", handler); if (w.consent) fn(w.consent); });
  return () => {};
}

// Current decision, or null before the visitor has answered.
export function getConsent() {
  return typeof window !== "undefined" && window.Kindnod ? window.Kindnod.consent : null;
}

// Convenience: true once the visitor allowed the category (or no consent is required in their region).
export function allowed(category) {
  const c = getConsent();
  return !!(c && c[category]);
}
