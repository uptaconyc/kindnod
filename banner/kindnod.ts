/*
 * Kindnod consent banner.
 *
 * Install:  <script src="https://kindnod.com/kindnod.js" data-site="YOUR_KEY" async></script>
 * Keyless:  <script src="https://kindnod.com/kindnod.js" async></script>
 *           With no data-site the banner asks for the config of the page's own hostname and the
 *           server creates an unclaimed site on first sight. data-owner="you@site.com" gets the
 *           claim link emailed; data-via="claude-code" records which tool installed it.
 *
 * What it does, in order:
 *  1. Sets Google Consent Mode v2 defaults to "denied" before any tag fires.
 *  2. Loads the site's banner config from /api/c/KEY (or window.KindnodConfig for demos).
 *  3. Reuses a stored decision: its own cookie first, then a Cookiebot `CookieConsent` cookie
 *     if the site migrated (so returning visitors are not re-prompted).
 *  4. Honours Global Privacy Control. Asks only where law requires when regions = "auto".
 *  5. Shows the banner, records the choice, unblocks scripts, updates Consent Mode, fires
 *     GTM events, and emulates the Cookiebot JS API so existing site code keeps working.
 */

type CatKey = "preferences" | "statistics" | "marketing";
type Consent = { necessary: true; preferences: boolean; statistics: boolean; marketing: boolean };
type Method = "explicit" | "implied" | "carried" | "gpc";

interface CatText { label: string; desc: string }
interface Texts {
  title: string; body: string; accept: string; reject: string; customize: string; save: string;
  policy: string; reopen: string; byline: string;
  cats: Record<"necessary" | CatKey, CatText>;
}
interface Theme { bg: string; fg: string; muted: string; accent: string; accentFg: string; radius: number; shadow: boolean }
export interface CookieEntry { name: string; provider: string; category: "necessary" | CatKey; purpose: string; expiry: string }
export interface Config {
  key: string;
  byline: boolean;
  position: "bottom" | "bottom-left" | "bottom-right" | "center" | "top";
  theme: Theme;
  texts: Texts;
  langs?: Record<string, Partial<Texts> & { cats?: Partial<Record<"necessary" | CatKey, CatText>> }>;
  policyUrl: string;
  regions: "auto" | "all";
  categories: CatKey[];
  consentMode: boolean;
  gtm: boolean;
  compat: boolean;
  carry: boolean;
  gpc: boolean;
  reopen: boolean;
  reloadOnRevoke: boolean;
  log: boolean;
  expiryDays: number;
  cookies: CookieEntry[];
}

declare global {
  interface Window {
    KindnodConfig?: Partial<Config>;
    Kindnod?: any;
    Cookiebot?: any;
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    [k: string]: any;
  }
  interface Navigator { globalPrivacyControl?: boolean }
}

const VERSION = "0.1.0";
const COOKIE = "kindnod_consent";
const CB_COOKIE = "CookieConsent";

const DEFAULT_TEXTS: Texts = {
  title: "We use cookies",
  body: "We use cookies to run this site and, with your permission, to measure traffic and personalise content. You can change your choice at any time.",
  accept: "Accept all",
  reject: "Reject all",
  customize: "Customise",
  save: "Save choices",
  policy: "Cookie policy",
  reopen: "Cookie settings",
  byline: "Consent by Kindnod",
  cats: {
    necessary: { label: "Necessary", desc: "Required for the site to work. Always on." },
    preferences: { label: "Preferences", desc: "Remember settings like language and region." },
    statistics: { label: "Statistics", desc: "Anonymous usage measurement so we can improve the site." },
    marketing: { label: "Marketing", desc: "Used to show relevant ads and measure campaigns." },
  },
};

const DEFAULTS: Config = {
  key: "",
  byline: true,
  position: "bottom",
  theme: { bg: "#ffffff", fg: "#15130f", muted: "#6b655c", accent: "#15130f", accentFg: "#ffffff", radius: 12, shadow: true },
  texts: DEFAULT_TEXTS,
  policyUrl: "",
  regions: "auto",
  categories: ["preferences", "statistics", "marketing"],
  consentMode: true,
  gtm: true,
  compat: true,
  carry: true,
  gpc: true,
  reopen: true,
  reloadOnRevoke: true,
  log: true,
  expiryDays: 365,
  cookies: [],
};

