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
  catch(e){if(e.status===401){coach=null;show("login")}else if(e.status===402){coach.status="verlopen";showBilling()} throw e}
}
// ---------- platform subscription ----------
function showBilling(){
  const betaling=coach.status==="betaling";
  $("t-cabo").textContent=betaling?"Abonnement afronden":"Abonnement niet actief";
  $("cAboTekst").textContent=betaling?"Uw account is aangemaakt. Start uw abonnement om cliënten te beheren."
    :"Uw platformabonnement is gestopt of de laatste betaling is niet gelukt. Uw cliënten en gegevens zijn bewaard; hervat het abonnement om verder te gaan.";
  $("cAboPortal").hidden=!coach.portaal;
  show("abonnement");
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-cbilling]"); if(!b) return;
  $("cAboMsg").textContent=""; b.disabled=true;
  try{const r=await DC.api(b.dataset.cbilling==="portal"?"/api/coach/billing/portal":"/api/coach/checkout","POST",{});location.href=r.url}
  catch(err){$("cAboMsg").textContent=err.message;b.disabled=false}
});
$("navBilling").addEventListener("click",async()=>{
  try{const r=await DC.api("/api/coach/billing/portal","POST",{});location.href=r.url}catch(err){alert(err.message)}
});
async function loadCoaches(){
  const list=await call("/api/coach/admin/coaches");
  const betalend=list.filter(k=>!k.is_owner&&k.status==="actief").length;
  $("coachStats").innerHTML=`<div><small>Coaches</small><b>${list.length}</b></div><div><small>Betalende coaches</small><b>${betalend}</b></div>`+
    `<div><small>Cliënten totaal</small><b>${list.reduce((t,k)=>t+k.clienten,0)}</b></div><div><small>Betalende cliënten</small><b>${list.reduce((t,k)=>t+k.betalend,0)}</b></div>`;
  const st=k=>k.is_owner?'<span class="pill gold">Eigenaar</span>':k.status==="actief"?'<span class="pill ok">Actief</span>':k.status==="betaling"?'<span class="pill">Wacht op betaling</span>':'<span class="pill warn">Verlopen</span>';
  $("coachLijst").innerHTML=`<table class="clients"><thead><tr><th>Coach</th><th>Status</th><th class="n">Cliënten</th><th class="n hide-sm">Betalend</th><th class="hide-sm">Sinds</th><th class="hide-sm">Periode tot</th></tr></thead><tbody>${list.map(k=>
    `<tr style="cursor:default"><td class="who"><b>${esc(k.naam)}</b><small>${esc(k.email)}</small></td><td>${st(k)}</td><td class="n">${k.clienten}</td><td class="n hide-sm">${k.betalend}</td><td class="hide-sm">${new Date(k.created_at*1000).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"})}</td><td class="hide-sm">${k.abo_einde?new Date(k.abo_einde*1000).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"}):"–"}</td></tr>`).join("")}</tbody></table>`;
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
    `<div><small>Ongelezen berichten</small><b class="${clients.some(c=>c.ongelezen)?"gold-t":""}">${clients.reduce((t,c)=>t+(c.ongelezen||0),0)}</b></div>`+
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
        <td class="who"><b>${esc(c.naam)}${c.ongelezen?` <span class="badge inline" title="Ongelezen berichten">${c.ongelezen}</span>`:""}</b><small>${esc(c.email)}</small>${why.length?`<small class="stale" style="display:block">${why.join('<span class="sep">·</span>')}</small>`:""}</td>
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
  $("pCheckins").innerHTML=DC.checkinsHTML(c.checkins)+checkinReplyHTML(c);
  $("paneBadge").hidden=!c.ongelezen; $("paneBadge").textContent=c.ongelezen>9?"9+":c.ongelezen;
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
// ---------- messages & check-in feedback ----------
let cchat=[], cchatPoll=null;
const cFoto=id=>"/api/coach/berichten/foto/"+id;
function checkinReplyHTML(c){
  const recent=(c.checkins||[]).slice(0,4);
  if(!recent.length) return "";
  return `<h2>Reageren op check-ins</h2><div class="kreply">${recent.map(k=>{
    const flags=DC.checkinFlags(k), fb=(c.feedback||[]).filter(b=>b.checkin_id===k.id);
    return `<article><p class="kicker">Week van ${DC.dateNL(k.datum,{day:"numeric",month:"long"})}</p>
      <p class="sub" style="margin:0 0 6px">${flags.length?`<span class="stale">Aandacht: ${flags.join(", ")}</span>`:"Geen bijzonderheden"}${k.opmerking?` · “${esc(k.opmerking)}”`:""}</p>
      ${fb.map(b=>`<div class="msg mine fb"><div class="msg-t">${esc(b.tekst)}</div></div>`).join("")}
      <form data-kreply="${k.id}" novalidate><textarea name="tekst" rows="2" placeholder="${fb.length?"Nog een reactie":"Uw reactie op deze week"}"></textarea><button class="btn small" type="submit">Verstuur</button></form></article>`;
  }).join("")}</div>`;
}
async function loadCChat(scroll){
  if(!cur) return;
  const id=cur.id, r=await call(`/api/coach/clients/${id}/berichten`);
  if(!cur||cur.id!==id) return;
  cchat=r.berichten; cur.ongelezen=0; $("paneBadge").hidden=true;
  const el=$("cChat"), atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<80;
  el.innerHTML=CHAT.messagesHTML(cchat,"coach",cFoto,cur.checkins);
  if(scroll||atBottom) el.scrollTop=el.scrollHeight;
}
function initCCompose(){
  if($("cCompose").firstChild) return;
  $("cCompose").innerHTML=CHAT.composerHTML();
  const f=$("cCompose").querySelector("form"), ta=f.elements.tekst, err=$("cCompose").querySelector("[data-chat-err]");
  ta.addEventListener("input",()=>CHAT.autoGrow(ta));
  ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();f.requestSubmit()}});
  f.addEventListener("submit",async e=>{
    e.preventDefault(); const t=ta.value.trim(); if(!t||!cur) return; err.textContent="";
    try{cchat=(await call(`/api/coach/clients/${cur.id}/berichten`,"POST",{tekst:t})).berichten;ta.value="";CHAT.autoGrow(ta);await loadCChat(true)}catch(x){err.textContent=x.message}
  });
  f.querySelector("[data-chat-foto]").addEventListener("change",async e=>{
    const file=e.target.files[0]; if(!file||!cur) return; err.textContent="Foto wordt verstuurd…";
    try{const blob=await DC.prepareFoto(file);await DC.uploadFoto(`/api/coach/clients/${cur.id}/berichten/foto?tekst=${encodeURIComponent(ta.value.trim())}`,blob);ta.value="";err.textContent="";await loadCChat(true)}
    catch(x){err.textContent=x.message} e.target.value="";
  });
}
document.addEventListener("submit",async e=>{
  const f=e.target.closest("[data-kreply]"); if(!f||!cur) return;
  e.preventDefault(); const t=f.elements.tekst.value.trim(); if(!t) return;
  f.querySelector("[type=submit]").disabled=true;
  try{await call(`/api/coach/clients/${cur.id}/berichten`,"POST",{tekst:t,checkin_id:+f.dataset.kreply});cur.feedback=(await call("/api/coach/clients/"+cur.id)).feedback;$("pCheckins").innerHTML=DC.checkinsHTML(cur.checkins)+checkinReplyHTML(cur)}
  catch(x){alert(x.message);f.querySelector("[type=submit]").disabled=false}
});
async function renderNavPush(){
  const st=await CHAT.pushState().catch(()=>"unsupported");
  $("navPush").hidden=st==="unsupported";
  $("navPush").textContent=st==="on"?"Meldingen aan":"Meldingen";
  $("navPush").dataset.state=st;
}
$("navPush").addEventListener("click",async()=>{
  const st=$("navPush").dataset.state;
  try{
    if(st==="on"){if(confirm("Meldingen op dit apparaat uitzetten?"))await CHAT.disablePush()}
    else if(st==="denied") alert(CHAT.PUSH_TEXT.denied);
    else{await CHAT.enablePush("coach");alert("Meldingen staan aan. U krijgt een melding bij nieuwe berichten en check-ins.")}
  }catch(x){alert(x.message)}
  renderNavPush();
});

