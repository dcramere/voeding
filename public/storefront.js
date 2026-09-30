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
  if(!naam) throw new Error("Vul uw naam in.");
  await DC.api(`/api/winkel/${f.dataset.slug}/aanvraag`,"POST",{naam,email:f.elements.email.value,telefoon:f.elements.telefoon.value,
    pakket:f.elements.pakket.value,doel:f.elements.doel.value,website:f.elements.website.value});
  f.querySelectorAll("input,select,textarea,button").forEach(x=>x.disabled=true);
  return "Dank u! Uw aanvraag is verstuurd. U hoort zo snel mogelijk van uw coach.";
});
})();
