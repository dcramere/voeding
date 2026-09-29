// DCRAMERE Voeding — client app
(function(){
"use strict";
const DC=window.DC, $=id=>document.getElementById(id);
const COACH_WHATSAPP="5978514920";
const AUTH_VIEWS=["login","vergeten","uitnodiging","laden","toestemming"];
const TAB_VIEWS=["plan","checkin","voortgang","profiel"];
const CHECKIN_EVERY=7; // days
let me=null, menuTimer=null, inviteToken=null, viewDag=null; // viewDag null = today's day type
let cmpA=null, cmpB=null; // photo comparison dates (null = first / latest)
const fotoSrc=id=>"/api/fotos/"+id;

$("fMeting").querySelector("[data-fields]").innerHTML=DC.metingFieldsHTML();
$("fCheckin").querySelector("[data-fields]").innerHTML=DC.checkinFieldsHTML();
$("fProfiel").querySelector("[data-fields]").innerHTML=DC.profielFieldsHTML();
$("fIntake").querySelector("[data-fields]").innerHTML=DC.intakeFieldsHTML();
document.querySelector("#fotoSection [data-tips]").innerHTML=DC.FOTO_TIPS;
$("waHelp").href="https://wa.me/"+COACH_WHATSAPP+"?text="+encodeURIComponent("Hallo Dino, ik heb hulp nodig met inloggen bij DCRAMERE Voeding. Kunt u mij een nieuwe inloglink sturen?");

function show(v){
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));
  $("tabs").hidden=!TAB_VIEWS.includes(v)||onboarding();
  $("topbar").hidden=AUTH_VIEWS.includes(v);
  document.querySelectorAll("#tabs button").forEach(b=>{if(b.dataset.v===v)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  if(v==="boodschappen") renderShop();
  window.scrollTo(0,0);
}
// first-run: intake → profiel → first weight
const onboarding=()=>!!me&&(!me.privacyAkkoord||!me.intake||!me.profiel||!me.metingen.length);
function nextStep(){return !me.privacyAkkoord?"toestemming":!me.intake?"intake":!me.profiel?"profiel":!me.metingen.length?"checkin":"plan"}

// ---------- rendering ----------
const lastCheckin=()=>me.checkins&&me.checkins.length?me.checkins[0]:null;
function checkinDue(){const k=lastCheckin();return !k||DC.daysSince(k.datum)>=CHECKIN_EVERY}
function renderPlan(){
  const el=$("plan"), P=me.profiel, m=DC.latest(me.metingen);
  if(!P||!m){el.innerHTML="";return}
  const ck=checkinDue(), ft=DC.fotosDue(me.fotos);
  const msg=ck&&ft?"<b>Tijd voor uw check-in en nieuwe progressiefoto's.</b> Weeg uzelf, laat weten hoe uw week ging en maak drie foto's."
    :ck?"<b>Tijd voor uw wekelijkse check-in.</b> Weeg uzelf en laat uw coach weten hoe uw week ging."
    :ft?`<b>Tijd voor nieuwe progressiefoto's.</b> ${me.fotos.length?"Het is 4 weken geleden sinds uw laatste set.":"Maak een eerste set als startpunt."}`:"";
  const banner=msg?`<div class="banner"><span>${msg}</span><button class="btn small" type="button" data-v="checkin"${!ck&&ft?" data-goto-fotos":""}>${!ck&&ft?"Foto's maken":"Check-in"}</button></div>`:"";
  el.innerHTML=DC.planHTML(P,m,me.menu,{interactive:true,dag:viewDag,banner});
}
function renderShop(){
  const m=DC.latest(me.metingen);
  $("shop").innerHTML=me.profiel&&m?DC.shoppingHTML(me.profiel,m,me.menu):'<p class="empty">Uw boodschappenlijst verschijnt zodra uw plan klaar is.</p>';
}
function renderProgress(){
  let h=me.profiel&&me.metingen.length?DC.historyHTML(me.profiel,me.metingen)
    :'<p class="empty">Uw voortgang verschijnt hier zodra u een meting heeft opgeslagen.</p>';
  if(me.fotos.length) h+=`<h2>Progressiefoto's</h2>${DC.fotoCompareHTML(me.fotos,fotoSrc,cmpA,cmpB)}`;
  if(me.checkins&&me.checkins.length) h+=`<h2>Uw check-ins</h2>${DC.checkinsHTML(me.checkins)}`;
  $("prog").innerHTML=h;
}
function renderCheckin(){
  const k=lastCheckin(), first=!me.metingen.length;
  $("t-meting").textContent=first?"Uw eerste meting":"Check-in";
  $("weekTitle").hidden=$("weekSub").hidden=$("fCheckin").hidden=first;
  $("weekSub").textContent=k&&!checkinDue()
    ?`U heeft op ${DC.dateNL(k.datum,{day:"numeric",month:"long"})} ingecheckt. Uw volgende check-in is over ${CHECKIN_EVERY-DC.daysSince(k.datum)} ${CHECKIN_EVERY-DC.daysSince(k.datum)===1?"dag":"dagen"}; u kunt ook nu al een update sturen.`
    :"Eén keer per week. Uw coach ziet uw antwoorden en kan uw plan zo beter bijsturen.";
}
function renderFotos(){
  $("fotoSection").hidden=!me.metingen.length;
  const last=DC.lastFotoDate(me.fotos), due=DC.fotosDue(me.fotos);
  $("fotoSub").textContent=!last?"Maak een eerste set van drie foto's als startpunt. Daarna elke 4 weken een nieuwe set, zodat u en uw coach uw vooruitgang zien, ook als de weegschaal stilstaat."
    :due?`Uw laatste set is van ${DC.dateNL(last,{day:"numeric",month:"long"})}. Tijd voor een nieuwe set.`
    :`Foto's van vandaag. Uw volgende set is over ${DC.FOTO_EVERY-DC.daysSince(last)} dagen (laatste set: ${DC.dateNL(last,{day:"numeric",month:"long"})}).`;
  $("fotoUpload").innerHTML=DC.fotoUploadHTML(me.fotos,DC.today(),fotoSrc,{del:true});
}
function renderAll(){
  $("hello").textContent=me.naam?me.naam.split(" ")[0]:"";
  renderPlan(); renderProgress(); renderCheckin(); renderFotos();
  const fp=$("fProfiel");
  fp.elements.naam.value=me.naam||"";
  DC.fillProfiel(fp,me.profiel);
  DC.fillIntake($("fIntake"),me.intake);
  $("profStep").hidden=!onboarding();
  $("accEmail").textContent=me.email;
  $("fPw").elements.email.value=me.email;
  if(me.coach) $("coachNaam").textContent=me.coach;
}
function saveMenu(){
  clearTimeout(menuTimer);
  menuTimer=setTimeout(()=>DC.api("/api/menu","PUT",me.menu).catch(()=>{}),500);
}
function printPlan(){
  const m=DC.latest(me.metingen);
  if(me.profiel&&m) DC.printPlan(me.profiel,m,me.menu,{naam:me.naam,coach:me.coach});
}

// ---------- events ----------
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-v],[data-dag],[data-swap],[data-new-menu],[data-print],[data-boodschappen],[data-del],[data-foto-del]"); if(!t) return;
  if(t.dataset.v){show(t.dataset.v);if(t.hasAttribute("data-goto-fotos"))$("fotoTitle").scrollIntoView({behavior:"smooth"})}
  else if(t.dataset.fotoDel){
    if(!confirm("Deze foto verwijderen?")) return;
    try{me.fotos=(await DC.api("/api/fotos/"+t.dataset.fotoDel,"DELETE")).fotos;renderFotos();renderProgress();renderPlan()}
    catch(err){alert(err.message)}
  }
  else if(t.dataset.dag){viewDag=t.dataset.dag;renderPlan()}
  else if(t.dataset.swap!=null){const i=+t.dataset.swap,k=t.dataset.off;const o=me.menu[k]=me.menu[k]||[];o[i]=(o[i]||0)+1;renderPlan();saveMenu()}
  else if(t.hasAttribute("data-new-menu")){me.menu.seed++;me.menu.off=[];me.menu.offT=[];renderPlan();saveMenu()}
  else if(t.hasAttribute("data-boodschappen")) show("boodschappen");
  else if(t.hasAttribute("data-print")) printPlan();
  else if(t.dataset.del){
    if(!confirm("Deze meting verwijderen?")) return;
    try{me.metingen=(await DC.api("/api/metingen/"+t.dataset.del,"DELETE")).metingen;renderAll()}
    catch(err){alert(err.message)}
  }
});
document.addEventListener("change",async e=>{
  const cmp=e.target.closest("[data-foto-cmp]");
  if(cmp){if(cmp.dataset.fotoCmp==="a")cmpA=cmp.value;else cmpB=cmp.value;renderProgress();return}
  const inp=e.target.closest("input[data-foto-pose]"); if(!inp||!inp.files[0]) return;
  const slot=inp.closest(".foto-slot"), msg=$("fotoMsg");
  slot.classList.add("busy"); msg.className="flash"; msg.textContent="Foto wordt geüpload…";
  try{
    const blob=await DC.prepareFoto(inp.files[0]);
    me.fotos=(await DC.uploadFoto(`/api/fotos?datum=${DC.today()}&pose=${inp.dataset.fotoPose}`,blob)).fotos;
    renderFotos(); renderPlan(); renderProgress();
    const left=DC.POSES.filter(([p])=>!DC.fotoSets(me.fotos).find(s=>s.datum===DC.today())?.[p]).length;
    msg.className="flash"; msg.textContent=left?`Opgeslagen. Nog ${left} ${left===1?"foto":"foto's"} te gaan.`:"Uw set is compleet. Uw coach kan de foto's nu bekijken.";
  }catch(err){slot.classList.remove("busy");msg.className="err";msg.textContent=err.message}
});
$("logout").addEventListener("click",async()=>{
  try{await DC.api("/api/logout","POST",{})}catch(e){}
  me=null; show("login");
});