function setPane(p){
  pane=p;
  document.querySelectorAll("[data-pane]").forEach(b=>{if(b.dataset.pane===p)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current")});
  document.querySelectorAll("[data-pane-body]").forEach(d=>d.hidden=d.dataset.paneBody!==p);
  if(p==="dagboek"&&cur) loadDiary();
  if(cchatPoll){clearInterval(cchatPoll);cchatPoll=null}
  if(p==="berichten"&&cur){initCCompose();loadCChat(true).catch(()=>{});cchatPoll=setInterval(()=>{if(!document.hidden)loadCChat().catch(()=>{})},15000)}
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
  const m=location.hash.match(/^#\/client\/(\d+)(?:\/(\w+))?/);
  try{
    if(location.hash==="#/coaches"&&coach.isOwner){cur=null;show("coaches");await loadCoaches();return}
    if(m){
      if(!cur||cur.id!==+m[1]){pane=m[2]||"plan";viewDag=null;cmpA=cmpB=null;trWeek=null;trSel=null;diary=null;cchat=[];$("cChat").innerHTML="";$("fotoDatum").value="";$("clientInvite").innerHTML="";}
      else if(m[2]) pane=m[2];
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

// back from Stripe Checkout: confirm the payment, then open the dashboard
async function afterPayment(sid){
  for(let i=0;i<12;i++){
    try{const r=await DC.api("/api/coach/checkout?session_id="+encodeURIComponent(sid));if(r.coachStatus==="actief"){coach.status="actief";return true}}catch(e){if(e.status&&e.status<500)return false}
    await new Promise(r=>setTimeout(r,1500));
  }
  return false;
}
async function signupInfo(){
  const p=await DC.api("/api/prijzen").catch(()=>null);
  if(p&&p.beschikbaar) $("aanmPrijs").textContent=`${fmtPrice(p.coach)} per maand, maandelijks opzegbaar. Maak uw account aan; daarna rondt u de betaling af bij onze betaalpartner Stripe.`;
  else if(p&&!p.beschikbaar){$("aanmPrijs").textContent=(p.coach?`${fmtPrice(p.coach)} per maand. `:"")+"Online aanmelden als coach opent binnenkort. Neem contact op via WhatsApp (+597 851 4920) om nu al te starten.";$("fSignup").querySelector("[type=submit]").disabled=true}
}
const fmtPrice=p=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:p.valuta}).format(p.bedrag);
DC.handleForm($("fSignup"),async f=>{
  if(!f.elements.akkoord.checked) throw new Error("Ga akkoord met de voorwaarden en de privacyverklaring.");
  const r=await DC.api("/api/coach/signup","POST",{naam:f.elements.naam.value,email:f.elements.email.value,password:f.elements.password.value,akkoord:true});
  location.href=r.url;
  return "U wordt doorgestuurd naar Stripe…";
});
async function boot(){
  const q=new URLSearchParams(location.search);
  try{
    coach=await DC.api("/api/coach/me");
    $("coachNaam").textContent=coach.naam;
    $("navCoaches").hidden=!coach.isOwner;
    renderNavPush();
    $("navBilling").hidden=coach.isOwner||!coach.portaal;
    if(q.get("betaald")){show("laden");await afterPayment(q.get("betaald"));history.replaceState(null,"","/coach/");coach=await DC.api("/api/coach/me");$("navBilling").hidden=coach.isOwner||!coach.portaal}
    if(coach.status!=="actief"){showBilling();return}
    await route();
  }catch(err){
    if(err.status===401&&q.has("aanmelden")){coach=null;show("aanmelden");signupInfo();return}
    coach=null;
    if(err.status===401){
      const s=await DC.api("/api/coach/status").catch(()=>({setupNodig:false}));
      show(s.setupNodig?"setup":"login");
    }else{show("login");const msg=$("fLogin").querySelector("[data-msg]");msg.className="err";msg.textContent=err.message}
  }
}
boot();
})();
