// DCRAMERE — landing page: live prices from Stripe and client sign-up → Stripe Checkout
(function(){
"use strict";
const DC=window.DC, $=id=>document.getElementById(id);
const money=p=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:p.valuta,minimumFractionDigits:p.bedrag%1?2:0}).format(p.bedrag);
let prices=null;

DC.api("/api/prijzen").then(p=>{
  prices=p;
  document.querySelectorAll("[data-price]").forEach(el=>{
    const x=p[el.dataset.price];
    el.querySelector("b").textContent=x?money(x):"Binnenkort";
    el.querySelector("span").textContent=x?(x.interval==="year"?"per jaar":"per maand"):"";
  });
  if(!p.beschikbaar) $("prijsNoot").textContent="Online aanmelden opent binnenkort. Wilt u nu al starten? Neem contact op via WhatsApp; de knoppen hierboven openen een bericht.";
}).catch(()=>{});

function openStart(){
  if(prices&&!prices.beschikbaar){location.href="https://wa.me/5978514920?text="+encodeURIComponent("Hallo Dino, ik wil graag starten met DCRAMERE Coaching.");return}
  if(prices&&prices.client) $("startPrijs").textContent=`${money(prices.client)} per maand, maandelijks opzegbaar. U rondt de betaling af bij onze betaalpartner Stripe; daarna kiest u meteen uw wachtwoord.`;
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
  if(!f.elements.akkoord.checked) throw new Error("Ga akkoord met de voorwaarden en de privacyverklaring.");
  const r=await DC.api("/api/checkout/client","POST",{naam:f.elements.naam.value,email:f.elements.email.value,akkoord:true});
  location.href=r.url;
  return "U wordt doorgestuurd naar Stripe…";
});
})();
