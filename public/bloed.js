// DCRAMERE — blood test reports (client app + coach dashboard): consent, upload (PDF or photos), the automatic
// report with explanations, and an editor to enter or correct values. The server does the reading and judging.
(function(){
"use strict";
const DC=window.DC, esc=DC.esc;
const fmtN=v=>v==null?"":String(v).replace(".",I18N.lang==="en"?".":",");
const valStr=w=>w.waarde!=null?fmtN(w.waarde):esc(w.tekst||"");
const refStr=w=>esc(w.ref_tekst||(w.ref_min!=null&&w.ref_max!=null?`${fmtN(w.ref_min)} – ${fmtN(w.ref_max)}`:w.ref_max!=null?"< "+fmtN(w.ref_max):w.ref_min!=null?"> "+fmtN(w.ref_min):""));
const STATUS={laag:["warn",N_("Laag")],hoog:["warn",N_("Hoog")],normaal:["ok",N_("Normaal")],onbekend:["",N_("Geen bereik")]};
const pill=w=>{const [c,l]=STATUS[w.status]||STATUS.onbekend;return `<span class="pill ${w.urgent?"warn urgent":c}">${w.urgent?T("Dringend"):T(l)}</span>`};
const trend=w=>{
  if(!w.vorige) return "";
  const d=w.waarde-w.vorige.waarde, pijl=Math.abs(d)<1e-9?"=":d>0?"↑":"↓";
  return `<small class="bl-trend">${T("vorige: {v} ({d})",{v:fmtN(w.vorige.waarde),d:DC.dateNL(w.vorige.datum,{day:"numeric",month:"short",year:"numeric"})})} ${pijl}</small>`;
};

// o: {coach, akkoord, src(id,n), editing:{id|null, rows}, busy}
function html(list,o){
  let h="";
  if(!o.coach&&!o.akkoord) return consentHTML();
  h+=`<div class="bl-actions actions" style="margin-top:0">
    <label class="btn${o.busy?" disabled":""}"><input type="file" accept="application/pdf,image/*" multiple hidden data-bl-file${o.busy?" disabled":""}>${o.busy?T("Bezig met analyseren…"):T("Rapport uploaden (PDF of foto)")}</label>
    <button class="btn ghost" type="button" data-bl-new${o.busy?" disabled":""}>${T("Waarden handmatig invoeren")}</button></div>
    ${o.coach?`<label class="consent bl-ok"><input type="checkbox" data-bl-akkoord><span>${T("De cliënt heeft toestemming gegeven om dit bloedonderzoek te verwerken.")}</span></label>`:""}
    <p class="sub bl-hint">${o.busy?T("Het lezen en analyseren duurt meestal 10 tot 40 seconden. Sluit de app niet."):T("Meerdere pagina's? Kies alle foto's tegelijk; ze komen in één rapport.")}</p>
    <div class="err" role="status" data-bl-msg></div>`;
  if(o.editing&&o.editing.id===null) h+=editorHTML(o.editing);
  if(!list.length&&!(o.editing&&o.editing.id===null)) h+=`<p class="empty">${o.coach?T("Nog geen bloedonderzoek. Upload het rapport van de cliënt, of laat de cliënt het zelf uploaden onder Voortgang."):T("Nog geen bloedonderzoek. Upload uw laatste uitslag; u krijgt direct een overzicht met uitleg.")}</p>`;
  list.forEach((r,i)=>{h+=o.editing&&o.editing.id===r.id?editorHTML(o.editing):reportHTML(r,o,i===0)});
  return h;
}
function consentHTML(){
  return `<div class="bl-consent">
    <p>${T("U kunt hier de uitslag van uw bloedonderzoek uploaden. De app leest de waarden automatisch uit, vergelijkt ze met het referentiebereik van het laboratorium en maakt een samenvatting met uitleg over voeding en leefstijl.")}</p>
    <ul><li>${T("Uw uitslag is alleen zichtbaar voor u en uw coach en wordt beveiligd bewaard.")}</li>
    <li>${T("Het uitlezen gebeurt met een AI-model van Cloudflare; uw gegevens worden niet gebruikt om dat model te trainen.")}</li>
    <li>${T("De samenvatting is geen medische diagnose en vervangt uw arts niet.")}</li>
    <li>${T("U kunt een rapport altijd weer verwijderen.")}</li></ul>
    <label class="consent"><input type="checkbox" data-bl-consent><span>${T("Ik geef toestemming om mijn bloedonderzoek op deze manier te verwerken en met mijn coach te delen.")}</span></label>
    <div class="actions"><button class="btn" type="button" data-bl-consent-ok>${T("Doorgaan")}</button></div>
    <div class="err" role="status" data-bl-msg></div></div>`;
}
// recommendation plan: blood findings × current diet (made on request, stored with the report)
function adviesHTML(a){
  const li=(arr,f)=>arr&&arr.length?`<ul>${arr.map(f).join("")}</ul>`:"";
  return `${a.focus&&a.focus.length?`<h4>${T("Waar we op letten")}</h4>${li(a.focus,x=>`<li>${esc(x)}</li>`)}`:""}
    ${a.meer&&a.meer.length?`<h4>${T("Meer eten")}</h4>${li(a.meer,x=>`<li><b>${esc(x.wat)}</b>${x.hoe?` — ${esc(x.hoe)}`:""}${x.waarom?`<small>${esc(x.waarom)}</small>`:""}</li>`)}`:""}
    ${a.minder&&a.minder.length?`<h4>${T("Minder of vervangen")}</h4>${li(a.minder,x=>`<li><b>${esc(x.wat)}</b>${x.vervang?` → ${esc(x.vervang)}`:""}${x.waarom?`<small>${esc(x.waarom)}</small>`:""}</li>`)}`:""}
    ${a.dag&&a.dag.length?`<h4>${T("Voorbeelddag")}</h4>${li(a.dag,x=>`<li><b>${esc(x.maaltijd)}:</b> ${esc(x.voorstel)}</li>`)}`:""}
    ${a.leefstijl&&a.leefstijl.length?`<h4>${T("Leefstijl")}</h4>${li(a.leefstijl,x=>`<li>${esc(x)}</li>`)}`:""}
    ${a.arts&&a.arts.length?`<h4>${T("Bespreken met uw arts")}</h4>${li(a.arts,x=>`<li>${esc(x)}</li>`)}`:""}`;
}
function reportHTML(r,o,open){
  const buiten=r.waarden.filter(w=>w.status==="laag"||w.status==="hoog");
  const kop=`${DC.dateNL(r.datum)}${r.lab?`<span class="sep">·</span>${esc(r.lab)}`:""}`;
  const score=r.beoordeeld?T("{g} van {n} binnen bereik",{g:r.beoordeeld-r.buiten,n:r.beoordeeld}):Tn(r.totaal,"1 waarde","{n} waarden");
  let h=`<details class="bl-report"${open?" open":""}><summary><span class="bl-kop"><b>${kop}</b><small>${score}</small></span>${r.urgent?`<span class="pill warn urgent">${T("Dringend")}</span>`:r.buiten?`<span class="pill warn">${Tn(r.buiten,"1 afwijkend","{n} afwijkend")}</span>`:`<span class="pill ok">${T("Alles binnen bereik")}</span>`}</summary>`;
  if(r.urgent) h+=`<div class="note bl-urgent">${o.coach?T("Eén of meer waarden zijn sterk afwijkend. De cliënt krijgt het advies vandaag contact op te nemen met de arts."):T("Eén of meer waarden zijn sterk afwijkend. Neem vandaag nog contact op met uw arts of huisartsenpost.")}</div>`;
  if(r.samenvatting) h+=`<h3>${o.coach?T("Samenvatting voor de cliënt"):T("Samenvatting")}</h3><p class="bl-text">${esc(r.samenvatting)}</p>`;
  if(o.coach&&r.coachNotitie) h+=`<h3>${T("Voor u als coach")}</h3><p class="bl-text">${esc(r.coachNotitie)}</p>`;
  if(buiten.length) h+=`<h3>${T("Buiten het referentiebereik")}</h3><ul class="bl-out">${buiten.map(w=>`<li><div class="bl-out-h"><b>${esc(w.naam)}</b> ${pill(w)}</div>
    <div class="bl-out-v">${valStr(w)} ${esc(w.eenheid)} <small>${T("bereik {r}",{r:refStr(w)||"–"})}</small> ${trend(w)}</div>${w.uitleg?`<p>${esc(w.uitleg)}</p>`:""}</li>`).join("")}</ul>`;
  h+=`<section class="bl-advies"><h3>${T("Aanbevelingsplan")}</h3>${r.advies
      ?`${adviesHTML(r.advies)}<p class="fine" style="margin:8px 0 0">${T("Gemaakt op {d} op basis van deze uitslag en het huidige eetpatroon.",{d:DC.dateNL(new Date(r.advies.gemaakt*1000).toISOString().slice(0,10))})}</p>`
      :`<p class="sub" style="margin:0 0 8px">${o.coach?T("Een plan met concrete voedingsaanpassingen op basis van deze uitslag en wat de cliënt nu eet (intake, maaltijdplan en dagboek)."):T("Een plan met concrete aanpassingen op basis van deze uitslag en wat u nu eet.")}</p>`}
    <div class="actions" style="margin-top:8px"><button class="btn small${r.advies?" ghost":""}" type="button" data-bl-advies="${r.id}"${o.busyAdvies?" disabled":""}>${o.busyAdvies===r.id?T("Bezig met opstellen…"):r.advies?T("Opnieuw maken"):T("Aanbevelingsplan maken")}</button></div></section>`;
  h+=`<details class="bl-all"><summary>${T("Alle waarden ({n})",{n:r.totaal})}</summary><div class="table-scroll"><table class="bl-table"><thead><tr><th>${T("Test")}</th><th class="n">${T("Uitslag")}</th><th>${T("Referentie")}</th><th></th></tr></thead><tbody>
    ${r.waarden.map(w=>`<tr><td>${esc(w.naam)}${trend(w)}</td><td class="n">${valStr(w)} <small>${esc(w.eenheid)}</small></td><td><small>${refStr(w)}</small></td><td>${pill(w)}</td></tr>`).join("")}</tbody></table></div></details>`;
  h+=`<div class="actions bl-foot">${r.bestanden.map(b=>`<a class="btn small ghost" href="${o.src(r.id,b.n)}" target="_blank" rel="noopener">${r.bestanden.length>1?T("Origineel {n}",{n:b.n+1}):T("Origineel bekijken")}</a>`).join("")}
    <label class="btn small ghost"><input type="file" accept="application/pdf,image/*" multiple hidden data-bl-file data-bl-bij="${r.id}"${o.busy?" disabled":""}>${T("Pagina toevoegen")}</label>
    <button class="btn small" type="button" data-bl-pdf="${r.id}">${T("PDF-rapport")}</button>
    ${o.coach&&r.coachNotitie?`<button class="btn small ghost" type="button" data-bl-pdf="${r.id}" data-bl-coach>${T("PDF met coachnotities")}</button>`:""}
    <button class="btn small ghost" type="button" data-bl-edit="${r.id}">${T("Waarden corrigeren")}</button>
    <button class="btn small danger" type="button" data-bl-del="${r.id}">${T("Verwijderen")}</button></div>
    <p class="fine">${T("Deze samenvatting is automatisch gemaakt en is geen medische diagnose. Waarden worden beoordeeld met het referentiebereik van het laboratorium. Bespreek uw uitslagen altijd met uw arts.")}${r.door==="coach"?" "+T("Toegevoegd door de coach."):""}</p></details>`;
  return h;
}
const rowHTML=w=>`<tr data-bl-row><td><input name="naam" value="${esc(w.naam||"")}" maxlength="80" aria-label="${T("Test")}"></td>
  <td><input name="waarde" value="${esc(w.waarde!=null?fmtN(w.waarde):w.tekst||"")}" maxlength="40" inputmode="decimal" aria-label="${T("Uitslag")}"></td>
  <td><input name="eenheid" value="${esc(w.eenheid||"")}" maxlength="20" aria-label="${T("Eenheid")}"></td>
  <td><input name="ref" value="${esc(w.ref_tekst||(w.ref_min!=null&&w.ref_max!=null?fmtN(w.ref_min)+" - "+fmtN(w.ref_max):""))}" maxlength="40" placeholder="4.0 - 5.5" aria-label="${T("Referentie")}"></td>
  <td><button class="linkbtn" type="button" data-bl-rowdel aria-label="${T("Verwijderen")}">×</button></td></tr>`;
function editorHTML(e){
  const rows=e.rows.length?e.rows:[{},{},{}];
  return `<form class="bl-edit" data-bl-form novalidate>
    <h3>${e.id===null?T("Nieuw bloedonderzoek"):T("Waarden corrigeren")}</h3>
    <div class="row2"><label>${T("Datum van afname")}<input type="date" name="datum" value="${esc(e.datum||DC.today())}" max="${DC.today()}" required></label>
    <label>${T("Laboratorium")} <small>${T("optioneel")}</small><input name="lab" value="${esc(e.lab||"")}" maxlength="100"></label></div>
    <p class="sub">${T("Neem de waarden en het referentiebereik over zoals ze op het rapport staan, met dezelfde eenheid.")}</p>
    <div class="table-scroll"><table class="bl-table bl-edit-t"><thead><tr><th>${T("Test")}</th><th>${T("Uitslag")}</th><th>${T("Eenheid")}</th><th>${T("Referentie")}</th><th></th></tr></thead>
    <tbody>${rows.map(rowHTML).join("")}</tbody></table></div>
    <div class="actions"><button class="btn small ghost" type="button" data-bl-rowadd>${T("Regel toevoegen")}</button></div>
    <div class="actions"><button class="btn" type="submit">${T("Opslaan en analyseren")}</button><button class="btn ghost" type="button" data-bl-cancel>${T("Annuleren")}</button></div>
    <div class="flash" data-msg role="status"></div></form>`;
}
function readEditor(f){
  const waarden=[...f.querySelectorAll("[data-bl-row]")].map(tr=>{
    const v=n=>tr.querySelector(`[name=${n}]`).value.trim();
    return {naam:v("naam"),waarde:v("waarde"),eenheid:v("eenheid"),ref_tekst:v("ref")};
  }).filter(w=>w.naam&&w.waarde);
  return {datum:f.elements.datum.value,lab:f.elements.lab.value.trim(),waarden};
}

// printable report (the browser's "Save as PDF"); info: {naam, coach, merk}; metCoach adds the coach brief
function printHTML(r,info,metCoach){
  const merk=info.merk||{}, buiten=r.waarden.filter(w=>w.status==="laag"||w.status==="hoog");
  const status=w=>w.urgent?T("Dringend"):T((STATUS[w.status]||STATUS.onbekend)[1]);
  const tr=w=>w.vorige?`${fmtN(w.vorige.waarde)} <small>(${DC.dateNL(w.vorige.datum,{day:"numeric",month:"short",year:"numeric"})})</small>`:"–";
  return `<header class="p-head"><img src="${merk.logo||"/img/logo.webp"}" alt="${esc(merk.naam||"DCRAMERE")}"><div><p class="p-kicker">${T("Rapport bloedonderzoek")}</p><h1>${esc(info.naam||"")}</h1>
      <p>${T("Afname {d}",{d:DC.dateNL(r.datum)})}${r.lab?`<span class="sep">·</span>${esc(r.lab)}`:""}<span class="sep">·</span>${T("Opgesteld op {d}",{d:DC.dateNL(DC.today())})}<br>Coach: ${esc(info.coach||"")} — ${esc(merk.naam||"DCRAMERE")}</p></div></header>
    <div class="p-summary"><div><small>${T("Waarden")}</small><b>${r.totaal}</b></div><div><small>${T("Binnen bereik")}</small><b>${r.beoordeeld-r.buiten}</b></div><div><small>${T("Buiten bereik")}</small><b>${r.buiten}</b></div><div><small>${T("Zonder bereik")}</small><b>${r.totaal-r.beoordeeld}</b></div></div>
    ${r.urgent?`<p class="p-urgent">${T("Eén of meer waarden zijn sterk afwijkend. Neem vandaag nog contact op met uw arts of huisartsenpost.")}</p>`:""}
    ${r.samenvatting?`<h2>${T("Samenvatting")}</h2><p class="p-text">${esc(r.samenvatting)}</p>`:""}
    ${metCoach&&r.coachNotitie?`<h2>${T("Voor de coach")}</h2><p class="p-text">${esc(r.coachNotitie)}</p>`:""}
    ${buiten.length?`<h2>${T("Buiten het referentiebereik")}</h2>${buiten.map(w=>`<div class="p-bl-out"><b>${esc(w.naam)}</b> · ${valStr(w)} ${esc(w.eenheid)} <span class="p-bl-st">${status(w)}</span> <small>${T("bereik {r}",{r:refStr(w)||"–"})}${w.vorige?" · "+T("vorige: {v} ({d})",{v:fmtN(w.vorige.waarde),d:DC.dateNL(w.vorige.datum,{day:"numeric",month:"short",year:"numeric"})}):""}</small>${w.uitleg?`<p>${esc(w.uitleg)}</p>`:""}</div>`).join("")}`:""}
    ${r.advies?`<h2>${T("Aanbevelingsplan")}</h2><div class="p-advies">${adviesHTML(r.advies)}</div>`:""}
    <h2>${T("Alle waarden")}</h2>
    <table class="p-bl-table"><thead><tr><th>${T("Test")}</th><th class="n">${T("Uitslag")}</th><th>${T("Eenheid")}</th><th>${T("Referentie")}</th><th>${T("Beoordeling")}</th><th>${T("Vorige")}</th></tr></thead><tbody>
      ${r.waarden.map(w=>`<tr class="${w.status==="laag"||w.status==="hoog"?"uit":""}"><td>${esc(w.naam)}</td><td class="n">${valStr(w)}</td><td>${esc(w.eenheid)}</td><td>${refStr(w)}</td><td>${status(w)}</td><td>${tr(w)}</td></tr>`).join("")}</tbody></table>
    <p class="p-foot">${T("Deze samenvatting is automatisch gemaakt en is geen medische diagnose. Waarden worden beoordeeld met het referentiebereik van het laboratorium. Bespreek uw uitslagen altijd met uw arts.")}</p>`;
}
function printReport(r,info,metCoach){
  const el=document.getElementById("print"); el.innerHTML=printHTML(r,info,metCoach);
  const old=document.title; document.title=`${T("Bloedonderzoek")} ${info.naam||""} ${r.datum}`.trim(); // default PDF file name
  const go=()=>{document.body.classList.add("printing");window.print();document.body.classList.remove("printing");document.title=old};
  const img=el.querySelector("img"); if(img&&!img.complete){img.onload=go;img.onerror=go}else go();
}

// lab photos: larger than progress photos so small print stays readable; drawing to a canvas drops EXIF/GPS
async function prepare(file){
  if(file.type==="application/pdf") return file;
  if(!/^image\//.test(file.type)) throw new Error(T("Kies een PDF of een foto."));
  let img; try{img=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){throw new Error(T("Deze foto kan niet worden gelezen. Probeer een JPEG- of PNG-foto."))}
  const MAX=2400, r=Math.min(1,MAX/Math.max(img.width,img.height));
  const cv=document.createElement("canvas"); cv.width=Math.round(img.width*r); cv.height=Math.round(img.height*r);
  cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
  return await new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error(T("Verwerken van de foto is mislukt."))),"image/jpeg",0.9));
}
async function upload(url,blob){
  const r=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":blob.type||"application/octet-stream","x-taal":I18N.lang},body:blob});
  let data=null; try{data=await r.json()}catch(e){}
  if(!r.ok){const e=new Error((data&&data.error)||T("Uploaden is mislukt. Controleer uw internetverbinding."));e.status=r.status;throw e}
  return data;
}

