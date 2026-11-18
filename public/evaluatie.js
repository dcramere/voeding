// DCRAMERE — progress evaluations (client app + coach dashboard): the numbers of a period, weight curve, before/after
// photos, the written review and (coach) practical notes, sharing and a printable PDF. The server computes everything.
(function(){
"use strict";
const DC=window.DC, esc=DC.esc;
const d=x=>DC.dateNL(x,{day:"numeric",month:"short",year:"numeric"});
const signed=x=>(x>0?"+":x<0?"−":"")+DC.fmt(Math.abs(x),1);
const POSES=[["voor",N_("Voorkant")],["achter",N_("Achterkant")],["zijkant",N_("Zijkant")]];
const DOEL={"op schema":["ok",N_("op schema")],sneller:["warn",N_("sneller dan gepland")],langzamer:["warn",N_("langzamer dan gepland")]};

// weight curve of the period (inline SVG, scales to the card)
function curve(reeks){
  if(!reeks||reeks.length<2) return "";
  const W=320,H=90,P=6, ys=reeks.map(r=>r[1]), lo=Math.min(...ys)-0.3, hi=Math.max(...ys)+0.3;
  const t0=Date.parse(reeks[0][0]), t1=Date.parse(reeks[reeks.length-1][0])||t0+1;
  const pt=r=>[P+(Date.parse(r[0])-t0)/(t1-t0||1)*(W-2*P), P+(hi-r[1])/(hi-lo)*(H-2*P)];
  const pts=reeks.map(pt);
  return `<svg class="ev-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${T("Gewichtsverloop")}">
    <polyline points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
    ${[pts[0],pts[pts.length-1]].map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="currentColor"/>`).join("")}</svg>`;
}
function tiles(x){
  const g=x.gewicht, c=x.checkins, t=x.training, b=x.dagboek, tile=(l,v,s)=>`<div><small>${l}</small><b>${v}</b>${s?`<span>${s}</span>`:""}</div>`;
  return `<div class="ev-tiles">
    ${g?tile(T("Gewicht"),`${signed(g.verschil)} kg`,`${DC.fmt(g.van,1)} → ${DC.fmt(g.tot,1)} kg · ${signed(g.perWeek)} kg/${T("week")}${g.doel?` · <span class="${DOEL[g.doel][0]}-t">${T(DOEL[g.doel][1])}</span>`:""}`):tile(T("Gewicht"),"–",T("te weinig metingen"))}
    ${tile(T("Check-ins"),`${c.aantal}/${c.verwacht}`,c.aantal?T("plan volgen gem. {x}/5",{x:DC.fmt(c.naleving,1)}):"")}
    ${t?tile(T("Trainingen"),`${t.afgerond}/${t.verwacht}`,`${Math.min(100,Math.round(t.afgerond/t.verwacht*100))}%`):""}
    ${tile(T("Dagboek"),`${b.dagen}/${b.van}`,b.kcal?T("gem. {k} kcal · {p} g eiwit",{k:DC.fmt(b.kcal),p:b.eiwit}):T("dagen bijgehouden"))}
    ${x.taille?tile(T("Taille"),`${signed(x.taille.verschil)} cm`,`${DC.fmt(x.taille.van,1)} → ${DC.fmt(x.taille.tot,1)} cm`):""}
  </div>`;
}
function fotosHTML(f,src){
  if(!f) return "";
  return `<div class="ev-fotos">${POSES.filter(([p])=>f.voor[p]||f.na[p]).map(([p,l])=>`<figure>
    <div>${f.voor[p]?`<img src="${src(f.voor[p])}" alt="${T(l)} ${d(f.voor.datum)}" loading="lazy">`:"<span></span>"}${f.na[p]?`<img src="${src(f.na[p])}" alt="${T(l)} ${d(f.na.datum)}" loading="lazy">`:"<span></span>"}</div>
    <figcaption>${T(l)} · ${d(f.voor.datum)} → ${d(f.na.datum)}</figcaption></figure>`).join("")}</div>`;
}
function krachtHTML(t){
  if(!t||!t.kracht.length) return "";
  return `<h4>${T("Krachtprogressie")}</h4><table class="ev-kracht"><thead><tr><th>${T("Oefening")}</th><th>${T("Eerst")}</th><th>${T("Laatst")}</th><th class="n">±</th></tr></thead><tbody>
    ${t.kracht.map(k=>`<tr><td>${esc(k.naam)}</td><td>${esc(k.van)}</td><td>${esc(k.tot)}</td><td class="n ${k.pct>0?"ok-t":""}">${k.pct>0?"+":""}${k.pct}%</td></tr>`).join("")}</tbody></table>`;
}
const titel=e=>`${e.soort==="eind"?T("Eindevaluatie"):T("Maandevaluatie")} · ${d(e.van)} – ${d(e.tot)}`;
function kaart(e,o,open){
  if(e.status!=="klaar") return `<div class="ev-card"><p class="sub" style="margin:0">${titel(e)} · ${T("wordt gemaakt…")}</p></div>`;
  const x=e.data;
  return `<details class="ev-card"${open?" open":""}><summary><b>${titel(e)}</b>${o.coach?`<span class="pill ${e.gedeeld?"ok":""}">${e.gedeeld?T("gedeeld met cliënt"):T("niet gedeeld")}</span>`:""}</summary>
    ${tiles(x)}
    ${x.gewicht&&x.gewicht.reeks.length>1?`<div class="ev-curve-wrap">${curve(x.gewicht.reeks)}</div>`:""}
    ${fotosHTML(x.fotos,o.fotoSrc)}
    ${e.tekst?`<h4>${o.coach?T("Evaluatie voor de cliënt"):T("Evaluatie van uw coach")}</h4><p class="ev-text">${esc(e.tekst)}</p>`:""}
    ${o.coach&&e.coachTekst?`<h4>${T("Voor u als coach")}</h4><p class="ev-text">${esc(e.coachTekst)}</p>`:""}
    ${krachtHTML(x.training)}
    ${x.bijsturingen.length?`<p class="sub">${T("Dagdoel automatisch bijgesteld")}: ${x.bijsturingen.map(b=>`${d(b.datum)} ${DC.fmt(b.van)} → ${DC.fmt(b.naar)} kcal`).join(" · ")}</p>`:""}
    <div class="actions">
      <button class="btn small" type="button" data-ev-pdf="${e.id}">${T("PDF")}</button>
      ${o.coach?`<button class="btn small ghost" type="button" data-ev-deel="${e.id}" data-aan="${e.gedeeld?0:1}">${e.gedeeld?T("Niet meer delen"):T("Delen met cliënt")}</button>
      <button class="btn small danger" type="button" data-ev-weg="${e.id}">${T("Verwijderen")}</button>`:""}
    </div></details>`;
}
function html(list,o){
  let h="";
  if(o.coach) h+=`<div class="actions" style="margin-top:0"><button class="btn" type="button" data-ev-maak="maand"${o.busy?" disabled":""}>${o.busy==="maand"?T("Bezig…"):T("Maandevaluatie maken")}</button>
    <button class="btn ghost" type="button" data-ev-maak="eind"${o.busy?" disabled":""}>${o.busy==="eind"?T("Bezig…"):T("Eindevaluatie maken")}</button></div>
    <p class="sub">${o.auto?T("Na elke complete set progressiefoto's wordt automatisch een maandevaluatie gemaakt en met de cliënt gedeeld."):T("Automatische maandevaluaties staan uit (Instellingen).")} ${T("Een eindevaluatie deelt u pas als u daarvoor kiest.")}</p>`;
  if(!list.length) return h+(o.coach?`<p class="empty">${T("Nog geen evaluaties.")}</p>`:"");
  return h+list.map((e,i)=>kaart(e,o,i===0)).join("");
}
function printHTML(e,info,o){
  const x=e.data, merk=info.merk||{};
  return `<header class="p-head"><img src="${merk.logo||"/img/logo.webp"}" alt="${esc(merk.naam||"DCRAMERE")}"><div><p class="p-kicker">${e.soort==="eind"?T("Eindevaluatie"):T("Maandevaluatie")}</p><h1>${esc(info.naam||"")}</h1>
    <p>${d(e.van)} – ${d(e.tot)}<br>Coach: ${esc(info.coach||"")} — ${esc(merk.naam||"DCRAMERE")}</p></div></header>
    ${tiles(x)}
    ${x.gewicht&&x.gewicht.reeks.length>1?`<div class="ev-curve-wrap">${curve(x.gewicht.reeks)}</div>`:""}
    ${e.tekst?`<h2>${T("Evaluatie")}</h2><p class="p-text">${esc(e.tekst)}</p>`:""}
    ${o.metCoach&&e.coachTekst?`<h2>${T("Voor de coach")}</h2><p class="p-text">${esc(e.coachTekst)}</p>`:""}
    ${krachtHTML(x.training)}
    ${x.fotos?`<h2>${T("Progressiefoto's")}</h2>${fotosHTML(x.fotos,o.fotoSrc)}`:""}`;
}
function printEv(e,info,o){
  const el=document.getElementById("print"); el.innerHTML=printHTML(e,info,o);
  const old=document.title; document.title=`${e.soort==="eind"?T("Eindevaluatie"):T("Maandevaluatie")} ${info.naam||""} ${e.tot}`.trim();
  const imgs=[...el.querySelectorAll("img")], go=()=>{document.body.classList.add("printing");window.print();document.body.classList.remove("printing");document.title=old};
  Promise.all(imgs.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))).then(go);
}
// ctx: {coach, get() → {evaluaties}, set(list), fotoSrc(id), info() → {naam, coach, merk}, base (coach API path), auto(), api}
function mount(root,ctx){
  const st={busy:null};
  const render=()=>{root.innerHTML=html(ctx.get().evaluaties||[],{coach:ctx.coach,fotoSrc:ctx.fotoSrc,busy:st.busy,auto:ctx.auto&&ctx.auto()})};
  const api=ctx.api||DC.api;
  root.addEventListener("click",async ev=>{
    const t=ev.target.closest("button"); if(!t) return;
    const find=id=>(ctx.get().evaluaties||[]).find(x=>x.id===+id);
    if(t.dataset.evPdf) printEv(find(t.dataset.evPdf),ctx.info(),{fotoSrc:ctx.fotoSrc,metCoach:ctx.coach});
    else if(t.dataset.evMaak){
      if(t.dataset.evMaak==="eind"&&!confirm(T("Een eindevaluatie van het hele traject maken? U kiest daarna zelf of u die deelt."))) return;
      st.busy=t.dataset.evMaak; render();
      try{ctx.set((await api(ctx.base(),"POST",{soort:t.dataset.evMaak})).evaluaties)}catch(x){alert(x.message)}
      st.busy=null; render();
    }else if(t.dataset.evDeel){
      try{ctx.set((await api(`${ctx.base()}/${t.dataset.evDeel}`,"PUT",{gedeeld:t.dataset.aan==="1"})).evaluaties);render()}catch(x){alert(x.message)}
    }else if(t.dataset.evWeg){
      if(!confirm(T("Deze evaluatie verwijderen?"))) return;
      try{ctx.set((await api(`${ctx.base()}/${t.dataset.evWeg}`,"DELETE")).evaluaties);render()}catch(x){alert(x.message)}
    }
  });
  render();
  return {render};
}
window.EV={mount,html,printHTML};
})();
