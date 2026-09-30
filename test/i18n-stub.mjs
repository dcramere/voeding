// Node stand-in for public/i18n.js (Dutch source text, identity translation) so the browser modules can be imported in tests.
const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : v[k])) : s);
globalThis.T = (s, v) => fill(s, v);
globalThis.Tn = (n, one, many, v) => fill(n === 1 ? one : many, { n, ...v });
globalThis.N_ = (s) => s;
globalThis.I18N = { lang: "nl", locale: "nl-NL", T: globalThis.T, Tn: globalThis.Tn, apply() {}, onChange() {}, LANGS: { nl: "Nederlands" } };
