// Collects every translatable Dutch source string (the dictionary keys in public/i18n/<lang>.json):
//   • T("…"), Tn(n,"…","…"), N_("…") in the browser scripts
//   • error messages, field names, notifications and storefront text in the Worker
//   • data tables (foods, exercise cues) by loading the modules
//   • static HTML pages, walked with the same "block" rule as public/i18n.js
// Usage: node scripts/i18n-keys.mjs            → prints the keys missing per language
//        node scripts/i18n-keys.mjs --json     → all keys as JSON (used by the tests)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
export const norm = (s) => String(s).replace(/\s+/g, " ").trim();

// ---------- string literals ----------
// parses a JS string literal starting at s[i] (quote char), returns [value, endIndex] or null for templates with ${}
function literal(s, i) {
  const q = s[i];
  if (q !== '"' && q !== "'" && q !== "`") return null;
  let out = "", j = i + 1;
  for (; j < s.length && s[j] !== q; j++) {
    if (s[j] === "\\") {
      const n = s[++j];
      out += n === "n" ? "\n" : n === "t" ? "\t" : n;
    } else if (q === "`" && s[j] === "$" && s[j + 1] === "{") return null;
    else out += s[j];
  }
  return [out, j + 1];
}
// string literals that make up the first argument of a call: the argument itself, or the branches of a ternary in it
function firstArgStrings(s, i) {
  const found = [];
  let depth = 0, prev = "(";
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '"' || ch === "'" || ch === "`") {
      const lit = literal(s, j);
      if (!lit) { // template with ${}: skip to its end
        let k = j + 1, d = 0;
        for (; k < s.length; k++) { if (s[k] === "\\") { k++; continue; } if (s[k] === "$" && s[k + 1] === "{") { d++; k++; continue; } if (s[k] === "}" && d) { d--; continue; } if (s[k] === "`" && !d) break; }
        j = k; prev = "x"; continue;
      }
      if (depth === 0 && "(?:".includes(prev)) found.push(lit[0]);
      j = lit[1] - 1; prev = "x"; continue;
    }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
    else if (ch === "," && depth === 0) break;
    if (!/\s/.test(ch)) prev = ch;
  }
  return found;
}
function callStrings(src, names) {
  const out = [];
  const re = new RegExp(`(?<![\\w.$])(${names.join("|")})\\(`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    if (m[1] === "Tn") { // Tn(n, "one", "many")
      let depth = 0;
      for (; i < src.length; i++) { const ch = src[i]; if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; else if (ch === "," && depth === 0) break; }
      for (let k = 0; k < 2; k++) {
        while (/[\s,]/.test(src[i])) i++;
        const lit = literal(src, i); if (!lit) break;
        out.push(lit[0]); i = lit[1];
      }
    } else out.push(...firstArgStrings(src, i));
  }
  return out;
}

// ---------- browser scripts ----------
const JS = ["core.js", "training.js", "voeding.js", "chat.js", "app.js", "coach.js", "landing.js", "storefront.js"];
function scriptKeys() {
  return JS.flatMap((f) => callStrings(read("public/" + f), ["T", "Tn", "N_"]));
}

// ---------- Worker ----------
function workerKeys() {
  const src = read("src/worker.js"), out = [];
  out.push(...callStrings(src, ["t"]));
  const add = (re, g = 1) => { let m; while ((m = re.exec(src))) out.push(m[g]); };
  add(/\bfail\(\d+,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g); // fail(400, "…")
  add(/\b(?:str|num|email)\([^;\n]*?,\s*"([^"]+)"(?:,\s*(?:true|false))?\)/g); // field names
  add(/\btr\([^,]+,\s*"([^"]+)"/g);
  add(/\b(?:titel|tekst):\s*(?:[^,{}]*?\?\s*)?"([^"]+)"/g); // notifications (and the first ternary branch)
  add(/\b(?:titel|tekst):\s*[^,{}]*?\?\s*"[^"]+"\s*:\s*"([^"]+)"/g); // … second ternary branch
  add(/\blabel:\s*"([^"]+)"/g);
  return out.map((k) => (k[0] === '"' || k[0] === "'" ? k.slice(1, -1).replace(/\\(.)/g, "$1") : k));
}

// ---------- data tables ----------
async function dataKeys() {
  await import("../test/i18n-stub.mjs");
  globalThis.window = globalThis.window || {};
  await import("../public/core.js");
  await import("../public/training.js");
  const out = [];
  for (const f of Object.values(window.DC.FOODS)) {
    if (f.custom) continue;
    out.push(f.n, f.s); if (f.b) out.push(f.b); if (f.shop) out.push(f.shop); if (f.unit) out.push(f.unit[0], f.unit[1]);
  }
  for (const e of Object.values(window.TR.EX)) out.push(e.cue);
  return out;
}

