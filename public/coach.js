// DCRAMERE Voeding — coach dashboard
(function(){
"use strict";
const DC=window.DC, esc=DC.esc, $=id=>document.getElementById(id);
const STALE_DAYS=14, CHECKIN_LATE=10;
let coach=null, clients=[], cur=null, pane="plan", viewDag=null, cmpA=null, cmpB=null, trWeek=null, trSel=null, diary=null;
const fotoSrc=id=>"/api/coach/fotos/"+id;

$("fMeting").querySelector("[data-fields]").innerHTML=DC.metingFieldsHTML({open:true});
$("fProfiel").querySelector("[data-fields]").innerHTML=DC.profielFieldsHTML();

function show(v){
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));
  $("topbar").hidden=!coach;
  window.scrollTo(0,0);
}
async function call(path,method,body){
  try{return await DC.api(path,method,body)}
  catch(e){if(e.status===401){coach=null;show("login")} throw e}
}

// ---------- helpers ----------
function status(c){
  if(!c.actief) return ["Gedeactiveerd",""];
  if(!c.geactiveerd) return c.uitnodigingVerloopt&&c.uitnodigingVerloopt*1000<Date.now()?["Link verlopen","warn"]:["Uitgenodigd","gold"];
  return ["Actief","ok"];
}
const pill=c=>{const [l,k]=status(c);return `<span class="pill ${k}">${l}</span>`};
const checkinLate=c=>c.laatste&&(!c.checkin||DC.daysSince(c.checkin.datum)>CHECKIN_LATE);
function attentionReasons(c){
  if(!c.actief) return [];
  if(!c.geactiveerd) return status(c)[0]==="Link verlopen"?["uitnodiging verlopen"]:[];
  const r=[];
  if(!c.intake) r.push("intake leeg");
  if(!c.laatste) r.push("nog geen meting");
  else if(DC.daysSince(c.laatste.datum)>STALE_DAYS) r.push("lang niet gewogen");
  if(checkinLate(c)) r.push("check-in achter");
  const fotoAge=c.laatsteFoto?DC.daysSince(c.laatsteFoto):Math.floor((Date.now()/1000-c.aangemaakt)/86400);
  if(c.laatste&&fotoAge>DC.FOTO_EVERY+7) r.push("foto's achter");
  if(c.programma&&DC.daysSince(c.programma.start)>=7&&(!c.laatsteTraining||DC.daysSince(c.laatsteTraining)>7)) r.push("training achter");
  const flags=DC.checkinFlags(c.checkin);
  if(flags.length) r.push(flags.join(", "));
  return r;
}
const needsAttention=c=>attentionReasons(c).length>0;
function ago(days){return days<=0?"vandaag":days===1?"gisteren":days+" dagen geleden"}
function inviteHTML(naam,link){
  const first=naam.split(" ")[0];
  const wa="https://wa.me/?text="+encodeURIComponent(`Beste ${first}, hierbij uw persoonlijke link voor DCRAMERE Voeding. Kies een wachtwoord, en uw voedingsplan staat klaar: ${link}`);
  return `<div class="invite"><p><b>Persoonlijke link voor ${esc(naam)}</b>. De link is 14 dagen geldig en werkt één keer. Stuur hem via WhatsApp of e-mail.</p>
    <div class="copyrow"><input readonly value="${esc(link)}" aria-label="Uitnodigingslink"><button class="btn small" type="button" data-copy>Kopiëren</button></div>
    <a class="btn small ghost" href="${esc(wa)}" target="_blank" rel="noopener">Delen via WhatsApp</a></div>`;
}