DC.handleForm($("fLogin"),async f=>{
  await DC.api("/api/login","POST",{email:f.elements.email.value,password:f.elements.password.value});
  f.reset(); await boot();
});
DC.handleForm($("fInvite"),async f=>{
  const pw=f.elements.password.value;
  if(pw.length<8) throw new Error("Kies een wachtwoord van minimaal 8 tekens.");
  if(pw!==f.elements.password2.value) throw new Error("De wachtwoorden zijn niet gelijk.");
  if(!f.elements.privacy.checked) throw new Error("Ga akkoord met de privacyverklaring om verder te gaan.");
  await DC.api("/api/invite","POST",{token:inviteToken,password:pw,privacy:true});
  inviteToken=null; history.replaceState(null,"","/"); f.reset(); await boot();
});
DC.handleForm($("fPrivacy"),async f=>{
  if(!f.elements.privacy.checked) throw new Error("Ga akkoord met de privacyverklaring om verder te gaan.");
  me.privacyAkkoord=(await DC.api("/api/privacy","POST",{akkoord:true})).privacyAkkoord;
  renderAll(); show(nextStep());
});
DC.handleForm($("fIntake"),async f=>{
  const firstTime=!me.intake;
  me.intake=await DC.api("/api/intake","PUT",DC.readIntake(f));
  renderAll(); show(firstTime?nextStep():"profiel"); // edits come from the profile page, so return there
});
DC.handleForm($("fProfiel"),async f=>{
  const naam=f.elements.naam.value.trim();
  if(!naam) throw new Error("Vul uw naam in.");
  const wasOnboarding=onboarding();
  const res=await DC.api("/api/profiel","PUT",{naam,profiel:DC.readProfiel(f)});
  me.naam=res.naam; me.profiel=res.profiel; renderAll();
  if(wasOnboarding){show(nextStep());return}
  setTimeout(()=>show("plan"),700);
  return "Profiel opgeslagen.";
});
DC.handleForm($("fMeting"),async f=>{
  if(!me.profiel) throw new Error("Vul eerst uw profiel in.");
  me.metingen=(await DC.api("/api/metingen","POST",DC.readMeting(f))).metingen;
  renderAll(); f.reset(); f.elements.datum.value=DC.today();
  if(!checkinDue()){setTimeout(()=>show("plan"),800);return "Gewicht opgeslagen. Uw plan is bijgewerkt."}
  $("weekTitle").scrollIntoView({behavior:"smooth",block:"start"});
  return "Gewicht opgeslagen. Uw plan is bijgewerkt. Vul hieronder nog uw weekcheck-in in.";
});
DC.handleForm($("fCheckin"),async f=>{
  me.checkins=(await DC.api("/api/checkins","POST",DC.readCheckin(f))).checkins;
  f.reset(); renderAll();
  setTimeout(()=>show("plan"),900);
  return "Dank u. Uw coach heeft uw check-in ontvangen.";
});
DC.handleForm($("fPw"),async f=>{
  await DC.api("/api/wachtwoord","POST",{huidig:f.elements.huidig.value,nieuw:f.elements.nieuw.value});
  f.reset(); f.elements.email.value=me.email;
  return "Wachtwoord gewijzigd.";
});

// ---------- boot ----------
function loginError(msg){show("login");const el=$("fLogin").querySelector("[data-msg]");el.className="err";el.textContent=msg}
async function boot(){
  const inv=new URLSearchParams(location.search).get("invite");
  if(inv){
    try{
      const i=await DC.api("/api/invite?token="+encodeURIComponent(inv));
      inviteToken=inv;
      $("t-inv").textContent="Welkom, "+i.naam.split(" ")[0];
      $("invSub").textContent="Kies een wachtwoord voor "+i.email+". Daarna logt u voortaan in met dit e-mailadres en wachtwoord.";
      $("fInvite").elements.email.value=i.email;
      show("uitnodiging");
    }catch(err){history.replaceState(null,"","/");loginError(err.message)}
    return;
  }
  try{
    me=await DC.api("/api/me");
    me.menu=me.menu||{seed:0,off:[]}; me.menu.off=me.menu.off||[]; me.menu.offT=me.menu.offT||[];
    me.checkins=me.checkins||[]; me.fotos=me.fotos||[];
    renderAll();
    show(nextStep());
  }catch(err){
    if(err.status===401) show("login"); else loginError(err.message);
  }
}
boot();
})();