// ---------- static HTML ----------
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const INLINE = new Set(["a", "b", "i", "em", "strong", "small", "span", "br", "sup", "sub", "abbr", "code", "kbd", "mark", "u", "s", "time"]);
const SKIP = new Set(["script", "style", "textarea", "svg", "code", "pre", "noscript", "template"]);
const RAW = new Set(["script", "style", "textarea", "svg", "noscript", "template"]);
const BLOCKISH = new Set(["div", "p", "ul", "ol", "li", "section", "article", "form", "label", "input", "select", "button", "h1", "h2", "h3", "table"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-t-label"];
function parseHTML(html) {
  const root = { tag: "#root", attrs: [], children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[4] != null) { top.children.push({ text: m[4] }); continue; }
    if (m[1]) { const t = m[1].toLowerCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === t) { stack.length = i; break; } continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase(), attrs = [];
    const ar = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = ar.exec(m[3] || ""))) attrs.push([a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? ""]);
    const el = { tag, attrs, children: [] };
    top.children.push(el);
    if (RAW.has(tag)) { // raw content up to the closing tag
      const end = html.indexOf(`</${tag}`, re.lastIndex); re.lastIndex = end < 0 ? html.length : end; continue;
    }
    if (!VOID.has(tag)) stack.push(el);
  }
  return root;
}
// serialisation as the browser's innerHTML produces it (double-quoted attributes, boolean attributes as ="")
const escAttr = (v) => v.replace(/&(?![a-z#0-9]+;)/gi, "&amp;").replace(/"/g, "&quot;");
const outer = (n) => n.text != null ? n.text : `<${n.tag}${n.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("")}>${VOID.has(n.tag) ? "" : inner(n) + `</${n.tag}>`}`;
const inner = (n) => n.children.map(outer).join("");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
const hasBlockish = (n) => n.children.some((c) => c.tag && (BLOCKISH.has(c.tag) || hasBlockish(c)));
function isBlock(n) {
  let text = false;
  for (const c of n.children) {
    if (c.text != null) { if (c.text.trim()) text = true; }
    else if (!INLINE.has(c.tag) || hasBlockish(c)) return false;
  }
  return text;
}
function htmlKeys(file) {
  const out = [], html = read(file), root = parseHTML(html);
  const walk = (n) => {
    if (n.text != null || SKIP.has(n.tag) || n.attrs.some(([k]) => k === "data-no-t")) return;
    for (const [k, v] of n.attrs) if (ATTRS.includes(k) && v.trim()) out.push(decode(v));
    if (n.tag === "input" && n.attrs.some(([k, v]) => k === "type" && /^(button|submit)$/i.test(v))) { const v = n.attrs.find(([k]) => k === "value"); if (v) out.push(v[1]); }
    if (n.tag !== "#root" && isBlock(n)) {
      // single text node: the browser compares the decoded text; with markup: the serialised innerHTML
      out.push(n.children.length === 1 ? decode(n.children[0].text) : inner(n));
      return;
    }
    for (const c of n.children) { if (c.text != null) { if (c.text.trim()) out.push(decode(c.text)); } else walk(c); }
  };
  const find = (n, tag) => n.tag === tag ? n : n.children && n.children.map((c) => c.tag && find(c, tag)).find(Boolean);
  const body = find(root, "body"), title = find(root, "title");
  if (title) out.push(decode(inner(title)));
  const desc = html.match(/<meta name="description" content="([^"]*)"/); if (desc) out.push(decode(desc[1]));
  if (body) walk(body);
  return out;
}
export const HTML = ["public/index.html", "public/app/index.html", "public/coach/index.html", "public/privacy.html", "public/voorwaarden.html", "public/help.html"];

// ---------- all keys ----------
const junk = (k) => !/\p{L}{2}/u.test(k) || /^(https?:|\/|#|[a-z]+_[a-z_]+$)/.test(k);
export async function allKeys() {
  const keys = [...scriptKeys(), ...workerKeys(), ...(await dataKeys()), ...HTML.flatMap(htmlKeys)].map(norm).filter((k) => k && !junk(k));
  return [...new Set(keys)].sort();
}
export const LANGS = ["en", "pt", "es"];
export const dict = (l) => JSON.parse(read(`public/i18n/${l}.json`));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = await allKeys();
  if (process.argv.includes("--json")) console.log(JSON.stringify(keys, null, 1));
  else {
    console.log(`${keys.length} keys`);
    for (const l of LANGS) {
      const d = Object.fromEntries(Object.entries(dict(l)).map(([k, v]) => [norm(k), v]));
      const miss = keys.filter((k) => !d[k]);
      console.log(`${l}: ${miss.length} missing`);
      if (process.argv.includes("--list")) miss.forEach((k) => console.log("  " + k));
    }
  }
}