/* ---------- small utils ---------- */

const w = window, d = document;
const now = () => Date.now();

function readCookie(name: string): string | null {
  const m = d.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string, days: number) {
  const exp = new Date(now() + days * 864e5).toUTCString();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  d.cookie = `${name}=${encodeURIComponent(value)}; Expires=${exp}; Path=/; SameSite=Lax${secure}`;
}
function deleteCookie(name: string) {
  d.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}
function deepMerge<T>(base: T, over: any): T {
  if (!over || typeof over !== "object") return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (out as any)[k] === "object" && !Array.isArray((out as any)[k])) {
      out[k] = deepMerge((out as any)[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = d.createElement(tag);
  for (const k in attrs) {
    if (k === "text") e.textContent = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) e.appendChild(typeof c === "string" ? d.createTextNode(c) : c);
  return e;
}

/* ---------- script tag + config ---------- */

const scriptEl = (d.currentScript as HTMLScriptElement | null) || (Array.from(d.querySelectorAll("script[src*='kindnod.js']")).pop() as HTMLScriptElement | undefined) || null;
let siteKey = (scriptEl && scriptEl.getAttribute("data-site")) || (w.KindnodConfig && w.KindnodConfig.key) || "";
const ownerAttr = (scriptEl && scriptEl.getAttribute("data-owner")) || "";
const viaAttr = (scriptEl && scriptEl.getAttribute("data-via")) || "";
const origin = (() => {
  try { return scriptEl && scriptEl.src ? new URL(scriptEl.src).origin : location.origin; } catch { return location.origin; }
})();

let cfg: Config = DEFAULTS;
let state: { consent: Consent; method: Method; stamp: string; prev?: string; region?: string } | null = null;
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let reopenBtn: HTMLElement | null = null;
const listeners: Record<string, Function[]> = {};

function emit(name: string, detail?: any) {
  (listeners[name] || []).forEach((fn) => { try { fn(detail); } catch {} });
  try { w.dispatchEvent(new CustomEvent("kindnod:" + name, { detail })); } catch {}
}

/* ---------- Google Consent Mode v2 ---------- */

function ensureGtag() {
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag !== "function") {
    w.gtag = function () { (w.dataLayer as any[]).push(arguments); };
  }
}
function consentModeDefault() {
  ensureGtag();
  w.gtag!("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    analytics_storage: "denied", functionality_storage: "denied", personalization_storage: "denied",
    security_storage: "granted", wait_for_update: 500,
  });
  w.gtag!("set", "developer_id.dWFmZXI", true);
}
function consentModeUpdate(c: Consent) {
  ensureGtag();
  const g = (b: boolean) => (b ? "granted" : "denied");
  w.gtag!("consent", "update", {
    ad_storage: g(c.marketing), ad_user_data: g(c.marketing), ad_personalization: g(c.marketing),
    analytics_storage: g(c.statistics), functionality_storage: g(c.preferences), personalization_storage: g(c.preferences),
    security_storage: "granted",
  });
}

/* ---------- GTM dataLayer events (Kindnod + Cookiebot-compatible names) ---------- */

function pushEvents(c: Consent, method: Method) {
  w.dataLayer = w.dataLayer || [];
  const dl = w.dataLayer;
  dl.push({ event: "kindnod_consent", kindnod_method: method, kindnod_preferences: c.preferences, kindnod_statistics: c.statistics, kindnod_marketing: c.marketing });
  dl.push({ event: "cookie_consent_update", cookie_consent_preferences: c.preferences, cookie_consent_statistics: c.statistics, cookie_consent_marketing: c.marketing });
  if (c.preferences) dl.push({ event: "cookie_consent_preferences" });
  if (c.statistics) dl.push({ event: "cookie_consent_statistics" });
  if (c.marketing) dl.push({ event: "cookie_consent_marketing" });
}

