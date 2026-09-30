// DCRAMERE — landing page: live prices from Stripe and client sign-up → Stripe Checkout
(function(){
"use strict";
const DC=window.DC, $=id=>document.getElementById(id);
const money=p=>new Intl.NumberFormat(I18N.locale,{style:"currency",currency:p.valuta,minimumFractionDigits:p.bedrag%1?2:0}).format(p.bedrag);
let prices=null;

DC.api("/api/prijzen").then(p=>{
  prices=p;
  document.querySelectorAll("[data-price]").forEach(el=>{
    const x=p[el.dataset.price];
    el.querySelector("b").textContent=x?money(x):T("Binnenkort");
    el.querySelector("span").textContent=x?(x.interval==="year"?T("per jaar"):T("per maand")):"";
  });
  if(p.beschikbaar&&new URLSearchParams(location.search).get("start")==="client") openStart();
  if(!p.beschikbaar) $("prijsNoot").textContent=T("Online aanmelden opent binnenkort. Wilt u nu al starten? Neem contact op via WhatsApp; de knoppen hierboven openen een bericht.");
}).catch(()=>{});

DC.api("/api/winkels").then(list=>{
  if(!list.length) return;
  const esc=DC.esc;
  $("coachDir").innerHTML=list.map(k=>`<a class="coach-card" href="/c/${esc(k.slug)}">${DC.avatarHTML(k.avatar,k.naam,72)}
    <span><b>${esc(k.merk||k.naam)}</b><small>${esc(k.titel||"")}</small>
    ${k.specialisaties&&k.specialisaties.length?`<span class="tags">${k.specialisaties.slice(0,3).map(t=>`<i>${esc(t)}</i>`).join("")}</span>`:""}</span></a>`).join("");
  $("vind-coach").hidden=false;
}).catch(()=>{});

function openStart(){
  if(prices&&!prices.beschikbaar){location.href="https://wa.me/5978514920?text="+encodeURIComponent(T("Hallo Dino, ik wil graag starten met DCRAMERE Coaching."));return}
  if(prices&&prices.client) $("startPrijs").textContent=T("{x} per maand, maandelijks opzegbaar. U rondt de betaling af bij onze betaalpartner Stripe; daarna kiest u meteen uw wachtwoord.",{x:money(prices.client)});
  $("startSheet").hidden=false; document.body.classList.add("sheet-open");
  setTimeout(()=>$("fStart").elements.naam.focus(),50);
}
function closeStart(){$("startSheet").hidden=true;document.body.classList.remove("sheet-open")}
document.addEventListener("click",e=>{
  const s=e.target.closest("[data-start]");
  if(s){e.preventDefault();openStart();return}
  if(e.target.closest("[data-close]")||e.target===$("startSheet")) closeStart();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeStart()});
DC.handleForm($("fStart"),async f=>{
  if(!f.elements.akkoord.checked) throw new Error(T("Ga akkoord met de voorwaarden en de privacyverklaring."));
  const r=await DC.api("/api/checkout/client","POST",{naam:f.elements.naam.value,email:f.elements.email.value,akkoord:true});
  location.href=r.url;
  return T("U wordt doorgestuurd naar Stripe…");
});
})();
