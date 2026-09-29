// DCRAMERE Voeding — coach dashboard
(function(){
"use strict";
const DC=window.DC, esc=DC.esc, $=id=>document.getElementById(id);
const STALE_DAYS=14, CHECKIN_LATE=10;
let coach=null, clients=[], cur=null, pane="plan", viewDag=null;

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
  const fp=$("fProfiel");
  fp.reset(); fp.elements.naam.value=c.naam; fp.elements.email.value=c.email; DC.fillProfiel(fp,c.profiel);
  $("fNotities").elements.notities.value=c.notities||"";
  setPane(pane);
}
function setPane(p){
  pane=p;
  document.querySelectorAll("[data-pane]").forEach(b=>{if(b.dataset.pane===p)b.setAttribute("aria-current","true");else b.removeAttribute("aria-current")});
  document.querySelectorAll("[data-pane-body]").forEach(d=>d.hidden=d.dataset.paneBody!==p);
}
document.querySelector(".seg").addEventListener("click",e=>{const b=e.target.closest("[data-pane]");if(b) setPane(b.dataset.pane)});

document.addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy]");
  if(copy){
    const input=copy.parentElement.querySelector("input");
    try{await navigator.clipboard.writeText(input.value)}catch(err){input.select();document.execCommand("copy")}
    copy.textContent="Gekopieerd"; setTimeout(()=>copy.textContent="Kopiëren",1500); return;
  }
  const dag=e.target.closest("[data-dag]");
  if(dag&&cur){viewDag=dag.dataset.dag;renderClient();return}
  const m=cur&&cur.profiel&&DC.latest(cur.metingen);
  if(e.target.closest("[data-boodschappen]")&&m){
    $("pShop").innerHTML=`<h2>Boodschappenlijst</h2>${DC.shoppingHTML(cur.profiel,m,cur.menu)}`;
    $("pShop").scrollIntoView({behavior:"smooth",block:"start"}); return;
  }
  if(e.target.closest("[data-print]")&&m){DC.printPlan(cur.profiel,m,cur.menu,{naam:cur.naam,coach:coach.naam});return}
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
      if(!cur||cur.id!==+m[1]){pane="plan";viewDag=null;$("clientInvite").innerHTML="";}
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