// ---------- list ----------
async function loadList(){
  clients=await call("/api/coach/clients");
  renderList();
}
function renderList(){
  const act=clients.filter(c=>c.actief);
  const week=act.filter(c=>c.checkin&&DC.daysSince(c.checkin.datum)<=7).length;
  const attn=clients.filter(needsAttention).length;
  const deltas=act.filter(c=>c.aantal>1).map(c=>c.laatste.gewicht-c.eerste.gewicht);
  const avg=deltas.length?deltas.reduce((a,b)=>a+b,0)/deltas.length:null;
  $("stats").innerHTML=
    `<div><small>Actieve cliënten</small><b>${act.length}</b></div>`+
    `<div><small>Check-ins, laatste 7 dagen</small><b>${week}</b></div>`+
    `<div><small>Aandacht nodig</small><b class="${attn?"stale":""}">${attn}</b></div>`+
    `<div><small>Gem. verandering sinds start</small><b>${avg==null?"–":DC.signed(avg)+'<span class="unit">kg</span>'}</b></div>`;

  const q=$("zoek").value.trim().toLowerCase(), f=$("filter").value;
  const rows=clients.filter(c=>(!q||c.naam.toLowerCase().includes(q)||c.email.includes(q))&&
    (!f||(f==="aandacht"&&needsAttention(c))||(f==="uitgenodigd"&&c.actief&&!c.geactiveerd)||(f==="inactief"&&!c.actief)));
  if(!clients.length){$("lijst").innerHTML='<p class="empty">Nog geen cliënten. Klik op "Nieuwe cliënt" om de eerste uit te nodigen.</p>';return}
  if(!rows.length){$("lijst").innerHTML='<p class="empty">Geen cliënten gevonden.</p>';return}
  $("lijst").innerHTML=`<table class="clients"><thead><tr><th>Cliënt</th><th>Status</th><th>Laatste meting</th><th class="hide-sm">Check-in</th><th class="n">Gewicht</th><th class="n hide-sm">Sinds start</th><th class="n hide-sm">Dagdoel</th></tr></thead><tbody>`+
    rows.map(c=>{
      const l=c.laatste, d=l?DC.daysSince(l.datum):null;
      let kcal="–";
      if(c.profiel&&l){
        const A=DC.analyse(c.profiel,l), D=DC.dagTargets(c.profiel,A);
        kcal=DC.fmt(A.kcal)+" kcal"+(D?`<br><small style="color:var(--muted)">T ${DC.fmt(D.train.kcal)}<span class="sep">·</span>R ${DC.fmt(D.rust.kcal)}</small>`:"");
      }
      const delta=c.aantal>1?DC.signed(l.gewicht-c.eerste.gewicht)+" kg":"–";
      const why=attentionReasons(c);
      const k=c.checkin, kd=k?DC.daysSince(k.datum):null, flags=DC.checkinFlags(k);
      return `<tr data-id="${c.id}" tabindex="0">
        <td class="who"><b>${esc(c.naam)}</b><small>${esc(c.email)}</small>${why.length?`<small class="stale" style="display:block">${why.join('<span class="sep">·</span>')}</small>`:""}</td>
        <td>${pill(c)}${c.profiel?`<br><small style="color:var(--muted)">${DC.DOEL_LABEL[String(c.profiel.doel)]||""}</small>`:""}</td>
        <td>${l?`${DC.dateNL(l.datum,{day:"numeric",month:"short",year:"numeric"})}<br><small class="${d>STALE_DAYS&&c.actief?"stale":""}" style="${d>STALE_DAYS&&c.actief?"":"color:var(--muted)"}">${ago(d)}</small>`:'<span style="color:var(--muted)">nog geen</span>'}</td>
        <td class="hide-sm">${k?`${ago(kd)}<br><small class="${flags.length?"stale":""}" style="${flags.length?"":"color:var(--muted)"}">${flags.length?flags.join(", "):"geen bijzonderheden"}</small>`:'<span style="color:var(--muted)">–</span>'}</td>
        <td class="n">${l?DC.fmt(l.gewicht,1)+" kg":"–"}</td>
        <td class="n hide-sm">${delta}</td>
        <td class="n hide-sm">${kcal}</td></tr>`;
    }).join("")+`</tbody></table>`;
}
$("zoek").addEventListener("input",renderList);
$("filter").addEventListener("change",renderList);
$("lijst").addEventListener("click",e=>{const tr=e.target.closest("tr[data-id]");if(tr) location.hash="#/client/"+tr.dataset.id});
$("lijst").addEventListener("keydown",e=>{const tr=e.target.closest("tr[data-id]");if(tr&&e.key==="Enter") location.hash="#/client/"+tr.dataset.id});
$("toggleNew").addEventListener("click",()=>{$("fNew").hidden=false;$("newInvite").innerHTML="";$("fNew").elements.naam.focus()});
$("cancelNew").addEventListener("click",()=>{$("fNew").hidden=true;$("fNew").reset()});
DC.handleForm($("fNew"),async f=>{
  const naam=f.elements.naam.value.trim();
  const res=await call("/api/coach/clients","POST",{naam,email:f.elements.email.value});
  f.reset(); f.hidden=true;
  $("newInvite").innerHTML=inviteHTML(naam,res.link);
  await loadList();
});

