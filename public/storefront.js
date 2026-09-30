// DCRAMERE — coach storefront: package buttons and the request form
(function(){
"use strict";
const DC=window.DC, f=document.getElementById("fLead");
if(!f) return;
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-pakket]"); if(!b) return;
  f.elements.pakket.value=b.dataset.pakket;
});
DC.handleForm(f,async()=>{
  const naam=f.elements.naam.value.trim();
  if(!naam) throw new Error(T("Vul uw naam in."));
  await DC.api(`/api/winkel/${f.dataset.slug}/aanvraag`,"POST",{naam,email:f.elements.email.value,telefoon:f.elements.telefoon.value,
    pakket:f.elements.pakket.value,doel:f.elements.doel.value,website:f.elements.website.value});
  f.querySelectorAll("input,select,textarea,button").forEach(x=>x.disabled=true);
  return T("Dank u! Uw aanvraag is verstuurd. U hoort zo snel mogelijk van uw coach.");
});
// coaches with online payments: subscribe right here
const sheet=document.getElementById("startSheet"), fs=document.getElementById("fSfStart");
if(sheet&&fs){
  const open=()=>{sheet.hidden=false;document.body.classList.add("sheet-open");setTimeout(()=>fs.elements.naam.focus(),50)};
  const close=()=>{sheet.hidden=true;document.body.classList.remove("sheet-open")};
  document.addEventListener("click",e=>{if(e.target.closest("[data-sf-start]"))open();else if(e.target.closest("[data-close]")||e.target===sheet)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
  DC.handleForm(fs,async()=>{
    if(!fs.elements.akkoord.checked) throw new Error(T("Ga akkoord met de voorwaarden en de privacyverklaring."));
    const r=await DC.api(`/api/winkel/${fs.dataset.slug}/checkout`,"POST",{naam:fs.elements.naam.value,email:fs.elements.email.value,akkoord:true});
    location.href=r.url;
    return T("U wordt doorgestuurd naar Stripe…");
  });
}
})();