/* ---------- blocked script / iframe release ---------- */

function parseCats(v: string | null): CatKey[] {
  return (v || "").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter((s) => s === "preferences" || s === "statistics" || s === "marketing") as CatKey[];
}
function allowed(cats: CatKey[], c: Consent) {
  return cats.length === 0 ? true : cats.every((k) => c[k]);
}
function releaseScripts(c: Consent) {
  const sel = 'script[type="text/plain"][data-cookieconsent], script[type="text/plain"][data-kindnod], script[type="text/plain"][data-category]';
  d.querySelectorAll<HTMLScriptElement>(sel).forEach((s) => {
    if (s.getAttribute("data-kindnod-done")) return;
    const cats = parseCats(s.getAttribute("data-cookieconsent") || s.getAttribute("data-kindnod") || s.getAttribute("data-category"));
    if (!allowed(cats, c)) return;
    const n = d.createElement("script");
    for (const a of Array.from(s.attributes)) if (a.name !== "type" && a.name !== "data-cookieconsent" && a.name !== "data-kindnod" && a.name !== "data-category") n.setAttribute(a.name, a.value);
    if (s.src) n.src = s.src; else n.text = s.text;
    n.setAttribute("data-kindnod-done", "1");
    s.setAttribute("data-kindnod-done", "1");
    s.parentNode?.insertBefore(n, s.nextSibling);
  });
  d.querySelectorAll<HTMLElement>("[data-cookieblock-src], [data-kindnod-src]").forEach((e) => {
    if (e.getAttribute("data-kindnod-done")) return;
    const cats = parseCats(e.getAttribute("data-cookieconsent") || e.getAttribute("data-kindnod"));
    if (!allowed(cats, c)) return;
    const src = e.getAttribute("data-cookieblock-src") || e.getAttribute("data-kindnod-src");
    if (src) e.setAttribute("src", src);
    e.setAttribute("data-kindnod-done", "1");
  });
  emit("tagsExecuted");
  cbEvent("CookiebotOnTagsExecuted");
}

/* ---------- storage ---------- */

function storedConsent(): typeof state {
  const raw = readCookie(COOKIE);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || !o.c) return null;
    return { consent: { necessary: true, preferences: !!o.c.p, statistics: !!o.c.s, marketing: !!o.c.m }, method: o.m || "explicit", stamp: o.t || "", prev: o.pr, region: o.r };
  } catch { return null; }
}
function carriedFromCookiebot(): typeof state {
  const raw = readCookie(CB_COOKIE);
  if (!raw) return null;
  if (raw === "-1") return { consent: { necessary: true, preferences: true, statistics: true, marketing: true }, method: "implied", stamp: "cb", prev: "cookiebot" };
  const get = (k: string) => new RegExp(k + ":\\s*(true|false)").exec(raw)?.[1] === "true";
  if (!/necessary:/.test(raw)) return null;
  return { consent: { necessary: true, preferences: get("preferences"), statistics: get("statistics"), marketing: get("marketing") }, method: "carried", stamp: "cb", prev: "cookiebot" };
}
function persist(s: NonNullable<typeof state>) {
  writeCookie(COOKIE, JSON.stringify({ v: 1, t: s.stamp, m: s.method, c: { p: s.consent.preferences, s: s.consent.statistics, m: s.consent.marketing }, pr: s.prev, r: s.region }), cfg.expiryDays);
}

/* ---------- logging ---------- */

function logConsent(s: NonNullable<typeof state>) {
  if (!cfg.log || !siteKey) return;
  const body = JSON.stringify({ k: siteKey, m: s.method, c: { p: s.consent.preferences, s: s.consent.statistics, m: s.consent.marketing }, h: location.hostname, p: s.prev || null, r: s.region || null, v: VERSION });
  const url = origin + "/api/consent";
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  try { fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }); } catch {}
}

/* ---------- Cookiebot compatibility shim ---------- */

