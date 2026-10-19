// Globals that public/core.js expects in the browser (window, translations). Imported before core.js.
globalThis.window = globalThis.window || {};
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : v[k])) : s);
globalThis.T = globalThis.T || fill;
globalThis.Tn = globalThis.Tn || ((n, one, many, v) => fill(n === 1 ? one : many, { n, ...v }));
globalThis.N_ = globalThis.N_ || ((s) => s);
globalThis.I18N = globalThis.I18N || { lang: "nl", locale: "nl-NL" };