// ---------- client detail ----------
async function loadClient(id){
  cur=await call("/api/coach/clients/"+id);
  renderClient();
}
function renderClient(){
  const c=cur, [st]=status(c);
  DC.setCustomFoods(c.producten); // the client's own products can appear in their menu
  $("clientHead").innerHTML=`<h1 style="margin-top:14px">${esc(c.naam)}</h1>
    <p class="sub">${esc(c.email)}<span class="sep">·</span>${pill(c)}<span class="sep">·</span>cliënt sinds ${new Date(c.aangemaakt*1000).toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"})}${c.laatstGezien?`<span class="sep">·</span>laatst actief ${ago(DC.daysSince(new Date(c.laatstGezien*1000).toISOString().slice(0,10)))}`:""}${c.privacyAkkoord?`<span class="sep">·</span>privacy akkoord ${new Date(c.privacyAkkoord*1000).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"})}`:""}</p>
    <div class="actions" style="margin-top:0">
      ${c.actief?`<button class="btn small ghost" type="button" data-act="invite">${c.geactiveerd?"Nieuwe inloglink (wachtwoord vergeten)":st==="Link verlopen"?"Nieuwe uitnodigingslink":"Uitnodigingslink opnieuw maken"}</button>`:""}
      <button class="btn small ghost" type="button" data-act="toggle">${c.actief?"Deactiveren":"Activeren"}</button>
      <button class="btn small danger" type="button" data-act="delete">Verwijderen</button>
    </div>`;
  const m=DC.latest(c.metingen);
  $("pPlan").innerHTML=!c.profiel?'<p class="empty">Het profiel is nog niet ingevuld. Vul het in onder Profiel, of wacht tot de cliënt dit zelf doet.</p>'
    :!m?'<p class="empty">Nog geen meting. Voeg er een toe onder Metingen.</p>'
    :DC.planHTML(c.profiel,m,c.menu,{coach:true,dag:viewDag});
  $("pShop").innerHTML="";
  $("pHist").innerHTML=c.metingen.length&&c.profiel?DC.historyHTML(c.profiel,c.metingen,{coach:true})
    :c.metingen.length?'<p class="empty">Vul eerst het profiel in om de analyse te zien.</p>':'<p class="empty">Nog geen metingen.</p>';
  $("pCheckins").innerHTML=DC.checkinsHTML(c.checkins);
  $("pIntake").innerHTML=DC.intakeSummaryHTML(c.intake);
  renderFotos();
  renderTraining();
  $("pProducts").innerHTML=VD.productsTableHTML(c.producten);
  const fp=$("fProfiel");
  fp.reset(); fp.elements.naam.value=c.naam; fp.elements.email.value=c.email; DC.fillProfiel(fp,c.profiel);
  $("fNotities").elements.notities.value=c.notities||"";
  setPane(pane);
}
function renderFotos(){
  const d=$("fotoDatum"); if(!d.value) d.value=DC.today();
  $("pFotoCompare").innerHTML=DC.fotoCompareHTML(cur.fotos,fotoSrc,cmpA,cmpB);
  $("pFotoUpload").innerHTML=DC.fotoUploadHTML(cur.fotos,d.value,fotoSrc,{del:true});
}
$("fotoDatum").addEventListener("change",()=>cur&&renderFotos());
document.addEventListener("change",async e=>{
  if(!cur) return;
  const cmp=e.target.closest("[data-foto-cmp]");
  if(cmp){if(cmp.dataset.fotoCmp==="a")cmpA=cmp.value;else cmpB=cmp.value;renderFotos();return}
  const inp=e.target.closest("input[data-foto-pose]"); if(!inp||!inp.files[0]) return;
  const slot=inp.closest(".foto-slot"), msg=$("fotoMsg");
  slot.classList.add("busy"); msg.className="flash"; msg.textContent="Foto wordt geüpload…";
  try{
    const blob=await DC.prepareFoto(inp.files[0]);
    cur.fotos=(await DC.uploadFoto(`/api/coach/clients/${cur.id}/fotos?datum=${$("fotoDatum").value}&pose=${inp.dataset.fotoPose}`,blob)).fotos;
    renderFotos(); msg.textContent="Foto opgeslagen.";
  }catch(err){slot.classList.remove("busy");msg.className="err";msg.textContent=err.message}
});
function renderTraining(){
  const c=cur, P=c.programma;
  if(!P){
    $("pTrAssign").innerHTML=`<h2 style="margin-top:0">Trainingsprogramma toewijzen</h2>
      <p class="sub">${esc(c.naam)} heeft nog geen trainingsprogramma. Na het toewijzen verschijnt het tabblad Training in de app van de cliënt.</p>
      <form id="fTrAssign" class="narrow" novalidate><label>Programma<select name="id">${Object.values(TR.PROGRAMS).map(p=>`<option value="${p.id}">${p.naam} (${p.sub})</option>`).join("")}</select></label>
      <label>Startdatum (week 1)<input type="date" name="start" value="${DC.today()}" required></label>
      <div><button class="btn" type="submit">Toewijzen</button></div><div class="flash" data-msg role="status"></div></form>`;
    ["pTrOverview","pTrDetail","pTrGrid","pTrProgress"].forEach(id=>$(id).innerHTML="");
    DC.handleForm($("fTrAssign"),async f=>{
      cur=await call("/api/coach/clients/"+cur.id,"PUT",{programma:{id:f.elements.id.value,start:f.elements.start.value}});
      trWeek=null; renderClient();
    });
    return;
  }
  if(trWeek==null) trWeek=TR.weekOf(P.start);
  $("pTrAssign").innerHTML=`<div class="actions" style="margin:0 0 6px;justify-content:flex-end"><label style="display:flex;gap:8px;align-items:center;font-weight:400">Startdatum<input type="date" id="trStart" value="${P.start}" style="width:auto;padding:6px 8px"></label><button class="btn small danger" type="button" data-tr-remove>Programma verwijderen</button></div>`;
  $("pTrOverview").innerHTML=TR.overviewHTML(P,c.workouts,trWeek,{coach:true});
  const w=trSel&&c.workouts.find(x=>x.week===trSel.week&&x.dag===trSel.dag);
  $("pTrDetail").innerHTML=trSel?(w?`<div class="tr-detail">${TR.workoutHTML(P,c.workouts,w,{readonly:true})}</div>`
    :`<p class="empty">${TR.dayOf(P.id,trSel.dag).naam} van week ${trSel.week} is nog niet gelogd.</p>`):"";
  $("pTrGrid").innerHTML=`<h2>Alle weken</h2>${TR.coachGridHTML(P,c.workouts,trSel)}`;
  $("pTrProgress").innerHTML=`<h2>Krachtprogressie</h2>${TR.progressionHTML(P,c.workouts)}`;
  $("trStart").onchange=async e=>{
    try{cur=await call("/api/coach/clients/"+cur.id,"PUT",{programma:{id:P.id,start:e.target.value}});trWeek=null;renderClient()}catch(err){alert(err.message)}
  };
}
const isoDaysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
async function loadDiary(){
  const id=cur.id, van=isoDaysAgo(13), tot=DC.today();
  if(diary&&diary.id===id&&diary.tot===tot) return renderDiary();
  try{const r=await call(`/api/coach/clients/${id}/dagboek?van=${van}&tot=${tot}`);diary={id,van,tot,items:r.items,dag:null};renderDiary()}
  catch(err){$("pDiary").innerHTML=`<p class="err">${esc(err.message)}</p>`}
}
function renderDiary(){
  if(!cur||!diary||diary.id!==cur.id) return;
  $("pDiary").innerHTML=cur.profiel&&cur.metingen.length?VD.coachDiaryHTML(diary.items,cur.profiel,cur.metingen,diary.van,diary.tot)
    :'<p class="empty">Het dagboek toont de doelen zodra het profiel en een meting zijn ingevuld.</p>'+VD.coachDiaryHTML(diary.items,null,[],diary.van,diary.tot);
  const d=diary.dag;
  $("pDiaryDay").innerHTML=d?`<div class="tr-detail"><h2 style="margin-top:12px">${DC.dateNL(d,{weekday:"long",day:"numeric",month:"long"})}</h2>
    ${VD.barsHTML(VD.sum(diary.items.filter(i=>i.datum===d)),DC.targetFor(cur.profiel,cur.metingen,d))}${VD.entriesHTML(diary.items.filter(i=>i.datum===d))}</div>`:"";
}
function setPane(p){
  pane=p;
  document.querySelectorAll("[data-pane]").forEach(b=>{if(b.dataset.pane===p)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current")});
  document.querySelectorAll("[data-pane-body]").forEach(d=>d.hidden=d.dataset.paneBody!==p);
  if(p==="dagboek"&&cur) loadDiary();
}
document.querySelector(".seg").addEventListener("click",e=>{const b=e.target.closest("[data-pane]");if(b) setPane(b.dataset.pane)});

document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){
    const input=copy.parentElement.querySelector("input");
    try{await navigator.clipboard.writeText(input.value)}catch(err){input.select();document.execCommand("copy")}
    copy.textContent="Gekopieerd"; setTimeout(()=>copy.textContent="Kopiëren",1500); return;
  }
  const dd=e.target.closest("[data-diary-day]");
  if(dd&&diary){diary.dag=diary.dag===dd.dataset.diaryDay?null:dd.dataset.diaryDay;renderDiary();if(diary.dag)$("pDiaryDay").scrollIntoView({behavior:"smooth",block:"start"});return}
  const trb=e.target.closest("[data-tr-week],[data-tr-day],[data-tr-cell],[data-tr-remove]");
  if(trb&&cur){
    if(trb.dataset.trWeek){trWeek=+trb.dataset.trWeek;trSel=null}
    else if(trb.dataset.trDay){trSel={week:trWeek,dag:trb.dataset.trDay}}
    else if(trb.dataset.trCell){const [w,d]=trb.dataset.trCell.split(":");trWeek=+w;trSel={week:+w,dag:d}}
    else if(trb.hasAttribute("data-tr-remove")){
      if(!confirm("Het trainingsprogramma bij deze cliënt verwijderen? De gelogde trainingen blijven bewaard en komen terug als u het programma opnieuw toewijst.")) return;
      try{cur=await call("/api/coach/clients/"+cur.id,"PUT",{programma:null})}catch(err){alert(err.message);return}
    }
    renderTraining();
    if(trSel&&$("pTrDetail").firstElementChild) $("pTrDetail").scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  const dag=e.target.closest("[data-dag]");
  if(dag&&cur){viewDag=dag.dataset.dag;renderClient();return}
  const m=cur&&cur.profiel&&DC.latest(cur.metingen);
  if(e.target.closest("[data-boodschappen]")&&m){
    $("pShop").innerHTML=`<h2>Boodschappenlijst</h2>${DC.shoppingHTML(cur.profiel,m,cur.menu)}`;
    $("pShop").scrollIntoView({behavior:"smooth",block:"start"}); return;
  }
  if(e.target.closest("[data-print]")&&m){DC.printPlan(cur.profiel,m,cur.menu,{naam:cur.naam,coach:coach.naam});return}
  const fdel=e.target.closest("[data-foto-del]");
  if(fdel&&cur){
    if(!confirm("Deze foto verwijderen?")) return;
    try{cur.fotos=(await call(`/api/coach/clients/${cur.id}/fotos/${fdel.dataset.fotoDel}`,"DELETE")).fotos;renderFotos()}catch(err){alert(err.message)}
    return;
  }
  const del=e.target.closest("[data-del]");
  if(del&&cur){
    if(!confirm("Deze meting verwijderen?")) return;
    try{cur.metingen=(await call(`/api/coach/clients/${cur.id}/metingen/${del.dataset.del}`,"DELETE")).metingen;renderClient()}catch(err){alert(err.message)}
    return;
  }
  const act=e.target.closest("[data-act]");
  if(!act||!cur) return;
  try{
    if(act.dataset.act==="invite"){
      if(cur.geactiveerd&&!confirm("Een nieuwe inloglink maken? Met deze link kiest de cliënt een nieuw wachtwoord. Het huidige wachtwoord blijft werken tot de link is gebruikt.")) return;
      const res=await call(`/api/coach/clients/${cur.id}/uitnodiging`,"POST",{});
      $("clientInvite").innerHTML=inviteHTML(cur.naam,res.link);
      cur=await call("/api/coach/clients/"+cur.id); renderClient();
    }else if(act.dataset.act==="toggle"){
      if(cur.actief&&!confirm(`${cur.naam} deactiveren? De cliënt wordt direct uitgelogd en kan niet meer inloggen. De gegevens blijven bewaard.`)) return;
      cur=await call("/api/coach/clients/"+cur.id,"PUT",{actief:!cur.actief}); $("clientInvite").innerHTML=""; renderClient();
    }else if(act.dataset.act==="delete"){
      const typed=prompt(`Hiermee worden ${cur.naam} en alle metingen definitief verwijderd. Dit kan niet ongedaan worden gemaakt.\n\nTyp VERWIJDEREN om te bevestigen.`);
      if(typed!=="VERWIJDEREN") return;
      await call("/api/coach/clients/"+cur.id,"DELETE"); cur=null; location.hash="#/";
    }
  }catch(err){alert(err.message)}
});

DC.handleForm($("fMeting"),async f=>{
  cur.metingen=(await call(`/api/coach/clients/${cur.id}/metingen`,"POST",DC.readMeting(f))).metingen;
  f.reset(); f.elements.datum.value=DC.today(); renderClient();
  return "Meting opgeslagen.";
});
DC.handleForm($("fProfiel"),async f=>{
  cur=await call("/api/coach/clients/"+cur.id,"PUT",{naam:f.elements.naam.value,email:f.elements.email.value,profiel:DC.readProfiel(f)});
  renderClient();
  return "Opgeslagen.";
});
DC.handleForm($("fNotities"),async f=>{
  cur=await call("/api/coach/clients/"+cur.id,"PUT",{notities:f.elements.notities.value});
  return "Notities opgeslagen.";
});

// ---------- auth ----------
DC.handleForm($("fSetup"),async f=>{
  const e=f.elements;
  if(e.password.value!==e.password2.value) throw new Error("De wachtwoorden zijn niet gelijk.");
  await DC.api("/api/coach/setup","POST",{code:e.code.value,naam:e.naam.value,email:e.email.value,password:e.password.value});
  f.reset(); await boot();
});
DC.handleForm($("fLogin"),async f=>{
  await DC.api("/api/coach/login","POST",{email:f.elements.email.value,password:f.elements.password.value});
  f.reset(); await boot();
});
$("logout").addEventListener("click",async()=>{
  try{await DC.api("/api/coach/logout","POST",{})}catch(e){}
  coach=null; show("login");
});

// ---------- routing ----------
async function route(){
  if(!coach) return;
  const m=location.hash.match(/^#\/client\/(\d+)/);
  try{
    if(m){
      if(!cur||cur.id!==+m[1]){pane="plan";viewDag=null;cmpA=cmpB=null;trWeek=null;trSel=null;diary=null;$("fotoDatum").value="";$("clientInvite").innerHTML="";}
      show("client"); await loadClient(+m[1]);
    }else{
      cur=null; show("lijst"); await loadList();
    }
  }catch(err){
    if(err.status===404){location.hash="#/";return}
    if(err.status!==401) alert(err.message);
  }
}
window.addEventListener("hashchange",route);

async function boot(){
  try{
    coach=await DC.api("/api/coach/me");
    $("coachNaam").textContent=coach.naam;
    await route();
  }catch(err){
    coach=null;
    if(err.status===401){
      const s=await DC.api("/api/coach/status").catch(()=>({setupNodig:false}));
      show(s.setupNodig?"setup":"login");
    }else{show("login");const msg=$("fLogin").querySelector("[data-msg]");msg.className="err";msg.textContent=err.message}
  }
}
boot();
})();