function cbEvent(name: string) {
  if (!cfg.compat) return;
  try { w.dispatchEvent(new Event(name)); } catch {}
  const fn = w["CookiebotCallback_" + name.replace("Cookiebot", "")];
  if (typeof fn === "function") { try { fn(); } catch {} }
}
function installShim() {
  if (!cfg.compat) return;
  if (w.Cookiebot && w.Cookiebot.consent && !w.Cookiebot.__kindnod) return; // real Cookiebot present
  const c = () => (state ? state.consent : { necessary: true, preferences: false, statistics: false, marketing: false });
  const shim: any = {
    __kindnod: true,
    get consent() { return { ...c(), method: state?.method || null, stamp: state?.stamp || "0" }; },
    get consented() { return !!state && (state.consent.preferences || state.consent.statistics || state.consent.marketing); },
    get declined() { return !!state && !(state.consent.preferences || state.consent.statistics || state.consent.marketing); },
    get hasResponse() { return !!state; },
    get changed() { return false; },
    regulations: { gdprApplies: true, ccpaApplies: false, lgpdApplies: false },
    show: () => showBanner(),
    hide: () => hideBanner(),
    renew: () => showBanner(true),
    withdraw: () => decide({ necessary: true, preferences: false, statistics: false, marketing: false }, "explicit"),
    submitCustomConsent: (p: boolean, s: boolean, m: boolean) => decide({ necessary: true, preferences: !!p, statistics: !!s, marketing: !!m }, "explicit"),
    runScripts: () => releaseScripts(c()),
    getScript: (url: string, async: boolean, cb?: () => void) => { const s = d.createElement("script"); s.src = url; s.async = !!async; if (cb) s.onload = cb; d.head.appendChild(s); },
  };
  w.Cookiebot = shim;
  cbEvent("CookiebotOnLoad");
}

/* ---------- UI ---------- */

function css(t: Theme, pos: Config["position"]) {
  const shadow = t.shadow ? "0 10px 40px -10px rgba(0,0,0,.35), 0 2px 8px rgba(0,0,0,.08)" : "none";
  const place = pos === "center"
    ? "left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));"
    : pos === "top"
      ? "left:16px;right:16px;top:16px;margin:0 auto;max-width:960px;"
      : pos === "bottom-left"
        ? "left:16px;bottom:16px;width:min(420px,calc(100vw - 32px));"
        : pos === "bottom-right"
          ? "right:16px;bottom:16px;width:min(420px,calc(100vw - 32px));"
          : "left:16px;right:16px;bottom:16px;margin:0 auto;max-width:960px;";
  return `
:host{all:initial}
*{box-sizing:border-box;font-family:inherit}
.w{position:fixed;z-index:2147483000;${place}background:${t.bg};color:${t.fg};border-radius:${t.radius}px;box-shadow:${shadow};
 font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif;padding:18px 18px 14px;border:1px solid rgba(0,0,0,.06)}
.bd{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147482999}
h2{margin:0 0 6px;font-size:16px;font-weight:650}
p{margin:0;color:${t.muted}}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
button{appearance:none;border:1px solid ${t.fg};background:transparent;color:${t.fg};border-radius:${Math.max(6, t.radius - 4)}px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer;line-height:1.2}
button.p{background:${t.accent};color:${t.accentFg};border-color:${t.accent}}
button.l{border-color:transparent;text-decoration:underline;padding-left:6px;padding-right:6px;font-weight:500}
button:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
.cats{display:none;margin-top:14px;border-top:1px solid rgba(0,0,0,.08);padding-top:6px}
.cats.open{display:block}
.cat{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(0,0,0,.06)}
.cat:last-child{border-bottom:0}
.cat .t{flex:1}
.cat .t b{display:block;font-weight:600}
.cat .t span{color:${t.muted};font-size:13px}
.sw{position:relative;width:40px;height:24px;flex:none;margin-top:2px}
.sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
.sw i{position:absolute;inset:0;background:#cfcac2;border-radius:24px;transition:.15s}
.sw i:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.15s}
.sw input:checked+i{background:${t.accent}}
.sw input:checked+i:after{transform:translateX(16px)}
.sw input:disabled+i{opacity:.5}
.ft{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;font-size:12px;color:${t.muted}}
.ft a{color:inherit;text-decoration:underline}
.ft .by{opacity:.85}
.ro{position:fixed;left:16px;bottom:16px;z-index:2147482998;background:${t.bg};color:${t.fg};border:1px solid rgba(0,0,0,.12);border-radius:999px;padding:8px 12px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Helvetica,Arial,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.12)}
@media (max-width:600px){.w{padding:16px 14px 12px}.row button{flex:1 1 auto}}
@media (prefers-reduced-motion:no-preference){.w{animation:wi .22s ease-out}@keyframes wi{from{opacity:0;transform:${pos === "center" ? "translate(-50%,-48%)" : "translateY(8px)"}}to{opacity:1;transform:${pos === "center" ? "translate(-50%,-50%)" : "none"}}}}
`;
}

