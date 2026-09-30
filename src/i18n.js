// Server-side translations: same dictionaries as the browser (public/i18n/<lang>.json, Dutch source text as key).
import en from "../public/i18n/en.json";
import pt from "../public/i18n/pt.json";
import es from "../public/i18n/es.json";

export const LANGS = ["nl", "en", "pt", "es"];
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const DICTS = {};
for (const [l, d] of Object.entries({ en, pt, es })) {
  DICTS[l] = {};
  for (const k in d) DICTS[l][norm(k)] = d[k];
}
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : v[k])) : s);

// Dutch source text → language; values in vars that are themselves source text (field names) are translated too
export function tr(lang, nl, vars) {
  const d = DICTS[lang];
  const t = (d && d[norm(nl)]) ?? nl;
  if (!vars) return t;
  const v = {};
  for (const k in vars) v[k] = typeof vars[k] === "string" && d && d[norm(vars[k])] != null ? d[norm(vars[k])] : vars[k];
  return fill(t, v);
}
export const valid = (l) => (LANGS.includes(l) ? l : null);

// request language: explicit header from the app (x-taal) → ?lang= → cookie from the picker → browser → Dutch
export function pickLang(req, url) {
  const h = valid(req.headers.get("x-taal"));
  if (h) return h;
  const q = url && valid(url.searchParams.get("lang"));
  if (q) return q;
  const c = (req.headers.get("cookie") || "").match(/(?:^|;\s*)dc-taal=(\w\w)/);
  if (c && valid(c[1])) return c[1];
  for (const part of (req.headers.get("accept-language") || "").split(",")) {
    const l = valid(part.trim().slice(0, 2).toLowerCase());
    if (l) return l;
  }
  return "nl";
}
