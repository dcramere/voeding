// DCRAMERE — translations (nl source, en/pt/es dictionaries in /i18n/<lang>.json, shared with the Worker).
// Loaded first on every page as <script src="/i18n.js" data-load="/core.js /app.js">: it picks the
// language, loads that dictionary, translates the static HTML and only then runs the page scripts,
// so nothing flashes in Dutch. Dynamic text goes through T("Nederlandse brontekst", {vars}).
(function(){
"use strict";
const LANGS={nl:"Nederlands",en:"English",pt:"Português",es:"Español"};
const LOCALE={nl:"nl-NL",en:"en-US",pt:"pt-BR",es:"es-419"};
const KEY="dc-taal";
const me=document.currentScript;
// the choice is kept on the device and in a cookie, so server-rendered pages (coach storefronts) use it too
const store={get(){try{return localStorage.getItem(KEY)}catch(e){return null}},
  set(v){try{localStorage.setItem(KEY,v)}catch(e){} document.cookie=`${KEY}=${v};path=/;max-age=31536000;SameSite=Lax`}};

function detect(){
  const q=new URLSearchParams(location.search).get("lang");
  if(q&&LANGS[q]){store.set(q);return q}
  const server=document.documentElement.dataset.lang; if(LANGS[server]) return server; // page rendered in this language by the Worker
  const s=store.get(); if(s&&LANGS[s]) return s;
  for(const l of navigator.languages||[navigator.language||""]){const b=String(l).slice(0,2).toLowerCase(); if(LANGS[b]) return b}
  return "nl";
}
const lang=detect();
const explicit=!!store.get(); // chosen by the user (picker or ?lang=), not guessed from the browser
const dict={}; // nl source → translation
const missing=new Set(), miss=k=>{if(/\p{L}{2}/u.test(k)) missing.add(k)}; // numbers and symbols need no translation
const norm=s=>s.replace(/\s+/g," ").trim();
const fill=(s,v)=>v?s.replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?m:v[k]):s;

function T(nl,vars){
  if(lang==="nl") return fill(nl,vars);
  const k=norm(nl), t=dict[k];
  if(t==null){miss(k);return fill(nl,vars)}
  return fill(t,vars);
}
// plural helper: Tn(n,"1 dag","{n} dagen")
const Tn=(n,one,many,vars)=>T(n===1?one:many,Object.assign({n},vars));

// ---- static HTML: whole "blocks" (text + inline markup) are one key, so sentences stay intact ----
const INLINE=new Set(["A","B","I","EM","STRONG","SMALL","SPAN","BR","SUP","SUB","ABBR","CODE","KBD","MARK","U","S","TIME"]);
const SKIP=new Set(["SCRIPT","STYLE","TEXTAREA","SVG","svg","CODE","PRE","NOSCRIPT","TEMPLATE"]);
const ATTRS=["placeholder","title","aria-label","alt","data-t-label"];
function isBlock(el){ // has direct text and only inline children without further blocks
  let text=false;
  for(const n of el.childNodes){
    if(n.nodeType===3){if(n.nodeValue.trim()) text=true}
    else if(n.nodeType===1){if(!INLINE.has(n.tagName)||n.querySelector("div,p,ul,ol,li,section,article,form,label,input,select,button,h1,h2,h3,table")) return false}
  }
  return text;
}
function apply(root){
  if(lang==="nl"||!root) return;
  const walk=el=>{
    if(el.nodeType!==1||SKIP.has(el.tagName)||el.hasAttribute("data-no-t")) return;
    for(const a of ATTRS) if(el.hasAttribute(a)){const v=el.getAttribute(a); if(v.trim()) el.setAttribute(a,T(v))}
    if(el.tagName==="INPUT"&&/^(button|submit)$/i.test(el.type)&&el.value) el.value=T(el.value);
    if(isBlock(el)){ // text with inline markup is translated as one unit, so sentences stay intact
      const k=norm(el.innerHTML), t=dict[k];
      if(t!=null) el.innerHTML=t; else miss(k);
      return;
    }
    for(const n of [...el.childNodes]){
      if(n.nodeType===3){const v=n.nodeValue; if(v.trim()){const t=dict[norm(v)]; if(t!=null) n.nodeValue=v.replace(v.trim(),t); else miss(norm(v))}}
      else walk(n);
    }
  };
  walk(root);
}
function applyHead(){
  if(lang==="nl") return;
  document.title=T(document.title);
  const d=document.querySelector('meta[name="description"]'); if(d) d.content=T(d.content);
}

// ---- language picker: <span data-lang-switch></span> anywhere on the page ----
function picker(el){
  const s=document.createElement("select");
  s.className="lang-select"; s.setAttribute("aria-label","Language");
  s.innerHTML=Object.entries(LANGS).map(([k,v])=>`<option value="${k}"${k===lang?" selected":""}>${v}</option>`).join("");
  s.addEventListener("change",()=>set(s.value));
  el.replaceChildren(s);
}
const listeners=[];
function set(l){
  if(!LANGS[l]||l===lang) return;
  store.set(l);
  Promise.all(listeners.map(f=>{try{return f(l)}catch(e){}})).finally(()=>{
    const u=new URL(location.href); if(u.searchParams.has("lang")) u.searchParams.set("lang",l);
    location.replace(u.href);
  });
}

window.I18N={lang,explicit,LANGS,locale:LOCALE[lang],T,Tn,apply,set,picker,
  onChange(f){listeners.push(f)}, // e.g. save the choice on the account before reloading
  missing:()=>[...missing]};
window.T=T; window.Tn=Tn; window.N_=s=>s; // N_ marks source text that is stored raw and translated where shown
document.documentElement.lang=lang;

// ---- boot: dictionary → static HTML → page scripts (in order) ----
const scripts=((me&&me.dataset.load)||"").split(/\s+/).filter(Boolean);
if(lang!=="nl") document.documentElement.classList.add("i18n-wait");
const load=src=>new Promise((ok,err)=>{const s=document.createElement("script");s.src=src;s.async=false;s.onload=ok;s.onerror=err;document.head.appendChild(s)});
const ready=(lang==="nl"?Promise.resolve():fetch(`/i18n/${lang}.json`).then(r=>r.json()).then(d=>{for(const k in d) dict[norm(k)]=d[k]})).catch(()=>{});
const domReady=new Promise(r=>document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:true}):r());
Promise.all([ready,domReady]).then(()=>{
  if(!document.documentElement.dataset.lang){applyHead(); apply(document.body)} // server-rendered pages arrive translated
  document.querySelectorAll("[data-lang-switch]").forEach(picker);
  document.documentElement.classList.remove("i18n-wait");
  return scripts.reduce((p,src)=>p.then(()=>load(src)),Promise.resolve());
});
})();