function pickTexts(): Texts {
  let t = cfg.texts;
  if (cfg.langs) {
    const lang = (d.documentElement.lang || navigator.language || "en").toLowerCase();
    const hit = cfg.langs[lang] || cfg.langs[lang.split("-")[0]];
    if (hit) t = deepMerge(t, hit);
  }
  return t;
}

function showBanner(renew = false) {
  if (host) { hideBanner(); }
  const t = pickTexts();
  host = el("div", { id: "kindnod-host" });
  root = host.attachShadow({ mode: "open" });
  root.appendChild(el("style", { text: css(cfg.theme, cfg.position) }));
  if (cfg.position === "center") root.appendChild(el("div", { class: "bd" }));

  const box = el("div", { class: "w", role: "dialog", "aria-labelledby": "wt", "aria-describedby": "wb", "aria-modal": cfg.position === "center" ? "true" : "false" });
  box.appendChild(el("h2", { id: "wt", text: t.title }));
  box.appendChild(el("p", { id: "wb", text: t.body }));

  const cats = el("div", { class: "cats" });
  const inputs: Partial<Record<CatKey, HTMLInputElement>> = {};
  const current = state?.consent;
  const gpcOn = cfg.gpc && navigator.globalPrivacyControl === true;
  (["necessary", ...cfg.categories] as ("necessary" | CatKey)[]).forEach((k) => {
    const txt = t.cats[k];
    const inp = el("input", { type: "checkbox", "aria-label": txt.label }) as HTMLInputElement;
    if (k === "necessary") { inp.checked = true; inp.disabled = true; }
    else { inp.checked = current ? current[k] : false; if (gpcOn && (k === "statistics" || k === "marketing")) inp.checked = false; inputs[k] = inp; }
    const sw = el("label", { class: "sw" }, [inp, el("i")]);
    cats.appendChild(el("div", { class: "cat" }, [el("div", { class: "t" }, [el("b", { text: txt.label }), el("span", { text: txt.desc })]), sw]));
  });

  const bAccept = el("button", { class: "p", text: t.accept });
  const bReject = el("button", { text: t.reject });
  const bCustom = el("button", { class: "l", text: t.customize, "aria-expanded": "false" });
  const bSave = el("button", { class: "p", text: t.save }); bSave.style.display = "none";
  bAccept.onclick = () => decide({ necessary: true, preferences: true, statistics: true, marketing: true }, "explicit");
  bReject.onclick = () => decide({ necessary: true, preferences: false, statistics: false, marketing: false }, "explicit");
  bCustom.onclick = () => {
    const open = cats.classList.toggle("open");
    bCustom.setAttribute("aria-expanded", String(open));
    bSave.style.display = open ? "" : "none";
    bAccept.style.display = open ? "none" : "";
  };
  bSave.onclick = () => decide({
    necessary: true,
    preferences: !!inputs.preferences?.checked,
    statistics: !!inputs.statistics?.checked,
    marketing: !!inputs.marketing?.checked,
  }, "explicit");

  box.appendChild(cats);
  box.appendChild(el("div", { class: "row" }, [bAccept, bReject, bSave, bCustom]));

  const ft = el("div", { class: "ft" });
  const left = el("div");
  if (cfg.policyUrl) left.appendChild(el("a", { href: cfg.policyUrl, target: "_blank", rel: "noopener", text: t.policy }));
  ft.appendChild(left);
  if (cfg.byline) {
    const by = el("a", { class: "by", href: origin + "/?via=byline&ref=" + encodeURIComponent(location.hostname), target: "_blank", rel: "noopener", text: t.byline });
    ft.appendChild(by);
  }
  box.appendChild(ft);
  root.appendChild(box);
  d.body.appendChild(host);
  if (reopenBtn) reopenBtn.style.display = "none";
  emit("dialogDisplay", { renew });
  cbEvent("CookiebotOnDialogInit");
  cbEvent("CookiebotOnDialogDisplay");
  setTimeout(() => bAccept.focus({ preventScroll: true }), 30);
}