// mounts the section in root. ctx: {coach, base (API path without trailing slash), get() → {bloed, bloedAkkoord}, set(list), onAkkoord(ts), api, info() → {naam, coach, merk}}
function mount(root,ctx){
  const st={editing:null,busy:false,data:null};
  const src=(id,n)=>`${ctx.base}/${id}/bestand/${n}`;
  const render=()=>{const d=ctx.get();if(d!==st.data){st.data=d;st.editing=null}root.innerHTML=html(d.bloed||[],{coach:ctx.coach,akkoord:d.bloedAkkoord,src,editing:st.editing,busy:st.busy,busyAdvies:st.busyAdvies})};
  const msg=t=>{const m=root.querySelector("[data-bl-msg]");if(m)m.textContent=t||""};
  const api=ctx.api||DC.api;
  root.addEventListener("click",async e=>{
    const t=e.target.closest("button,a"); if(!t) return;
    if(t.hasAttribute("data-bl-consent-ok")){
      if(!root.querySelector("[data-bl-consent]").checked){msg(T("Vink het vakje aan om toestemming te geven."));return}
      try{ctx.onAkkoord((await api("/api/bloed/akkoord","POST",{akkoord:true})).bloedAkkoord);render()}catch(x){msg(x.message)}
    }else if(t.hasAttribute("data-bl-new")){st.editing={id:null,rows:[]};render();root.querySelector("[data-bl-form] [name=naam]")?.focus()}
    else if(t.dataset.blAdvies){
      st.busyAdvies=+t.dataset.blAdvies; render();
      try{ctx.set((await api(`${ctx.base}/${t.dataset.blAdvies}/advies`,"POST",{})).bloed)}catch(x){alert(x.message)}
      st.busyAdvies=null; render();
    }
    else if(t.dataset.blPdf){const r=ctx.get().bloed.find(x=>x.id===+t.dataset.blPdf);if(r)printReport(r,ctx.info(),t.hasAttribute("data-bl-coach"))}
    else if(t.dataset.blEdit){const r=ctx.get().bloed.find(x=>x.id===+t.dataset.blEdit);st.editing={id:r.id,datum:r.datum,lab:r.lab,rows:r.waarden};render()}
    else if(t.hasAttribute("data-bl-cancel")){st.editing=null;render()}
    else if(t.hasAttribute("data-bl-rowadd")){const tb=root.querySelector("[data-bl-form] tbody");tb.insertAdjacentHTML("beforeend",rowHTML({}));tb.lastElementChild.querySelector("input").focus()}
    else if(t.hasAttribute("data-bl-rowdel")){t.closest("tr").remove()}
    else if(t.dataset.blDel){
      if(!confirm(T("Dit bloedonderzoek en het originele bestand definitief verwijderen?"))) return;
      try{ctx.set((await api(`${ctx.base}/${t.dataset.blDel}`,"DELETE")).bloed);render()}catch(x){alert(x.message)}
    }
  });
  root.addEventListener("submit",async e=>{
    const f=e.target.closest("[data-bl-form]"); if(!f) return;
    e.preventDefault();
    const m=f.querySelector("[data-msg]"), btn=f.querySelector("[type=submit]"), body=readEditor(f);
    if(!body.waarden.length){m.className="flash err";m.textContent=T("Vul minimaal één waarde in.");return}
    btn.disabled=true; m.className="flash"; m.textContent=T("Bezig met analyseren…");
    try{
      const r=st.editing.id===null?await api(ctx.base,"POST",body):await api(`${ctx.base}/${st.editing.id}`,"PUT",body);
      st.editing=null; ctx.set(r.bloed); render();
    }catch(x){btn.disabled=false;m.className="flash err";m.textContent=x.message}
  });
  root.addEventListener("change",async e=>{
    const inp=e.target.closest("[data-bl-file]"); if(!inp||!inp.files.length) return;
    const files=[...inp.files].slice(0,10); let bij=+inp.dataset.blBij||0;
    if(ctx.coach&&!root.querySelector("[data-bl-akkoord]")?.checked){inp.value="";msg(T("Bevestig eerst dat de cliënt toestemming heeft gegeven."));return}
    st.busy=true; st.editing=null; render();
    try{
      for(const f of files){
        const blob=await prepare(f);
        const q=new URLSearchParams({naam:f.name.slice(0,100)}); if(bij) q.set("bij",bij); if(ctx.coach) q.set("akkoord","1");
        const r=await upload(`${ctx.base}/upload?${q}`,blob);
        bij=bij||r.id; ctx.set(r.bloed);
      }
      st.busy=false; render();
    }catch(x){st.busy=false;render();msg(x.message)}
  });
  render();
  return {render};
}
window.BL={mount,html,printHTML};
})();
