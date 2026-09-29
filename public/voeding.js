// DCRAMERE — food diary, own products (manual / barcode / AI label) and scanner. Client app + coach views.
(function(){
"use strict";
const DC=window.DC, esc=DC.esc, fmt=DC.fmt, $=id=>document.getElementById(id);
const MEALS=[["ontbijt","Ontbijt"],["lunch","Lunch"],["avond","Avondeten"],["snack","Tussendoortjes"]];
const ROLES=[["eiwit","Eiwitbron (vlees, vis, zuivel, shake)"],["koolh","Koolhydraatbron (brood, rijst, granen)"],["vet","Vetbron (noten, olie, pindakaas)"],["fruit","Fruit"]];
const MENU_MEALS=[["ontbijt","Ontbijt"],["hoofd","Lunch en avondeten"],["snack","Tussendoortjes"]];
const r0=x=>Math.round(x), r1=x=>Math.round(x*10)/10;

// ---------- shared render helpers ----------
function subnavHTML(active){
  return `<nav class="subnav" aria-label="Voeding">${[["plan","Menu"],["dagboek","Dagboek"],["producten","Mijn producten"]].map(([v,l])=>
    `<button type="button" data-v="${v}"${v===active?' aria-current="page"':""}>${l}</button>`).join("")}</nav>`;
}
const sum=items=>items.reduce((s,i)=>({kcal:s.kcal+i.kcal,eiwit:s.eiwit+i.eiwit,koolh:s.koolh+i.koolh,vet:s.vet+i.vet}),{kcal:0,eiwit:0,koolh:0,vet:0});
function barsHTML(S,T){
  const bar=(l,v,t,u,cls)=>{const pct=t?Math.min(100,v/t*100):0, over=t&&v>t*1.05;
    return `<div class="mbar${cls?" "+cls:""}"><div class="mbar-h"><span>${l}</span><span><b class="${over?"stale":""}">${fmt(r0(v))}</b> / ${t?fmt(r0(t)):"–"} ${u}</span></div><div class="mbar-t"><i style="width:${pct}%"></i></div></div>`};
  return `<div class="diary-top">
    ${bar("Calorieën",S.kcal,T&&T.kcal,"kcal","big")}
    <div class="mbars">${bar("Eiwit",S.eiwit,T&&T.prot,"g","p")}${bar("Koolhydraten",S.koolh,T&&T.carb,"g","c")}${bar("Vet",S.vet,T&&T.fat,"g","f")}</div>
    ${T?`<p class="sub" style="font-size:13px;margin:8px 0 0">${T.dag==="train"?"Doel voor een trainingsdag":T.dag==="rust"?"Doel voor een rustdag":"Dagdoel"}: nog ${fmt(Math.max(0,r0(T.kcal-S.kcal)))} kcal over.</p>`:""}
  </div>`;
}
const amountLabel=i=>`${fmt(r1(i.gram),i.gram%1?1:0)} g`;
function entriesHTML(items,o){
  o=o||{};
  return MEALS.map(([k,l])=>{
    const list=items.filter(i=>i.maaltijd===k), S=sum(list);
    return `<section class="dmeal"><div class="dmeal-h"><h3>${l}</h3><span>${fmt(r0(S.kcal))} kcal</span>${o.edit?`<button class="btn small ghost" type="button" data-add="${k}">+ Toevoegen</button>`:""}</div>
      ${list.length?`<ul class="dlist">${list.map(i=>`<li${o.edit?` data-entry="${i.id}"`:""}><div><b>${esc(i.naam)}</b><small>${amountLabel(i)}${i.bron==="menu"?" · uit menu":""} · E ${r0(i.eiwit)} · K ${r0(i.koolh)} · V ${r0(i.vet)}</small></div><span>${fmt(r0(i.kcal))}</span>${o.edit?`<button class="del-x" type="button" data-entry-del="${i.id}" aria-label="Verwijderen">×</button>`:""}</li>`).join("")}</ul>`
        :`<p class="dempty">Nog niets gelogd.</p>`}
    </section>`;
  }).join("");
}

// ---------- coach views ----------
function coachDiaryHTML(items,profiel,metingen,van,tot){
  const days=[]; for(let d=new Date(tot+"T12:00:00");d>=new Date(van+"T12:00:00");d.setDate(d.getDate()-1)) days.push(new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10));
  const rows=days.map(d=>{const list=items.filter(i=>i.datum===d), S=sum(list), T=DC.targetFor(profiel,metingen,d);
    const pct=T&&S.kcal?Math.round(S.kcal/T.kcal*100):null;
    return `<tr data-diary-day="${d}" class="${list.length?"":"muted"}"><td>${DC.dateNL(d,{weekday:"short",day:"numeric",month:"short"})}</td><td>${list.length?fmt(r0(S.kcal)):"–"}</td><td>${T?fmt(r0(T.kcal)):"–"}</td><td class="${pct&&(pct<85||pct>110)?"stale":""}">${pct?pct+"%":"–"}</td><td>${list.length?r0(S.eiwit):"–"}</td><td>${list.length?r0(S.koolh):"–"}</td><td>${list.length?r0(S.vet):"–"}</td><td>${list.length}</td></tr>`}).join("");
  const logged=days.filter(d=>items.some(i=>i.datum===d)).length;
  return `<p class="sub">${logged} van de ${days.length} dagen gelogd. Klik op een dag voor de details. Rood = meer dan 15% onder of 10% boven het doel.</p>
    <div class="table-scroll"><table class="hist diary"><thead><tr><th>Dag</th><th>Kcal</th><th>Doel</th><th>%</th><th>Eiwit</th><th>Koolh.</th><th>Vet</th><th>Regels</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function productsTableHTML(list){
  if(!list||!list.length) return '<p class="empty">Nog geen eigen producten.</p>';
  return `<div class="table-scroll"><table class="hist"><thead><tr><th>Product</th><th>Kcal</th><th>E</th><th>K</th><th>V</th><th>Portie</th><th>In menu</th></tr></thead><tbody>${list.map(p=>
    `<tr><td>${esc(p.naam)}${p.merk?`<small> ${esc(p.merk)}</small>`:""}</td><td>${fmt(p.kcal)}</td><td>${fmt(p.eiwit,1)}</td><td>${fmt(p.koolh,1)}</td><td>${fmt(p.vet,1)}</td><td>${p.portie_g?`${esc(p.portie_naam)} (${fmt(p.portie_g)} g)`:"–"}</td><td>${p.in_menu?"ja":"–"}</td></tr>`).join("")}</tbody></table></div>
    <p class="sub" style="font-size:13px;margin-top:8px">Waarden per 100 g.</p>`;
}

// ---------- barcode scanner ----------
// Native BarcodeDetector (Android Chrome) or the self-hosted ZXing library (iPhone/Safari), with manual entry.
let zxingLoad=null;
function loadZxing(){
  if(window.ZXing) return Promise.resolve();
  return zxingLoad=zxingLoad||new Promise((ok,no)=>{const s=document.createElement("script");s.src="/vendor/zxing.min.js";s.onload=ok;s.onerror=()=>no(new Error("Scanner kon niet laden."));document.head.appendChild(s)});
}
function scanBarcode(){
  return new Promise(resolve=>{
    const ov=document.createElement("div"); ov.className="scanner";
    ov.innerHTML=`<div class="scanner-box"><video playsinline muted></video><div class="scanner-frame"></div></div>
      <p class="scanner-msg">Richt de camera op de barcode.</p>
      <form class="scanner-manual"><input inputmode="numeric" pattern="[0-9]*" placeholder="Of typ de barcode" aria-label="Barcode"><button class="btn small" type="submit">Zoeken</button></form>
      <button class="btn ghost" type="button" data-close>Annuleren</button>`;
    document.body.appendChild(ov);
    const video=ov.querySelector("video"), msg=ov.querySelector(".scanner-msg");
    let stream=null, stopZx=null, done=false, raf=0;
    const finish=code=>{if(done)return;done=true;cancelAnimationFrame(raf);if(stopZx)try{stopZx()}catch(e){}if(stream)stream.getTracks().forEach(t=>t.stop());ov.remove();resolve(code)};
    ov.querySelector("[data-close]").onclick=()=>finish(null);
    ov.querySelector("form").onsubmit=e=>{e.preventDefault();const v=e.target.querySelector("input").value.replace(/\D/g,"");if(/^\d{8,14}$/.test(v))finish(v);else msg.textContent="Een barcode heeft 8 tot 14 cijfers."};
    (async()=>{
      try{
        if("BarcodeDetector" in window){
          const det=new window.BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
          stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
          video.srcObject=stream; await video.play();
          const tick=async()=>{if(done)return;try{const r=await det.detect(video);if(r[0]&&/^\d{8,14}$/.test(r[0].rawValue)){try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}return finish(r[0].rawValue)}}catch(e){}raf=requestAnimationFrame(tick)};
          tick();
        }else{
          await loadZxing(); if(done) return;
          const hints=new Map([[window.ZXing.DecodeHintType.POSSIBLE_FORMATS,[window.ZXing.BarcodeFormat.EAN_13,window.ZXing.BarcodeFormat.EAN_8,window.ZXing.BarcodeFormat.UPC_A,window.ZXing.BarcodeFormat.UPC_E]]]);
          const reader=new window.ZXing.BrowserMultiFormatReader(hints);
          stopZx=()=>reader.reset();
          reader.decodeFromConstraints({video:{facingMode:"environment"}},video,res=>{if(res&&/^\d{8,14}$/.test(res.getText())){try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}finish(res.getText())}});
        }
      }catch(e){msg.textContent="De camera is niet beschikbaar. Geef toestemming voor de camera of typ de barcode hieronder."}
    })();
  });
}

// ---------- client controller ----------
// hooks: me() → current client state; changed(kind) → re-render outside this module
function initClient(hooks){
  const st={datum:DC.today(),items:[],recent:[],loaded:null};
  const me=()=>hooks.me();
  const foodOf=(bron,ref)=>bron==="eigen"?DC.FOODS["p"+ref]:DC.FOODS[ref];

  async function load(datum){
    st.datum=datum||st.datum;
    const r=await DC.api("/api/dagboek?datum="+st.datum);
    st.items=r.items; st.recent=r.recent; st.loaded=st.datum;
    return r;
  }
  function render(){
    const el=$("dagboek"); if(!el) return;
    const m=me(), T=DC.targetFor(m.profiel,m.metingen,st.datum), isToday=st.datum===DC.today();
    const d=new Date(st.datum+"T12:00:00"), label=isToday?"Vandaag":DC.dateNL(st.datum,{weekday:"long",day:"numeric",month:"long"});
    el.innerHTML=`${subnavHTML("dagboek")}
      <div class="weekbar"><button class="btn small ghost" type="button" data-diary-date="-1" aria-label="Vorige dag">‹</button><div><b style="font-size:18px">${label}</b></div><button class="btn small ghost" type="button" data-diary-date="1" ${isToday?"disabled":""} aria-label="Volgende dag">›</button></div>
      ${barsHTML(sum(st.items),T)}
      ${isToday&&m.profiel&&m.metingen.length?`<div class="actions" style="margin:6px 0 4px"><button class="btn small ghost" type="button" data-copy-menu>Menu van vandaag overnemen</button></div>`:""}
      ${entriesHTML(st.items,{edit:true})}`;
    void d;
  }
  // meals of today's generated menu already logged (by meal index)
  function eatenToday(){
    if(st.loaded!==DC.today()) return new Set();
    return new Set(st.items.filter(i=>i.bron==="menu").map(i=>+String(i.ref).split(":")[1]));
  }
  async function logMenuMeals(indices){
    const m=me(), meals=hooks.todayMeals(); if(!meals) return;
    const groups={};
    meals.filter(ml=>indices.includes(ml.i)).forEach(ml=>{
      const g=groups[DC.diaryMeal(ml)]=groups[DC.diaryMeal(ml)]||[];
      ml.items.forEach(it=>{const n=DC.nutr(it.key,it.g);g.push({naam:DC.FOODS[it.key].n,bron:"menu",ref:`menu:${ml.i}:${it.key}`,gram:it.g,...rnd(n)})});
    });
    if(st.loaded!==DC.today()) await load(DC.today());
    for(const [maaltijd,items] of Object.entries(groups)){
      const r=await DC.api("/api/dagboek","POST",{datum:DC.today(),maaltijd,items}); st.items=r.items; st.recent=r.recent;
    }
    void m;
  }
  const rnd=n=>({kcal:r1(n.kcal),eiwit:r1(n.eiwit),koolh:r1(n.koolh),vet:r1(n.vet)});

  // ---- bottom sheet ----
  function sheet(html){
    closeSheet();
    const s=document.createElement("div"); s.className="sheet-wrap"; s.id="sheet";
    s.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    s.addEventListener("click",e=>{if(e.target===s)closeSheet()});
    document.body.appendChild(s); document.body.classList.add("sheet-open");
    const f=s.querySelector("input:not([type=hidden]):not([type=file])"); if(f&&!("ontouchstart" in window)) f.focus();
    return s;
  }
  function closeSheet(){const s=$("sheet");if(s)s.remove();document.body.classList.remove("sheet-open")}

  function searchSheet(maaltijd){
    const s=sheet(`<div class="sheet-h"><h2>Toevoegen aan ${MEALS.find(x=>x[0]===maaltijd)[1].toLowerCase()}</h2><button class="del-x" type="button" data-sheet-close aria-label="Sluiten">×</button></div>
      <input type="search" id="fsearch" placeholder="Zoek een product" autocomplete="off">
      <div class="actions" style="margin:10px 0"><button class="btn small ghost" type="button" data-scan>▦ Scan barcode</button><button class="btn small ghost" type="button" data-new-product>+ Nieuw product</button></div>
      <div id="fresults" class="fresults"></div>`);
    const list=()=>{
      const q=s.querySelector("#fsearch").value.trim().toLowerCase(), m=me();
      const own=(m.producten||[]).map(p=>({bron:"eigen",ref:String(p.id),f:DC.FOODS["p"+p.id]})).filter(x=>x.f);
      const base=Object.keys(DC.FOODS).filter(k=>!DC.FOODS[k].custom).map(k=>({bron:"basis",ref:k,f:DC.FOODS[k]}));
      const recent=st.recent.map(r=>({bron:r.bron,ref:r.ref,f:foodOf(r.bron,r.ref),gram:r.gram})).filter(x=>x.f);
      const hit=x=>!q||x.f.n.toLowerCase().includes(q);
      const row=x=>`<button type="button" class="frow" data-pick="${x.bron}:${esc(x.ref)}"${x.gram?` data-gram="${x.gram}"`:""}><span><b>${esc(x.f.n)}</b><small>${fmt(x.f.k)} kcal · E ${fmt(x.f.p,1)} · K ${fmt(x.f.c,1)} · V ${fmt(x.f.f,1)} per 100 g</small></span>›</button>`;
      const sec=(t,a)=>a.length?`<p class="kicker" style="margin:14px 0 4px">${t}</p>${a.map(row).join("")}`:"";
      s.querySelector("#fresults").innerHTML=(q?"":sec("Recent",recent))+sec("Mijn producten",own.filter(hit))+sec("Basisproducten",base.filter(hit))
        ||`<p class="empty">Niets gevonden. Scan de barcode of voeg het product toe.</p>`;
    };
    s.querySelector("#fsearch").addEventListener("input",list); list();
    s.addEventListener("click",async e=>{
      const t=e.target.closest("[data-pick],[data-scan],[data-new-product],[data-sheet-close]"); if(!t) return;
      if(t.hasAttribute("data-sheet-close")) closeSheet();
      else if(t.dataset.pick){const [bron,...ref]=t.dataset.pick.split(":");amountSheet(maaltijd,bron,ref.join(":"),t.dataset.gram?+t.dataset.gram:null)}
      else if(t.hasAttribute("data-scan")) scanFlow(maaltijd);
      else if(t.hasAttribute("data-new-product")) productSheet(null,{maaltijd});
    });
  }

  function amountSheet(maaltijd,bron,ref,gram){
    const f=foodOf(bron,ref); if(!f) return;
    const u=f.unit, s=sheet(`<div class="sheet-h"><h2>${esc(f.n)}</h2><button class="del-x" type="button" data-sheet-close aria-label="Sluiten">×</button></div>
      <p class="sub" style="font-size:13px">Per 100 g: ${fmt(f.k)} kcal · eiwit ${fmt(f.p,1)} g · koolhydraten ${fmt(f.c,1)} g · vet ${fmt(f.f,1)} g</p>
      <div class="row"><label>Hoeveelheid<input id="famt" inputmode="decimal" value="${gram&&u?r1(gram/u[2]):gram||(u?1:100)}"></label>
      <label>Eenheid<select id="funit"><option value="g">gram</option>${u?`<option value="u" ${gram&&!u?"":"selected"}>${esc(u[1])} (${fmt(u[2])} g)</option>`:""}</select></label></div>
      <label>Maaltijd<select id="fmeal">${MEALS.map(([k,l])=>`<option value="${k}"${k===maaltijd?" selected":""}>${l}</option>`).join("")}</select></label>
      <div class="fpreview" id="fprev"></div>
      <button class="btn block" type="button" id="fadd">Toevoegen</button><div class="err" id="ferr"></div>`);
    if(gram&&u){s.querySelector("#funit").value="u"}
    const grams=()=>{const a=parseFloat(s.querySelector("#famt").value.replace(",","."));return a>0?(s.querySelector("#funit").value==="u"?a*u[2]:a):0};
    const prev=()=>{const g=grams(), x=DC.macroOf(bron==="eigen"?"p"+ref:ref,g);
      s.querySelector("#fprev").innerHTML=g?`<b>${fmt(r0(x.k))} kcal</b><span>E ${fmt(r1(x.p),1)} g</span><span>K ${fmt(r1(x.c),1)} g</span><span>V ${fmt(r1(x.f),1)} g</span><small>${fmt(r1(g),g%1?1:0)} g</small>`:""};
    s.querySelectorAll("#famt,#funit").forEach(i=>i.addEventListener("input",prev)); prev();
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    s.querySelector("#fadd").onclick=async e=>{
      const g=grams(); if(!g){s.querySelector("#ferr").textContent="Vul een hoeveelheid in.";return}
      e.target.disabled=true;
      try{
        const n=DC.nutr(bron==="eigen"?"p"+ref:ref,g);
        const r=await DC.api("/api/dagboek","POST",{datum:st.datum,maaltijd:s.querySelector("#fmeal").value,items:[{naam:f.n,bron,ref,gram:r1(g),...rnd(n)}]});
        st.items=r.items; st.recent=r.recent; closeSheet(); render(); hooks.changed("dagboek");
      }catch(err){s.querySelector("#ferr").textContent=err.message;e.target.disabled=false}
    };
  }

  function editEntrySheet(id){
    const i=st.items.find(x=>x.id===id); if(!i) return;
    const per=g=>({kcal:i.kcal/i.gram*g,eiwit:i.eiwit/i.gram*g,koolh:i.koolh/i.gram*g,vet:i.vet/i.gram*g});
    const s=sheet(`<div class="sheet-h"><h2>${esc(i.naam)}</h2><button class="del-x" type="button" data-sheet-close aria-label="Sluiten">×</button></div>
      <div class="row"><label>Gram<input id="egram" inputmode="decimal" value="${r1(i.gram)}"></label>
      <label>Maaltijd<select id="emeal">${MEALS.map(([k,l])=>`<option value="${k}"${k===i.maaltijd?" selected":""}>${l}</option>`).join("")}</select></label></div>
      <div class="fpreview" id="eprev"></div>
      <div class="actions"><button class="btn" type="button" id="esave">Opslaan</button><button class="btn danger" type="button" id="edel">Verwijderen</button></div><div class="err" id="eerr"></div>`);
    const g=()=>parseFloat(s.querySelector("#egram").value.replace(",","."))||0;
    const prev=()=>{const n=per(g());s.querySelector("#eprev").innerHTML=`<b>${fmt(r0(n.kcal))} kcal</b><span>E ${fmt(r1(n.eiwit),1)} g</span><span>K ${fmt(r1(n.koolh),1)} g</span><span>V ${fmt(r1(n.vet),1)} g</span>`};
    s.querySelector("#egram").addEventListener("input",prev); prev();
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    s.querySelector("#esave").onclick=async()=>{
      if(!(g()>0)){s.querySelector("#eerr").textContent="Vul een hoeveelheid in.";return}
      try{const r=await DC.api("/api/dagboek/"+id,"PUT",{naam:i.naam,bron:i.bron,ref:i.ref,gram:r1(g()),maaltijd:s.querySelector("#emeal").value,...rnd(per(g()))});st.items=r.items;closeSheet();render();hooks.changed("dagboek")}
      catch(err){s.querySelector("#eerr").textContent=err.message}
    };
    s.querySelector("#edel").onclick=()=>removeEntry(id);
  }
  async function removeEntry(id){
    try{const r=await DC.api("/api/dagboek/"+id,"DELETE");st.items=r.items;closeSheet();render();hooks.changed("dagboek")}catch(err){alert(err.message)}
  }

  // ---- products ----
  function productSheet(p,o){
    o=o||{}; p=p||{};
    const s=sheet(`<div class="sheet-h"><h2>${p.id?"Product bewerken":"Nieuw product"}</h2><button class="del-x" type="button" data-sheet-close aria-label="Sluiten">×</button></div>
      ${p.id?"":`<div class="src-btns"><label class="btn small ghost"><input type="file" accept="image/*" capture="environment" id="plabel" hidden>📷 Foto van etiket</label><button class="btn small ghost" type="button" id="pscan">▦ Scan barcode</button></div>
      <p class="sub" style="font-size:13px;margin:6px 0 0">Of neem de waarden over van het etiket (kolom "per 100 g").</p>`}
      <div class="flash" id="pinfo" role="status"></div>
      <form id="fprod" novalidate>
        <div class="row"><label>Naam<input name="naam" required maxlength="80" value="${esc(p.naam||"")}"></label><label>Merk <small>optioneel</small><input name="merk" maxlength="60" value="${esc(p.merk||"")}"></label></div>
        <fieldset><legend>Voedingswaarde per 100 g</legend>
          <div class="row"><label>Energie <small>kcal</small><input name="kcal" inputmode="decimal" value="${p.kcal??""}"></label><label>Eiwit <small>g</small><input name="eiwit" inputmode="decimal" value="${p.eiwit??""}"></label></div>
          <div class="row"><label>Koolhydraten <small>g</small><input name="koolh" inputmode="decimal" value="${p.koolh??""}"></label><label>Vet <small>g</small><input name="vet" inputmode="decimal" value="${p.vet??""}"></label></div>
          <div class="row"><label>Vezels <small>g, optioneel</small><input name="vezels" inputmode="decimal" value="${p.vezels??""}"></label><label>Barcode <small>optioneel</small><input name="barcode" inputmode="numeric" value="${esc(p.barcode||"")}"></label></div>
          <p class="kcal-check" id="kcheck"></p>
        </fieldset>
        <fieldset><legend>Portie <small style="font-weight:400">optioneel</small></legend>
          <div class="row"><label>Naam portie <small>bijv. reep, schep, stuk</small><input name="portie_naam" maxlength="20" value="${esc(p.portie_naam||"")}"></label><label>Gewicht per portie <small>g</small><input name="portie_g" inputmode="decimal" value="${p.portie_g??""}"></label></div>
        </fieldset>
        <fieldset><legend>Gebruik in mijn menu</legend>
          <label class="consent"><input type="checkbox" name="in_menu" ${p.in_menu?"checked":""}><span>Mag in mijn gegenereerde menu en boodschappenlijst voorkomen.</span></label>
          <div id="menuopts" ${p.in_menu?"":"hidden"} style="display:grid;gap:12px;margin-top:10px">
            <label>Rol in het menu<select name="rol">${ROLES.map(([k,l])=>`<option value="${k}"${p.rol===k?" selected":""}>${l}</option>`).join("")}</select></label>
            <div class="checks">${MENU_MEALS.map(([k,l])=>`<label class="chip"><input type="checkbox" value="${k}" data-mm ${(p.maaltijden||[]).includes(k)?"checked":""}>${l}</label>`).join("")}</div>
          </div>
        </fieldset>
        <input type="hidden" name="bron" value="${p.bron||"handmatig"}">
        <div class="actions"><button class="btn" type="submit">${p.id?"Opslaan":o.maaltijd?"Opslaan en toevoegen":"Opslaan"}</button>${p.id?`<button class="btn danger" type="button" id="pdel">Verwijderen</button>`:""}</div>
        <div class="flash" data-msg role="status"></div>
      </form>`);
    const f=s.querySelector("#fprod"), info=s.querySelector("#pinfo");
    const val=n=>{const v=parseFloat(String(f.elements[n].value).replace(",","."));return isFinite(v)?v:null};
    const fill=x=>{["naam","merk","barcode","kcal","eiwit","koolh","vet","vezels","portie_g"].forEach(k=>{if(x[k]!=null&&x[k]!=="")f.elements[k].value=x[k]});if(x.portie_g&&!f.elements.portie_naam.value)f.elements.portie_naam.value="portie";check()};
    // sanity check: energy from macros (4/4/9 + 2 for fibre) should be close to the label
    const check=()=>{const k=val("kcal"),p_=val("eiwit"),c=val("koolh"),v=val("vet"),z=val("vezels")||0, el=s.querySelector("#kcheck");
      if([p_,c,v].some(x=>x==null)){el.textContent="";return}
      const calc=p_*4+c*4+v*9+z*2;
      if(k==null){el.className="kcal-check";el.innerHTML=`Berekend uit de macro's: ongeveer <b>${fmt(r0(calc))} kcal</b>. <button class="linkbtn" type="button" id="kuse">Overnemen</button>`;s.querySelector("#kuse").onclick=()=>{f.elements.kcal.value=r0(calc);check()};return}
      const off=calc?Math.abs(k/calc-1):0;
      el.className="kcal-check"+(off>0.15?" err":"");
      el.textContent=off>0.15?`Let op: de calorieën (${fmt(k)}) wijken af van wat de macro's opleveren (±${fmt(r0(calc))}). Controleer het etiket.`:"";
    };
    f.addEventListener("input",check); check();
    f.elements.in_menu.addEventListener("change",()=>{s.querySelector("#menuopts").hidden=!f.elements.in_menu.checked});
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    const lbl=s.querySelector("#plabel");
    if(lbl) lbl.addEventListener("change",async()=>{
      if(!lbl.files[0]) return;
      info.className="flash"; info.textContent="Etiket wordt gelezen…";
      try{
        const blob=await DC.prepareFoto(lbl.files[0]);
        const r=await fetch("/api/etiket",{method:"POST",credentials:"same-origin",headers:{"content-type":"image/jpeg"},body:blob});
        const d=await r.json().catch(()=>null);
        if(!r.ok) throw new Error((d&&d.error)||"Het etiket kon niet worden gelezen.");
        fill(d.product); f.elements.bron.value="foto";
        info.className="flash"; info.textContent="Waarden overgenomen van het etiket. Controleer ze voordat u opslaat.";
      }catch(err){info.className="err";info.textContent=err.message}
      lbl.value="";
    });
    const sc=s.querySelector("#pscan");
    if(sc) sc.onclick=async()=>{
      const code=await scanBarcode(); if(!code) return;
      info.className="flash"; info.textContent="Product opzoeken…";
      try{
        const r=await DC.api("/api/barcode/"+code);
        if(r.bron==="eigen"){closeSheet();amountSheet(o.maaltijd||"snack","eigen",String(r.id));return}
        f.elements.barcode.value=code;
        if(r.bron==="openfoodfacts"){fill(r.product);f.elements.bron.value="barcode";
          const missing=["kcal","eiwit","koolh","vet"].filter(k=>r.product[k]==null);
          info.textContent=missing.length?"Product gevonden, maar niet alle waarden zijn bekend. Vul de ontbrekende waarden aan van het etiket.":"Product gevonden in Open Food Facts. Controleer de waarden met het etiket."}
        else{info.textContent="Deze barcode is niet bekend. Vul de waarden in van het etiket; daarna herkent de app het product."}
      }catch(err){info.className="err";info.textContent=err.message}
    };
    DC.handleForm(f,async()=>{
      const body={naam:f.elements.naam.value,merk:f.elements.merk.value,barcode:f.elements.barcode.value.replace(/\D/g,"")||null,
        kcal:val("kcal"),eiwit:val("eiwit"),koolh:val("koolh"),vet:val("vet"),vezels:val("vezels"),
        portie_naam:f.elements.portie_naam.value,portie_g:val("portie_g"),in_menu:f.elements.in_menu.checked,rol:f.elements.rol.value,
        maaltijden:[...s.querySelectorAll("[data-mm]:checked")].map(i=>i.value),bron:f.elements.bron.value};
      const r=p.id?await DC.api("/api/producten/"+p.id,"PUT",body):await DC.api("/api/producten","POST",body);
      me().producten=r.producten; DC.setCustomFoods(r.producten); hooks.changed("producten");
      if(o.maaltijd&&!p.id){amountSheet(o.maaltijd,"eigen",String(r.id));return}
      closeSheet(); renderProducts();
    });
    const del=s.querySelector("#pdel");
    if(del) del.onclick=async()=>{
      if(!confirm(`"${p.naam}" verwijderen? Eerder gelogde regels in uw dagboek blijven staan.`)) return;
      try{const r=await DC.api("/api/producten/"+p.id,"DELETE");me().producten=r.producten;DC.setCustomFoods(r.producten);hooks.changed("producten");closeSheet();renderProducts()}catch(err){alert(err.message)}
    };
  }
  async function scanFlow(maaltijd){
    const code=await scanBarcode(); if(!code) return;
    try{
      const r=await DC.api("/api/barcode/"+code);
      if(r.bron==="eigen"){amountSheet(maaltijd,"eigen",String(r.id));return}
      productSheet({...(r.product||{}),barcode:code,bron:r.bron?"barcode":"handmatig"},{maaltijd});
      const info=$("pinfo"); if(info) info.textContent=r.bron?"Product gevonden in Open Food Facts. Controleer de waarden en sla op.":"Deze barcode is niet bekend. Vul de waarden in van het etiket.";
    }catch(err){alert(err.message)}
  }
  function renderProducts(){
    const el=$("producten"); if(!el) return;
    const list=me().producten||[];
    el.innerHTML=`${subnavHTML("producten")}
      <h1>Mijn producten</h1>
      <p class="sub">Voeg producten toe die u vaak eet. Ze staan daarna in uw dagboek, en als u dat aanzet ook in uw menu en boodschappenlijst.</p>
      <div class="actions" style="margin-top:0"><button class="btn" type="button" data-prod-new>+ Nieuw product</button><button class="btn ghost" type="button" data-prod-scan>▦ Scan barcode</button></div>
      ${list.length?`<ul class="plist">${list.map(p=>`<li><button type="button" data-prod-edit="${p.id}"><span><b>${esc(p.naam)}</b>${p.merk?`<small class="merk">${esc(p.merk)}</small>`:""}<small>${fmt(p.kcal)} kcal · E ${fmt(p.eiwit,1)} · K ${fmt(p.koolh,1)} · V ${fmt(p.vet,1)} per 100 g${p.portie_g?` · ${esc(p.portie_naam)} ${fmt(p.portie_g)} g`:""}</small></span>${p.in_menu?'<span class="pill gold">in menu</span>':""}</button></li>`).join("")}</ul>`
        :`<p class="empty">Nog geen eigen producten. Tip: scan de barcode van een product uit uw keukenkast.</p>`}`;
  }

  document.addEventListener("click",async e=>{
    const t=e.target.closest("[data-diary-date],[data-add],[data-entry],[data-entry-del],[data-copy-menu],[data-prod-new],[data-prod-scan],[data-prod-edit]");
    if(!t||t.closest("#sheet")) return;
    if(t.dataset.diaryDate){const d=new Date(st.datum+"T12:00:00");d.setDate(d.getDate()+ +t.dataset.diaryDate);const iso=new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);if(iso>DC.today())return;try{await load(iso);render()}catch(err){alert(err.message)}}
    else if(t.dataset.add) searchSheet(t.dataset.add);
    else if(t.dataset.entryDel){e.stopPropagation();removeEntry(+t.dataset.entryDel)}
    else if(t.dataset.entry) editEntrySheet(+t.dataset.entry);
    else if(t.hasAttribute("data-copy-menu")){
      const meals=hooks.todayMeals()||[], todo=meals.filter(ml=>!eatenToday().has(ml.i)).map(ml=>ml.i);
      if(!todo.length){alert("Alle maaltijden van het menu staan al in uw dagboek.");return}
      t.disabled=true; try{await logMenuMeals(todo);render();hooks.changed("dagboek")}catch(err){alert(err.message)} t.disabled=false;
    }
    else if(t.hasAttribute("data-prod-new")) productSheet(null);
    else if(t.hasAttribute("data-prod-scan")) scanFlow("snack");
    else if(t.dataset.prodEdit) productSheet((me().producten||[]).find(p=>p.id===+t.dataset.prodEdit));
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});

  return {load,render,renderProducts,eatenToday,logMenuMeals,closeSheet,get datum(){return st.datum}};
}

window.VD={MEALS,subnavHTML,barsHTML,entriesHTML,coachDiaryHTML,productsTableHTML,scanBarcode,initClient,sum};
})();