function hideBanner() {
  if (host) { host.remove(); host = null; root = null; }
  if (reopenBtn) reopenBtn.style.display = "";
}

function ensureReopen() {
  if (!cfg.reopen || reopenBtn) return;
  const t = pickTexts();
  const h = el("div", { id: "kindnod-reopen" });
  const r = h.attachShadow({ mode: "open" });
  r.appendChild(el("style", { text: css(cfg.theme, cfg.position) }));
  const b = el("button", { class: "ro", text: t.reopen, "aria-label": t.reopen });
  b.onclick = () => showBanner(true);
  r.appendChild(b);
  d.body.appendChild(h);
  reopenBtn = h;
}

/* ---------- cookie declaration ---------- */

function renderDeclaration() {
  if (!cfg.cookies || !cfg.cookies.length) return;
  let target = d.getElementById("KindnodDeclaration") as HTMLElement | null;
  const cb = d.getElementById("CookieDeclaration");
  if (!target && cb) {
    target = el("div", { id: "KindnodDeclaration" });
    cb.parentNode?.insertBefore(target, cb.nextSibling);
  }
  if (!target) return;
  const t = pickTexts();
  target.innerHTML = "";
  (["necessary", "preferences", "statistics", "marketing"] as const).forEach((k) => {
    const rows = cfg.cookies.filter((c) => c.category === k);
    if (!rows.length) return;
    const sec = el("section", { class: "kindnod-decl" }, [el("h3", { text: t.cats[k].label }), el("p", { text: t.cats[k].desc })]);
    const tbl = el("table", { style: "width:100%;border-collapse:collapse;font-size:14px" });
    tbl.appendChild(el("thead", {}, [el("tr", {}, ["Name", "Provider", "Purpose", "Expiry"].map((h) => el("th", { text: h, style: "text-align:left;padding:6px 8px;border-bottom:1px solid #ddd" })))]));
    const tb = el("tbody");
    rows.forEach((c) => tb.appendChild(el("tr", {}, [c.name, c.provider, c.purpose, c.expiry].map((v) => el("td", { text: v, style: "padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top" })))));
    tbl.appendChild(tb);
    sec.appendChild(tbl);
    target!.appendChild(sec);
  });
}

/* ---------- decision ---------- */

function apply(s: NonNullable<typeof state>, fresh: boolean) {
  state = s;
  if (cfg.consentMode) consentModeUpdate(s.consent);
  releaseScripts(s.consent);
  if (cfg.gtm) pushEvents(s.consent, s.method);
  emit("consent", { ...s });
  cbEvent("CookiebotOnConsentReady");
  if (fresh) cbEvent(s.consent.preferences || s.consent.statistics || s.consent.marketing ? "CookiebotOnAccept" : "CookiebotOnDecline");
}

