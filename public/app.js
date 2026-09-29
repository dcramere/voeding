// DCRAMERE Voeding — client app
(function(){
"use strict";
const DC=window.DC, $=id=>document.getElementById(id);
const APP_VIEWS=["plan","meting","voortgang","profiel"];
let me=null, menuTimer=null, inviteToken=null, viewDag=null; // viewDag null = today's day type

$("fMeting").querySelector("[data-fields]").innerHTML=DC.metingFieldsHTML();
$("fProfiel").querySelector("[data-fields]").innerHTML=DC.profielFieldsHTML();

function show(v){
  document.querySelectorAll("section.view").forEach(s=>s.classList.toggle("on",s.id==="v-"+v));
  $("tabs").hidden=!APP_VIEWS.includes(v);
  document.querySelectorAll("#tabs button").forEach(b=>{if(b.dataset.v===v)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  window.scrollTo(0,0);
}

// ---------- rendering ----------
function renderPlan(){
  const el=$("plan"), P=me.profiel, m=DC.latest(me.metingen);
  if(!P) el.innerHTML='<h1>Welkom</h1><p class="sub">Vul eerst uw profiel in. Daarna voert u uw gewicht in en berekent de app uw calorieën, macro\'s en menu.</p><button class="btn" type="button" data-v="profiel">Profiel invullen</button>';
  else if(!m) el.innerHTML='<h1>Nog geen meting</h1><p class="sub">Voer uw gewicht in om uw persoonlijke dagdoel en menu te maken.</p><button class="btn" type="button" data-v="meting">Gewicht invoeren</button>';
  else el.innerHTML=DC.planHTML(P,m,me.menu,{interactive:true,dag:viewDag});
}
function renderProgress(){
  $("prog").innerHTML=me.profiel&&me.metingen.length?DC.historyHTML(me.profiel,me.metingen)
    :'<p class="empty">Uw voortgang verschijnt hier zodra u een meting heeft opgeslagen.</p>';
}
function renderAll(){
  $("hello").textContent=me.naam?"Hallo, "+me.naam.split(" ")[0]:"Voeding op maat";
  renderPlan(); renderProgress();
  $("fProfiel").elements.naam.value=me.naam||"";
  DC.fillProfiel($("fProfiel"),me.profiel);
  $("accEmail").textContent=me.email;
  $("fPw").elements.email.value=me.email;
  if(me.coach) $("coachNaam").textContent=me.coach;
}
function saveMenu(){
  clearTimeout(menuTimer);
  menuTimer=setTimeout(()=>DC.api("/api/menu","PUT",me.menu).catch(()=>{}),500);
}

// ---------- events ----------
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-v],[data-dag],[data-swap],[data-new-menu],[data-print],[data-del]"); if(!t) return;
  if(t.dataset.v) show(t.dataset.v);
  else if(t.dataset.dag){viewDag=t.dataset.dag;renderPlan()}
  else if(t.dataset.swap!=null){const i=+t.dataset.swap,k=t.dataset.off;const o=me.menu[k]=me.menu[k]||[];o[i]=(o[i]||0)+1;renderPlan();saveMenu()}
  else if(t.hasAttribute("data-new-menu")){me.menu.seed++;me.menu.off=[];me.menu.offT=[];renderPlan();saveMenu()}
  else if(t.hasAttribute("data-print")) window.print();
  else if(t.dataset.del){
    if(!confirm("Deze meting verwijderen?")) return;
    try{me.metingen=(await DC.api("/api/metingen/"+t.dataset.del,"DELETE")).metingen;renderAll()}
    catch(err){alert(err.message)}
  }
});
$("logout").addEventListener("click",async()=>{
  try{await DC.api("/api/logout","POST",{})}catch(e){}
  me=null; $("hello").textContent="Voeding op maat"; show("login");
});

DC.handleForm($("fLogin"),async f=>{
  await DC.api("/api/login","POST",{email:f.elements.email.value,password:f.elements.password.value});
  f.reset(); await boot();
});
DC.handleForm($("fInvite"),async f=>{
  const pw=f.elements.password.value;
  if(pw.length<8) throw new Error("Kies een wachtwoord van minimaal 8 tekens.");
  if(pw!==f.elements.password2.value) throw new Error("De wachtwoorden zijn niet gelijk.");
  await DC.api("/api/invite","POST",{token:inviteToken,password:pw});
  inviteToken=null; history.replaceState(null,"","/"); f.reset(); await boot();
});
DC.handleForm($("fProfiel"),async f=>{
  const naam=f.elements.naam.value.trim();
  if(!naam) throw new Error("Vul uw naam in.");
  const res=await DC.api("/api/profiel","PUT",{naam,profiel:DC.readProfiel(f)});
  me.naam=res.naam; me.profiel=res.profiel; renderAll();
  setTimeout(()=>show(me.metingen.length?"plan":"meting"),700);
  return "Profiel opgeslagen.";
});
DC.handleForm($("fMeting"),async f=>{
  if(!me.profiel) throw new Error("Vul eerst uw profiel in.");
  me.metingen=(await DC.api("/api/metingen","POST",DC.readMeting(f))).metingen;
  renderAll(); f.reset(); f.elements.datum.value=DC.today();
  setTimeout(()=>show("plan"),800);
  return "Meting opgeslagen. Uw plan is bijgewerkt.";
});
DC.handleForm($("fPw"),async f=>{
  await DC.api("/api/wachtwoord","POST",{huidig:f.elements.huidig.value,nieuw:f.elements.nieuw.value});
  f.reset(); f.elements.email.value=me.email;
  return "Wachtwoord gewijzigd.";
});

// ---------- boot ----------
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
    }catch(err){
      history.replaceState(null,"","/");
      show("login");
      const msg=$("fLogin").querySelector("[data-msg]"); msg.className="err"; msg.textContent=err.message;
    }
    return;
  }
  try{
    me=await DC.api("/api/me");
    me.menu=me.menu||{seed:0,off:[]}; me.menu.off=me.menu.off||[]; me.menu.offT=me.menu.offT||[];
    renderAll();
    show(!me.profiel?"profiel":me.metingen.length?"plan":"meting");
  }catch(err){
    show("login");
    if(err.status!==401){const msg=$("fLogin").querySelector("[data-msg]");msg.className="err";msg.textContent=err.message}
  }
}
boot();
})();
