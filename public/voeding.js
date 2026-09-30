// DCRAMERE — food diary, own products (manual / barcode / AI label) and scanner. Client app + coach views.
(function(){
"use strict";
const DC=window.DC, esc=DC.esc, fmt=DC.fmt, $=id=>document.getElementById(id);
const MEALS=[["ontbijt",T("Ontbijt")],["lunch",T("Lunch")],["avond",T("Avondeten")],["snack",T("Tussendoortjes")]];
const ROLES=[["eiwit",T("Eiwitbron (vlees, vis, zuivel, shake)")],["koolh",T("Koolhydraatbron (brood, rijst, granen)")],["vet",T("Vetbron (noten, olie, pindakaas)")],["fruit",T("Fruit")]];
const MENU_MEALS=[["ontbijt",T("Ontbijt")],["hoofd",T("Lunch en avondeten")],["snack",T("Tussendoortjes")]];
// protein · carbs · fat abbreviations
const pkv=(p,c,f,d)=>T("E {p} · K {c} · V {f}",{p:d?fmt(p,1):p,c:d?fmt(c,1):c,f:d?fmt(f,1):f});
const r0=x=>Math.round(x), r1=x=>Math.round(x*10)/10;

// ---------- shared render helpers ----------
function subnavHTML(active){
  return `<nav class="subnav" aria-label="${T("Voeding")}">${[["plan",T("Menu")],["dagboek",T("Dagboek")],["producten",T("Mijn producten")]].map(([v,l])=>
    `<button type="button" data-v="${v}"${v===active?' aria-current="page"':""}>${l}</button>`).join("")}</nav>`;
}
const sum=items=>items.reduce((s,i)=>({kcal:s.kcal+i.kcal,eiwit:s.eiwit+i.eiwit,koolh:s.koolh+i.koolh,vet:s.vet+i.vet}),{kcal:0,eiwit:0,koolh:0,vet:0});
function barsHTML(S,G){
  const bar=(l,v,t,u,cls)=>{const pct=t?Math.min(100,v/t*100):0, over=t&&v>t*1.05;
    return `<div class="mbar${cls?" "+cls:""}"><div class="mbar-h"><span>${l}</span><span><b class="${over?"stale":""}">${fmt(r0(v))}</b> / ${t?fmt(r0(t)):"–"} ${u}</span></div><div class="mbar-t"><i style="width:${pct}%"></i></div></div>`};
  return `<div class="diary-top">
    ${bar(T("Calorieën"),S.kcal,G&&G.kcal,"kcal","big")}
    <div class="mbars">${bar(T("Eiwit"),S.eiwit,G&&G.prot,"g","p")}${bar(T("Koolhydraten"),S.koolh,G&&G.carb,"g","c")}${bar(T("Vet"),S.vet,G&&G.fat,"g","f")}</div>
    ${G?`<p class="sub" style="font-size:13px;margin:8px 0 0">${G.dag==="train"?T("Doel voor een trainingsdag"):G.dag==="rust"?T("Doel voor een rustdag"):T("Dagdoel")}: ${T("nog {x} kcal over.",{x:fmt(Math.max(0,r0(G.kcal-S.kcal)))})}</p>`:""}
  </div>`;
}
const amountLabel=i=>`${fmt(r1(i.gram),i.gram%1?1:0)} g`;
function entriesHTML(items,o){
  o=o||{};
  return MEALS.map(([k,l])=>{
    const list=items.filter(i=>i.maaltijd===k), S=sum(list);
    return `<section class="dmeal"><div class="dmeal-h"><h3>${l}</h3><span>${fmt(r0(S.kcal))} kcal</span>${o.edit?`<button class="btn small ghost" type="button" data-add="${k}">+ ${T("Toevoegen")}</button>`:""}</div>
      ${list.length?`<ul class="dlist">${list.map(i=>`<li${o.edit?` data-entry="${i.id}"`:""}><div><b>${esc(i.naam)}</b><small>${amountLabel(i)}${i.bron==="menu"?" · "+T("uit menu"):""} · ${pkv(r0(i.eiwit),r0(i.koolh),r0(i.vet))}</small></div><span>${fmt(r0(i.kcal))}</span>${o.edit?`<button class="del-x" type="button" data-entry-del="${i.id}" aria-label="${T("Verwijderen")}">×</button>`:""}</li>`).join("")}</ul>`
        :`<p class="dempty">${T("Nog niets gelogd.")}</p>`}
    </section>`;
  }).join("");
}

// ---------- coach views ----------
function coachDiaryHTML(items,profiel,metingen,van,tot){
  const days=[]; for(let d=new Date(tot+"T12:00:00");d>=new Date(van+"T12:00:00");d.setDate(d.getDate()-1)) days.push(new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10));
  const rows=days.map(d=>{const list=items.filter(i=>i.datum===d), S=sum(list), G=DC.targetFor(profiel,metingen,d);
    const pct=G&&S.kcal?Math.round(S.kcal/G.kcal*100):null;
    return `<tr data-diary-day="${d}" class="${list.length?"":"muted"}"><td>${DC.dateNL(d,{weekday:"short",day:"numeric",month:"short"})}</td><td>${list.length?fmt(r0(S.kcal)):"–"}</td><td>${G?fmt(r0(G.kcal)):"–"}</td><td class="${pct&&(pct<85||pct>110)?"stale":""}">${pct?pct+"%":"–"}</td><td>${list.length?r0(S.eiwit):"–"}</td><td>${list.length?r0(S.koolh):"–"}</td><td>${list.length?r0(S.vet):"–"}</td><td>${list.length}</td></tr>`}).join("");
  const logged=days.filter(d=>items.some(i=>i.datum===d)).length;
  return `<p class="sub">${T("{a} van de {b} dagen gelogd. Klik op een dag voor de details. Rood = meer dan 15% onder of 10% boven het doel.",{a:logged,b:days.length})}</p>
    <div class="table-scroll"><table class="hist diary"><thead><tr><th>${T("Dag")}</th><th>Kcal</th><th>${T("Doel")}</th><th>%</th><th>${T("Eiwit")}</th><th>${T("Koolh.")}</th><th>${T("Vet")}</th><th>${T("Regels")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function productsTableHTML(list){
  if(!list||!list.length) return `<p class="empty">${T("Nog geen eigen producten.")}</p>`;
  return `<div class="table-scroll"><table class="hist"><thead><tr><th>${T("Product")}</th><th>Kcal</th><th>${T("E")}</th><th>${T("K")}</th><th>${T("V")}</th><th>${T("Portie")}</th><th>${T("In menu")}</th></tr></thead><tbody>${list.map(p=>
    `<tr><td>${esc(p.naam)}${p.merk?`<small> ${esc(p.merk)}</small>`:""}</td><td>${fmt(p.kcal)}</td><td>${fmt(p.eiwit,1)}</td><td>${fmt(p.koolh,1)}</td><td>${fmt(p.vet,1)}</td><td>${p.portie_g?`${esc(p.portie_naam)} (${fmt(p.portie_g)} g)`:"–"}</td><td>${p.in_menu?T("ja"):"–"}</td></tr>`).join("")}</tbody></table></div>
    <p class="sub" style="font-size:13px;margin-top:8px">${T("Waarden per 100 g.")}</p>`;
}

// ---------- barcode scanner ----------
// Native BarcodeDetector (Android Chrome) or the self-hosted ZXing library (iPhone/Safari), with manual entry.
let zxingLoad=null;
function loadZxing(){
  if(window.ZXing) return Promise.resolve();
  return zxingLoad=zxingLoad||new Promise((ok,no)=>{const s=document.createElement("script");s.src="/vendor/zxing.min.js";s.onload=ok;s.onerror=()=>no(new Error(T("Scanner kon niet laden.")));document.head.appendChild(s)});
}
function scanBarcode(){
  return new Promise(resolve=>{
    const ov=document.createElement("div"); ov.className="scanner";
    ov.innerHTML=`<div class="scanner-box"><video playsinline muted></video><div class="scanner-frame"></div></div>
      <p class="scanner-msg">${T("Richt de camera op de barcode.")}</p>
      <form class="scanner-manual"><input inputmode="numeric" pattern="[0-9]*" placeholder="${T("Of typ de barcode")}" aria-label="Barcode"><button class="btn small" type="submit">${T("Zoeken")}</button></form>
      <button class="btn ghost" type="button" data-close>${T("Annuleren")}</button>`;
    document.body.appendChild(ov);
    const video=ov.querySelector("video"), msg=ov.querySelector(".scanner-msg");
    let stream=null, stopZx=null, done=false, raf=0;
    const finish=code=>{if(done)return;done=true;cancelAnimationFrame(raf);if(stopZx)try{stopZx()}catch(e){}if(stream)stream.getTracks().forEach(t=>t.stop());ov.remove();resolve(code)};
    ov.querySelector("[data-close]").onclick=()=>finish(null);
    ov.querySelector("form").onsubmit=e=>{e.preventDefault();const v=e.target.querySelector("input").value.replace(/\D/g,"");if(/^\d{8,14}$/.test(v))finish(v);else msg.textContent=T("Een barcode heeft 8 tot 14 cijfers.")};
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
      }catch(e){msg.textContent=T("De camera is niet beschikbaar. Geef toestemming voor de camera of typ de barcode hieronder.")}
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
    const m=me(), G=DC.targetFor(m.profiel,m.metingen,st.datum), isToday=st.datum===DC.today();
    const d=new Date(st.datum+"T12:00:00"), label=isToday?T("Vandaag"):DC.dateNL(st.datum,{weekday:"long",day:"numeric",month:"long"});
    el.innerHTML=`${subnavHTML("dagboek")}
      <div class="weekbar"><button class="btn small ghost" type="button" data-diary-date="-1" aria-label="${T("Vorige dag")}">‹</button><div><b style="font-size:18px">${label}</b></div><button class="btn small ghost" type="button" data-diary-date="1" ${isToday?"disabled":""} aria-label="${T("Volgende dag")}">›</button></div>
      ${barsHTML(sum(st.items),G)}
      ${isToday&&m.profiel&&m.metingen.length?`<div class="actions" style="margin:6px 0 4px"><button class="btn small ghost" type="button" data-copy-menu>${T("Menu van vandaag overnemen")}</button></div>`:""}
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
    const s=sheet(`<div class="sheet-h"><h2>${T("Toevoegen aan {x}",{x:MEALS.find(x=>x[0]===maaltijd)[1].toLowerCase()})}</h2><button class="del-x" type="button" data-sheet-close aria-label="${T("Sluiten")}">×</button></div>
      <input type="search" id="fsearch" placeholder="${T("Zoek een product")}" autocomplete="off">
      <div class="actions" style="margin:10px 0"><button class="btn small ghost" type="button" data-scan>▦ ${T("Scan barcode")}</button><button class="btn small ghost" type="button" data-new-product>+ ${T("Nieuw product")}</button></div>
      <div id="fresults" class="fresults"></div>`);
    const list=()=>{
      const q=s.querySelector("#fsearch").value.trim().toLowerCase(), m=me();
      const own=(m.producten||[]).map(p=>({bron:"eigen",ref:String(p.id),f:DC.FOODS["p"+p.id]})).filter(x=>x.f);
      const base=Object.keys(DC.FOODS).filter(k=>!DC.FOODS[k].custom).map(k=>({bron:"basis",ref:k,f:DC.FOODS[k]}));
      const recent=st.recent.map(r=>({bron:r.bron,ref:r.ref,f:foodOf(r.bron,r.ref),gram:r.gram})).filter(x=>x.f);
      const hit=x=>!q||x.f.n.toLowerCase().includes(q);
      const row=x=>`<button type="button" class="frow" data-pick="${x.bron}:${esc(x.ref)}"${x.gram?` data-gram="${x.gram}"`:""}><span><b>${esc(x.f.n)}</b><small>${fmt(x.f.k)} kcal · ${pkv(x.f.p,x.f.c,x.f.f,1)} ${T("per 100 g")}</small></span>›</button>`;
      const sec=(t,a)=>a.length?`<p class="kicker" style="margin:14px 0 4px">${t}</p>${a.map(row).join("")}`:"";
      s.querySelector("#fresults").innerHTML=(q?"":sec(T("Recent"),recent))+sec(T("Mijn producten"),own.filter(hit))+sec(T("Basisproducten"),base.filter(hit))
        ||`<p class="empty">${T("Niets gevonden. Scan de barcode of voeg het product toe.")}</p>`;
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
    const u=f.unit, s=sheet(`<div class="sheet-h"><h2>${esc(f.n)}</h2><button class="del-x" type="button" data-sheet-close aria-label="${T("Sluiten")}">×</button></div>
      <p class="sub" style="font-size:13px">${T("Per 100 g: {k} kcal · eiwit {p} g · koolhydraten {c} g · vet {f} g",{k:fmt(f.k),p:fmt(f.p,1),c:fmt(f.c,1),f:fmt(f.f,1)})}</p>
      <div class="row"><label>${T("Hoeveelheid")}<input id="famt" inputmode="decimal" value="${gram&&u?r1(gram/u[2]):gram||(u?1:100)}"></label>
      <label>${T("Eenheid")}<select id="funit"><option value="g">${T("gram")}</option>${u?`<option value="u" ${gram&&!u?"":"selected"}>${esc(u[1])} (${fmt(u[2])} g)</option>`:""}</select></label></div>
      <label>${T("Maaltijd")}<select id="fmeal">${MEALS.map(([k,l])=>`<option value="${k}"${k===maaltijd?" selected":""}>${l}</option>`).join("")}</select></label>
      <div class="fpreview" id="fprev"></div>
      <button class="btn block" type="button" id="fadd">${T("Toevoegen")}</button><div class="err" id="ferr"></div>`);
    if(gram&&u){s.querySelector("#funit").value="u"}
    const grams=()=>{const a=parseFloat(s.querySelector("#famt").value.replace(",","."));return a>0?(s.querySelector("#funit").value==="u"?a*u[2]:a):0};
    const prev=()=>{const g=grams(), x=DC.macroOf(bron==="eigen"?"p"+ref:ref,g);
      s.querySelector("#fprev").innerHTML=g?`<b>${fmt(r0(x.k))} kcal</b><span>${T("E")} ${fmt(r1(x.p),1)} g</span><span>${T("K")} ${fmt(r1(x.c),1)} g</span><span>${T("V")} ${fmt(r1(x.f),1)} g</span><small>${fmt(r1(g),g%1?1:0)} g</small>`:""};
    s.querySelectorAll("#famt,#funit").forEach(i=>i.addEventListener("input",prev)); prev();
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    s.querySelector("#fadd").onclick=async e=>{
      const g=grams(); if(!g){s.querySelector("#ferr").textContent=T("Vul een hoeveelheid in.");return}
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
    const s=sheet(`<div class="sheet-h"><h2>${esc(i.naam)}</h2><button class="del-x" type="button" data-sheet-close aria-label="${T("Sluiten")}">×</button></div>
      <div class="row"><label>${T("Gram")}<input id="egram" inputmode="decimal" value="${r1(i.gram)}"></label>
      <label>${T("Maaltijd")}<select id="emeal">${MEALS.map(([k,l])=>`<option value="${k}"${k===i.maaltijd?" selected":""}>${l}</option>`).join("")}</select></label></div>
      <div class="fpreview" id="eprev"></div>
      <div class="actions"><button class="btn" type="button" id="esave">${T("Opslaan")}</button><button class="btn danger" type="button" id="edel">${T("Verwijderen")}</button></div><div class="err" id="eerr"></div>`);
    const g=()=>parseFloat(s.querySelector("#egram").value.replace(",","."))||0;
    const prev=()=>{const n=per(g());s.querySelector("#eprev").innerHTML=`<b>${fmt(r0(n.kcal))} kcal</b><span>${T("E")} ${fmt(r1(n.eiwit),1)} g</span><span>${T("K")} ${fmt(r1(n.koolh),1)} g</span><span>${T("V")} ${fmt(r1(n.vet),1)} g</span>`};
    s.querySelector("#egram").addEventListener("input",prev); prev();
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    s.querySelector("#esave").onclick=async()=>{
      if(!(g()>0)){s.querySelector("#eerr").textContent=T("Vul een hoeveelheid in.");return}
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
    const s=sheet(`<div class="sheet-h"><h2>${p.id?T("Product bewerken"):T("Nieuw product")}</h2><button class="del-x" type="button" data-sheet-close aria-label="${T("Sluiten")}">×</button></div>
      ${p.id?"":`<div class="src-btns"><label class="btn small ghost"><input type="file" accept="image/*" capture="environment" id="plabel" hidden>📷 ${T("Foto van etiket")}</label><button class="btn small ghost" type="button" id="pscan">▦ ${T("Scan barcode")}</button></div>
      <p class="sub" style="font-size:13px;margin:6px 0 0">${T('Of neem de waarden over van het etiket (kolom "per 100 g").')}</p>`}
      <div class="flash" id="pinfo" role="status"></div>
      <form id="fprod" novalidate>
        <div class="row"><label>${T("Naam")}<input name="naam" required maxlength="80" value="${esc(p.naam||"")}"></label><label>${T("Merk")} <small>${T("optioneel")}</small><input name="merk" maxlength="60" value="${esc(p.merk||"")}"></label></div>
        <fieldset><legend>${T("Voedingswaarde per 100 g")}</legend>
          <div class="row"><label>${T("Energie")} <small>kcal</small><input name="kcal" inputmode="decimal" value="${p.kcal??""}"></label><label>${T("Eiwit")} <small>g</small><input name="eiwit" inputmode="decimal" value="${p.eiwit??""}"></label></div>
          <div class="row"><label>${T("Koolhydraten")} <small>g</small><input name="koolh" inputmode="decimal" value="${p.koolh??""}"></label><label>${T("Vet")} <small>g</small><input name="vet" inputmode="decimal" value="${p.vet??""}"></label></div>
          <div class="row"><label>${T("Vezels")} <small>${T("g, optioneel")}</small><input name="vezels" inputmode="decimal" value="${p.vezels??""}"></label><label>Barcode <small>${T("optioneel")}</small><input name="barcode" inputmode="numeric" value="${esc(p.barcode||"")}"></label></div>
          <p class="kcal-check" id="kcheck"></p>
        </fieldset>
        <fieldset><legend>${T("Portie")} <small style="font-weight:400">${T("optioneel")}</small></legend>
          <div class="row"><label>${T("Naam portie")} <small>${T("bijv. reep, schep, stuk")}</small><input name="portie_naam" maxlength="20" value="${esc(p.portie_naam||"")}"></label><label>${T("Gewicht per portie")} <small>g</small><input name="portie_g" inputmode="decimal" value="${p.portie_g??""}"></label></div>
        </fieldset>
        <fieldset><legend>${T("Gebruik in mijn menu")}</legend>
          <label class="consent"><input type="checkbox" name="in_menu" ${p.in_menu?"checked":""}><span>${T("Mag in mijn gegenereerde menu en boodschappenlijst voorkomen.")}</span></label>
          <div id="menuopts" ${p.in_menu?"":"hidden"} style="display:grid;gap:12px;margin-top:10px">
            <label>${T("Rol in het menu")}<select name="rol">${ROLES.map(([k,l])=>`<option value="${k}"${p.rol===k?" selected":""}>${l}</option>`).join("")}</select></label>
            <div class="checks">${MENU_MEALS.map(([k,l])=>`<label class="chip"><input type="checkbox" value="${k}" data-mm ${(p.maaltijden||[]).includes(k)?"checked":""}>${l}</label>`).join("")}</div>
          </div>
        </fieldset>
        <input type="hidden" name="bron" value="${p.bron||"handmatig"}">
        <div class="actions"><button class="btn" type="submit">${p.id?T("Opslaan"):o.maaltijd?T("Opslaan en toevoegen"):T("Opslaan")}</button>${p.id?`<button class="btn danger" type="button" id="pdel">${T("Verwijderen")}</button>`:""}</div>
        <div class="flash" data-msg role="status"></div>
      </form>`);
    const f=s.querySelector("#fprod"), info=s.querySelector("#pinfo");
    const val=n=>{const v=parseFloat(String(f.elements[n].value).replace(",","."));return isFinite(v)?v:null};
    const fill=x=>{["naam","merk","barcode","kcal","eiwit","koolh","vet","vezels","portie_g"].forEach(k=>{if(x[k]!=null&&x[k]!=="")f.elements[k].value=x[k]});if(x.portie_g&&!f.elements.portie_naam.value)f.elements.portie_naam.value=T("portie");check()};
    // sanity check: energy from macros (4/4/9 + 2 for fibre) should be close to the label
    const check=()=>{const k=val("kcal"),p_=val("eiwit"),c=val("koolh"),v=val("vet"),z=val("vezels")||0, el=s.querySelector("#kcheck");
      if([p_,c,v].some(x=>x==null)){el.textContent="";return}
      const calc=p_*4+c*4+v*9+z*2;
      if(k==null){el.className="kcal-check";el.innerHTML=`${T("Berekend uit de macro's: ongeveer")} <b>${fmt(r0(calc))} kcal</b>. <button class="linkbtn" type="button" id="kuse">${T("Overnemen")}</button>`;s.querySelector("#kuse").onclick=()=>{f.elements.kcal.value=r0(calc);check()};return}
      const off=calc?Math.abs(k/calc-1):0;
      el.className="kcal-check"+(off>0.15?" err":"");
      el.textContent=off>0.15?T("Let op: de calorieën ({a}) wijken af van wat de macro's opleveren (±{b}). Controleer het etiket.",{a:fmt(k),b:fmt(r0(calc))}):"";
    };
    f.addEventListener("input",check); check();
    f.elements.in_menu.addEventListener("change",()=>{s.querySelector("#menuopts").hidden=!f.elements.in_menu.checked});
    s.querySelector("[data-sheet-close]").onclick=closeSheet;
    const lbl=s.querySelector("#plabel");
    if(lbl) lbl.addEventListener("change",async()=>{
      if(!lbl.files[0]) return;
      info.className="flash"; info.textContent=T("Etiket wordt gelezen…");
      try{
        const blob=await DC.prepareFoto(lbl.files[0]);
        const r=await fetch("/api/etiket",{method:"POST",credentials:"same-origin",headers:{"content-type":"image/jpeg","x-taal":I18N.lang},body:blob});
        const d=await r.json().catch(()=>null);
        if(!r.ok) throw new Error((d&&d.error)||T("Het etiket kon niet worden gelezen."));
        fill(d.product); f.elements.bron.value="foto";
        info.className="flash"; info.textContent=T("Waarden overgenomen van het etiket. Controleer ze voordat u opslaat.");
      }catch(err){info.className="err";info.textContent=err.message}
      lbl.value="";
    });
    const sc=s.querySelector("#pscan");
    if(sc) sc.onclick=async()=>{
      const code=await scanBarcode(); if(!code) return;
      info.className="flash"; info.textContent=T("Product opzoeken…");
      try{
        const r=await DC.api("/api/barcode/"+code);
        if(r.bron==="eigen"){closeSheet();amountSheet(o.maaltijd||"snack","eigen",String(r.id));return}
        f.elements.barcode.value=code;
        if(r.bron==="openfoodfacts"){fill(r.product);f.elements.bron.value="barcode";
          const missing=["kcal","eiwit","koolh","vet"].filter(k=>r.product[k]==null);
          info.textContent=missing.length?T("Product gevonden, maar niet alle waarden zijn bekend. Vul de ontbrekende waarden aan van het etiket."):T("Product gevonden in Open Food Facts. Controleer de waarden met het etiket.")}
        else{info.textContent=T("Deze barcode is niet bekend. Vul de waarden in van het etiket; daarna herkent de app het product.")}
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
      if(!confirm(T('"{x}" verwijderen? Eerder gelogde regels in uw dagboek blijven staan.',{x:p.naam}))) return;
      try{const r=await DC.api("/api/producten/"+p.id,"DELETE");me().producten=r.producten;DC.setCustomFoods(r.producten);hooks.changed("producten");closeSheet();renderProducts()}catch(err){alert(err.message)}
    };
  }
  async function scanFlow(maaltijd){
    const code=await scanBarcode(); if(!code) return;
    try{
      const r=await DC.api("/api/barcode/"+code);
      if(r.bron==="eigen"){amountSheet(maaltijd,"eigen",String(r.id));return}
      productSheet({...(r.product||{}),barcode:code,bron:r.bron?"barcode":"handmatig"},{maaltijd});
      const info=$("pinfo"); if(info) info.textContent=r.bron?T("Product gevonden in Open Food Facts. Controleer de waarden en sla op."):T("Deze barcode is niet bekend. Vul de waarden in van het etiket.");
    }catch(err){alert(err.message)}
  }
  function renderProducts(){
    const el=$("producten"); if(!el) return;
    const list=me().producten||[];
    el.innerHTML=`${subnavHTML("producten")}
      <h1>${T("Mijn producten")}</h1>
      <p class="sub">${T("Voeg producten toe die u vaak eet. Ze staan daarna in uw dagboek, en als u dat aanzet ook in uw menu en boodschappenlijst.")}</p>
      <div class="actions" style="margin-top:0"><button class="btn" type="button" data-prod-new>+ ${T("Nieuw product")}</button><button class="btn ghost" type="button" data-prod-scan>▦ ${T("Scan barcode")}</button></div>
      ${list.length?`<ul class="plist">${list.map(p=>`<li><button type="button" data-prod-edit="${p.id}"><span><b>${esc(p.naam)}</b>${p.merk?`<small class="merk">${esc(p.merk)}</small>`:""}<small>${fmt(p.kcal)} kcal · ${pkv(p.eiwit,p.koolh,p.vet,1)} ${T("per 100 g")}${p.portie_g?` · ${esc(p.portie_naam)} ${fmt(p.portie_g)} g`:""}</small></span>${p.in_menu?`<span class="pill gold">${T("in menu")}</span>`:""}</button></li>`).join("")}</ul>`
        :`<p class="empty">${T("Nog geen eigen producten. Tip: scan de barcode van een product uit uw keukenkast.")}</p>`}`;
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
      if(!todo.length){alert(T("Alle maaltijden van het menu staan al in uw dagboek."));return}
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