function decide(c: Consent, method: Method, region?: string) {
  const before = state?.consent;
  const revoked = !!before && (["preferences", "statistics", "marketing"] as CatKey[]).some((k) => before[k] && !c[k]);
  const s = { consent: c, method, stamp: Math.random().toString(36).slice(2, 10) + now().toString(36), prev: state?.prev, region: region || state?.region };
  persist(s);
  logConsent(s);
  hideBanner();
  ensureReopen();
  apply(s, true);
  if (revoked && cfg.reloadOnRevoke) { setTimeout(() => location.reload(), 150); }
}

/* ---------- boot ---------- */

async function loadConfig(): Promise<Partial<Config>> {
  const inline = w.KindnodConfig || (scriptEl?.getAttribute("data-config") ? JSON.parse(scriptEl!.getAttribute("data-config")!) : null);
  // Inline config with no key: demos and previews. Nothing is fetched or logged.
  if (inline && !siteKey && inline.log === false) return inline;
  try {
    const url = siteKey
      ? origin + "/api/c/" + encodeURIComponent(siteKey)
      : origin + "/api/c/auto?h=" + encodeURIComponent(location.hostname) + (ownerAttr ? "&o=" + encodeURIComponent(ownerAttr) : "") + (viaAttr ? "&v=" + encodeURIComponent(viaAttr) : "");
    const r = await fetch(url, { credentials: "omit" });
    if (!r.ok) throw new Error(String(r.status));
    const remote = await r.json();
    if (!siteKey && typeof remote.key === "string") siteKey = remote.key;
    if (remote.unclaimed) {
      try { console.info("[kindnod] Consent banner is live but unclaimed. Claim the dashboard: " + origin + "/claim?d=" + location.hostname + " (or add data-owner=\"you@example.com\" to the tag to get the link by email)"); } catch {}
    }
    return inline ? deepMerge(remote, inline) : remote;
  } catch {
    return inline || {};
  }
}

async function geoRequired(): Promise<{ required: boolean; country: string }> {
  try {
    const r = await fetch(origin + "/api/geo", { credentials: "omit" });
    if (r.ok) return await r.json();
  } catch {}
  return { required: true, country: "" };
}

async function boot() {
  if (cfg.consentMode) consentModeDefault();
  cfg = deepMerge(DEFAULTS, await loadConfig());
  if (!cfg.consentMode) { /* defaults already pushed; harmless */ }
  installShim();

  const run = () => {
    renderDeclaration();
    const stored = storedConsent();
    if (stored) { apply(stored, false); ensureReopen(); return; }

    if (cfg.carry) {
      const carried = carriedFromCookiebot();
      if (carried) { persist(carried); logConsent(carried); apply(carried, false); ensureReopen(); return; }
    }

    const gpcOn = cfg.gpc && navigator.globalPrivacyControl === true;
    const finish = (required: boolean, country: string) => {
      if (!required) {
        const c: Consent = { necessary: true, preferences: true, statistics: !gpcOn, marketing: !gpcOn };
        const s = { consent: c, method: (gpcOn ? "gpc" : "implied") as Method, stamp: "i" + now().toString(36), region: country };
        persist(s); logConsent(s); apply(s, false); ensureReopen();
        return;
      }
      state = null;
      showBanner();
    };
    if (cfg.regions === "all") finish(true, "");
    else geoRequired().then((g) => finish(g.required, g.country));
  };

  if (d.body) run(); else d.addEventListener("DOMContentLoaded", run);
}

w.Kindnod = {
  version: VERSION,
  show: () => showBanner(true),
  hide: hideBanner,
  withdraw: () => decide({ necessary: true, preferences: false, statistics: false, marketing: false }, "explicit"),
  accept: (c?: Partial<Consent>) => decide({ necessary: true, preferences: c?.preferences ?? true, statistics: c?.statistics ?? true, marketing: c?.marketing ?? true }, "explicit"),
  get consent() { return state ? { ...state.consent, method: state.method } : null; },
  on: (name: string, fn: Function) => { (listeners[name] = listeners[name] || []).push(fn); },
  reset: () => { deleteCookie(COOKIE); deleteCookie(CB_COOKIE); state = null; showBanner(); },
};

boot();
