// DCRAMERE Voeding — shared calculations, meal generator and render helpers (client app + coach dashboard)
(function(){
"use strict";

// ---------- food database (per 100 g, koolhydraten excl. vezels) ----------
const FOODS = {
  kip:{n:"Kipfilet",k:110,p:23,c:0,f:1.5,v:0,tag:["vlees"]},
  witvis:{n:"Witte vis (bijv. kabeljauw)",k:82,p:18,c:0,f:0.7,v:0,tag:["vis"]},
  zalm:{n:"Zalm",k:208,p:20,c:0,f:13,v:0,tag:["vis"]},
  tonijn:{n:"Tonijn in water",k:116,p:26,c:0,f:1,v:0,tag:["vis"]},
  kvv:{n:"Kip, vlees of vis",k:109,p:23,c:0,f:1.8,v:0,tag:["vlees"]},
  gehakt:{n:"Mager rundergehakt",k:137,p:21,c:0,f:5,v:0,tag:["vlees","rood"]},
  tofu:{n:"Tofu",k:144,p:15,c:2,f:8.7,v:1},
  tempeh:{n:"Tempeh",k:193,p:19,c:9,f:11,v:5},
  ei:{n:"Ei, gekookt",k:143,p:12.6,c:0.7,f:9.5,v:0,unit:["stuk","stuks",60]},
  eiwit:{n:"Eiwit (van ei)",k:52,p:11,c:0.7,f:0.2,v:0,unit:["stuk","stuks",33]},
  kwark:{n:"Magere kwark",k:57,p:10,c:4,f:0.2,v:0,tag:["zuivel"]},
  yoghurt:{n:"Griekse yoghurt 0%",k:59,p:10,c:3.6,f:0.4,v:0,tag:["zuivel"]},
  havermout:{n:"Havermout",k:372,p:13.5,c:58,f:7,v:10},
  brood:{n:"Volkorenbrood",k:230,p:10,c:38,f:3,v:7,unit:["snee","sneetjes",35]},
  rijst:{n:"Zilvervliesrijst (droog gewogen)",k:350,p:8,c:73,f:2.5,v:3},
  pasta:{n:"Volkorenpasta (droog gewogen)",k:340,p:13,c:61,f:2.5,v:9},
  aardappel:{n:"Aardappelen",k:77,p:2,c:17,f:0.1,v:2.2},
  zoeteaardappel:{n:"Zoete aardappel",k:86,p:1.6,c:20,f:0.1,v:3},
  cassave:{n:"Cassave",k:160,p:1.4,c:38,f:0.3,v:1.8},
  bakbanaan:{n:"Bakbanaan",k:122,p:1.3,c:32,f:0.4,v:2.3},
  peul:{n:"Peulvruchten (droog gewogen)",k:314,p:20,c:44,f:2,v:18},
  groente:{n:"Groente, gekookt",k:31,p:2,c:3.6,f:0.4,v:2.4},
  banaan:{n:"Banaan (bacove)",k:89,p:1.1,c:22,f:0.3,v:2.6,unit:["stuk","stuks",120]},
  appel:{n:"Appel",k:52,p:0.3,c:12,f:0.2,v:2.4,unit:["stuk","stuks",150]},
  papaya:{n:"Papaya",k:43,p:0.5,c:11,f:0.3,v:1.7,unit:["schaaltje","schaaltjes",140]},
  watermeloen:{n:"Watermeloen",k:30,p:0.6,c:7,f:0.2,v:0.4,unit:["schaaltje","schaaltjes",150]},
  ananas:{n:"Ananas",k:50,p:0.5,c:12,f:0.1,v:1.4,unit:["schaaltje","schaaltjes",140]},
  bessen:{n:"Bessen, gemengd",k:50,p:0.7,c:10,f:0.3,v:3},
  olijfolie:{n:"Olijfolie",k:884,p:0,c:0,f:100,v:0,unit:["el","el",13]},
  kokosolie:{n:"Kokosolie, koudgeperst",k:892,p:0,c:0,f:99,v:0,unit:["el","el",13]},
  avocado:{n:"Avocado",k:160,p:2,c:2,f:14.7,v:6.7},
  amandelen:{n:"Amandelen",k:600,p:21,c:7,f:50,v:12},
  walnoten:{n:"Walnoten (of andere ongebrande, ongezouten noten)",k:680,p:15,c:3.5,f:66,v:6,unit:["handje","handjes",26]},
  pindakaas:{n:"Pindakaas (100% pinda)",k:620,p:25,c:12,f:50,v:6}
};
const TEMPL = {
  ontbijt:{fixed:[],prot:["kwark","ei","yoghurt"],carb:["havermout","brood"],fruit:["banaan","bessen","papaya","appel"],fat:["walnoten","amandelen","pindakaas"]},
  hoofd:{fixed:[["groente",250]],prot:["kip","witvis","kvv","zalm","tofu","ei","tonijn","tempeh","gehakt"],carb:["rijst","zoeteaardappel","peul","aardappel","cassave","pasta","bakbanaan"],fat:["kokosolie","olijfolie","walnoten","avocado"]},
  snack:{fixed:[],prot:["kwark","yoghurt","ei","tonijn"],carb:[],fruit:["papaya","watermeloen","ananas","banaan","appel","bessen"],fat:["walnoten","amandelen"]},
  // around the workout: protein + fast carbs, deliberately no added fat
  training:{fixed:[],prot:["kwark","yoghurt","ei"],carb:["havermout","brood"],fruit:["banaan","ananas","papaya"],fat:[]}
};
const TRAINING_SHARE=.15;
const DAGEN=[[1,"ma"],[2,"di"],[3,"wo"],[4,"do"],[5,"vr"],[6,"za"],[0,"zo"]];
const MOMENT_LABEL={ochtend:"'s ochtends",middag:"'s middags",avond:"'s avonds"};
const LAYOUT = {
  3:[["Ontbijt","ontbijt",.30],["Lunch","hoofd",.35],["Avondmaaltijd","hoofd",.35]],
  4:[["Ontbijt","ontbijt",.25],["Lunch","hoofd",.30],["Tussendoortje","snack",.15],["Avondmaaltijd","hoofd",.30]],
  5:[["Ontbijt","ontbijt",.22],["Tussendoortje","snack",.12],["Lunch","hoofd",.28],["Tussendoortje","snack",.12],["Avondmaaltijd","hoofd",.26]]
};
const DW = {m:[[0,1.1620,.0630],[20,1.1631,.0632],[30,1.1422,.0544],[40,1.1620,.0700],[50,1.1715,.0779]],
            v:[[0,1.1549,.0678],[20,1.1599,.0717],[30,1.1423,.0632],[40,1.1333,.0612],[50,1.1339,.0645]]};
const DOEL_LABEL = {"-0.2":"Vet verbranden","-0.1":"Rustig afvallen","0":"Behouden","0.1":"Spieropbouw"};

// ---------- formatting ----------
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(x,d=0)=>Number(x).toLocaleString("nl-NL",{minimumFractionDigits:d,maximumFractionDigits:d});
// noon local time, so a YYYY-MM-DD date never shifts a day in UTC-negative timezones (Suriname = UTC−3)
const dateNL=(d,o)=>new Date(d+"T12:00:00").toLocaleDateString("nl-NL",o||{day:"numeric",month:"long",year:"numeric"});
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const daysSince=d=>Math.floor((new Date(today()+"T12:00:00")-new Date(d+"T12:00:00"))/864e5);
const signed=(x,d=1)=>(x>0?"+":x<0?"−":"")+fmt(Math.abs(x),d);

// ---------- calculations ----------
const r1=x=>Math.round(x*10)/10;
function ageAt(P,dateStr){return (new Date(dateStr)-new Date(P.geboorte))/(365.25*864e5)}
function analyse(P,m){
  const h=+P.lengte, w=+m.gewicht, age=ageAt(P,m.datum), man=P.geslacht==="m";
  const bmi=w/((h/100)**2);
  const pl=[m.p1,m.p2,m.p3,m.p4].map(Number);
  let vet, methode;
  if(pl.every(x=>x>0)){
    const t=DW[man?"m":"v"]; let row=t[0]; for(const x of t) if(age>=x[0]) row=x;
    const D=row[1]-row[2]*Math.log10(pl.reduce((a,b)=>a+b,0));
    vet=(495/D-450)/100; methode="huidplooimeting";
  }else{
    vet=(1.29*bmi+0.20*age-11.4*(man?1:0)-8.3)/100; methode="schatting";
  }
  vet=Math.min(Math.max(vet,0.03),0.6);
  const lbm=w*(1-vet);
  const bmr = methode==="huidplooimeting" ? 370+21.6*lbm : 10*w+6.25*h-5*age+(man?5:-161);
  const tdee=bmr*(+P.activiteit||1.55);
  let adj=+P.doel||0; const notes=[];
  if(bmi<18.5 && adj<0){adj=0;notes.push("De BMI is lager dan 18,5. Het plan staat daarom op gewicht behouden in plaats van afvallen. Bespreek het doel met uw coach.");}
  let kcal=tdee*(1+adj);
  const floor=Math.max(bmr, man?1500:1200);
  if(kcal<floor){kcal=floor;notes.push("Het dagdoel is afgerond naar een veilige ondergrens.");}
  kcal=Math.round(kcal/10)*10;
  let prot=Math.min(lbm*(adj<0?2.2:2.0), w*2.4);
  let fat=Math.max(kcal*0.25/9, w*0.7);
  const fib=kcal/1000*14; let carb=Math.max((kcal-prot*4-fat*9-fib*2)/4,50);
  prot=Math.round(prot); fat=Math.round(fat); carb=Math.round(carb);
  const whtr=m.taille?m.taille/h:null, whr=(m.taille&&m.heup)?m.taille/m.heup:null;
  const weekly=(kcal-tdee)*7/7700;
  return {bmi,vet,lbm,fm:w*vet,methode,bmr,tdee,kcal,prot,fat,carb,fiber:Math.round(kcal/1000*14),water:r1(w*0.035),whtr,whr,weekly,notes,age};
}
// Training/rest-day split. The weekly average stays at A.kcal: training days get +a, rest days −b,
// with n·a = (7−n)·b. The rest-day cut is capped at 15% and never goes below the safe floor.
// Protein and fat stay constant; the difference is carried by carbohydrates.
function dagTargets(P,A){
  const n=(P.trainingsdagen||[]).length;
  if(!n||n>=7) return null;
  const b=Math.min(0.15,0.10*n/(7-n)), a=b*(7-n)/n;
  const floor=Math.max(A.bmr,P.geslacht==="m"?1500:1200);
  const mk=k=>{
    k=Math.round(k/10)*10; const fib=k/1000*14;
    return {kcal:k,prot:A.prot,fat:A.fat,fiber:Math.round(fib),carb:Math.round(Math.max((k-A.prot*4-A.fat*9-fib*2)/4,50))};
  };
  return {train:mk(A.kcal*(1+a)),rust:mk(Math.max(A.kcal*(1-b),floor))};
}
const isTrainingDay=(P,d)=>(P.trainingsdagen||[]).includes((d||new Date()).getDay());
function bmiLabel(b){return b<18.5?"ondergewicht":b<25?"gezond gewicht":b<27?"neiging tot overgewicht":b<30?"overgewicht":b<35?"obesitas":b<40?"zeer ernstig overgewicht":"morbide obesitas"}
function sorted(ms){return [...(ms||[])].sort((a,b)=>a.datum<b.datum?-1:a.datum>b.datum?1:0)}
function latest(ms){return sorted(ms).pop()||null}

// ---------- meal generator ----------
function allowed(P,key){
  const t=FOODS[key].tag||[];
  if((P.excl||[]).includes(key)) return false;
  if(P.vega && (t.includes("vlees")||t.includes("vis"))) return false;
  if(P.geenVis && t.includes("vis")) return false;
  if(P.geenRood && t.includes("rood")) return false;
  if(P.geenZuivel && t.includes("zuivel")) return false;
  return true;
}
function pick(P,list,idx){const ok=list.filter(k=>allowed(P,k));return ok.length?ok[((idx%ok.length)+ok.length)%ok.length]:null}
function macroOf(key,g){const f=FOODS[key],x=g/100;return {k:f.k*x,p:f.p*x,c:f.c*x,f:f.f*x,v:f.v*x}}
function roundAmt(key,g){
  const u=FOODS[key].unit;
  if(u){const per=u[2]; if(FOODS[key].f>40){const h=Math.round(g/per*2)/2; return (h===0&&g>=per*0.25?0.5:h)*per} return Math.max(0,Math.round(g/per))*per}
  return Math.max(0,Math.round(g/5)*5);
}
function buildMeal(P,type,share,T,idx){
  const tp=TEMPL[type], it=[];
  const tgt={p:T.prot*share,c:T.carb*share,f:T.fat*share};
  tp.fixed.forEach(([k,g])=>{if(allowed(P,k)) it.push({key:k,g})});
  const fruit=tp.fruit?pick(P,tp.fruit,idx*3+1):null;
  if(fruit) it.push({key:fruit,g:type==="snack"?Math.min(150,Math.max(100,tgt.c/FOODS[fruit].c*100)):120});
  const prot=pick(P,tp.prot,idx), carb=tp.carb.length?pick(P,tp.carb,idx*2+1):null, fat=pick(P,tp.fat,idx+2);
  const vars=[]; if(prot) vars.push({key:prot,m:"p",max:type==="hoofd"?300:500,min:FOODS[prot].unit?(type==="hoofd"?120:60):(type==="ontbijt"?150:100)});
  if(carb) vars.push({key:carb,m:"c",max:400}); if(fat) vars.push({key:fat,m:"f",max:60});
  const amt={}; vars.forEach(v=>amt[v.key]=0);
  for(let n=0;n<6;n++){
    vars.forEach(v=>{
      let other=0; it.forEach(i=>other+=macroOf(i.key,i.g)[v.m]);
      vars.forEach(o=>{if(o.key!==v.key) other+=macroOf(o.key,amt[o.key])[v.m]});
      const dens=FOODS[v.key][v.m]; amt[v.key]=dens>0?Math.min(v.max,Math.max(v.min||0,(tgt[v.m]-other)/dens*100)):0;
    });
  }
  vars.forEach(v=>{const g=roundAmt(v.key,amt[v.key]); if(g>0) it.push({key:v.key,g})});
  it.forEach(i=>{const u=FOODS[i.key].unit; if(!u) i.g=roundAmt(i.key,i.g); else if(!vars.some(v=>v.key===i.key)) i.g=Math.max(1,Math.round(i.g/u[2]))*u[2]});
  return it;
}
function layoutFor(P,dag){
  const base=LAYOUT[P.maaltijden]||LAYOUT[3];
  if(dag!=="train") return base;
  const L=base.map(([n,t,s])=>[n,t,s*(1-TRAINING_SHARE)]);
  const m=P.trainingsmoment||"middag";
  const pos=m==="ochtend"?1:m==="avond"?L.length-1:L.findIndex(x=>x[0]==="Lunch")+1;
  L.splice(pos,0,["Rond de training","training",TRAINING_SHARE,"30–60 minuten vóór of direct na de training"]);
  return L;
}
// training days keep their own swap offsets, because the extra meal shifts the meal indices
const offKey=dag=>dag==="train"?"offT":"off";
function buildMenu(P,menu,T,dag){
  const L=layoutFor(P,dag), off=(menu&&menu[offKey(dag)])||[], seed=(menu&&menu.seed)||0;
  return L.map(([name,type,share,hint],i)=>({name,hint,i,items:buildMeal(P,type,share,T,seed+(off[i]||0)+i*2)}));
}
function menuFor(P,menu,A,dag){
  const T={prot:A.prot,carb:A.carb,fat:A.fat}; let M=buildMenu(P,menu,T,dag);
  // correct for the difference between label calories and 4/4/9: adjust carbohydrates
  const k=M.reduce((s,ml)=>s+ml.items.reduce((t,i)=>t+macroOf(i.key,i.g).k,0),0);
  if(Math.abs(k-A.kcal)>A.kcal*0.02){T.carb=Math.max(40,T.carb-(k-A.kcal)/4);M=buildMenu(P,menu,T,dag)}
  A.carb=Math.round(T.carb);
  return M;
}
function qty(i){
  const u=FOODS[i.key].unit;
  if(u){const n=i.g/u[2]; const s=Number.isInteger(n)?String(n):String(n).replace(".",","); return s+" "+(n<=1?u[0]:u[1])}
  return i.g+" g";
}

// ---------- render: plan ----------
function planHTML(P,m,menu,o){
  o=o||{};
  const you=!o.coach, W=analyse(P,m), D=dagTargets(P,W);
  const todayType=isTrainingDay(P)?"train":"rust";
  const dag=D?(o.dag||todayType):null;
  const A=D?{...W,...D[dag]}:W;
  const meals=menuFor(P,menu,A,dag);
  const pk=A.prot*4,ck=A.carb*4,fk=A.fat*9,tot=pk+ck+fk;
  let dayBar="";
  if(D){
    const btn=(t,l)=>`<button type="button" data-dag="${t}" aria-pressed="${dag===t}">${l}<small>${fmt(D[t].kcal)} kcal${t===todayType?" · vandaag":""}</small></button>`;
    const days=DAGEN.filter(([d])=>P.trainingsdagen.includes(d)).map(([,l])=>l).join(", ");
    dayBar=`<div class="daytoggle" role="group" aria-label="Soort dag">${btn("train","Trainingsdag")}${btn("rust","Rustdag")}</div>
      <p class="sub" style="font-size:14px">Trainingsdagen: ${days}, ${MOMENT_LABEL[P.trainingsmoment||"middag"]}. Gemiddeld over de week: ${fmt(W.kcal)} kcal per dag.</p>`;
  }
  const macros=[["Eiwit",A.prot,pk,"--p"],["Koolhydraten",A.carb,ck,"--c"],["Vet",A.fat,fk,"--f"]].map(([l,g,k,c])=>
    `<div class="macro"><div class="v">${g} g</div><div class="l"><span class="dot" style="background:var(${c})"></span>${l} · ${Math.round(k/tot*100)}%</div></div>`).join("");
  const S={k:0,p:0,c:0,f:0,v:0};
  const mealsHtml=meals.map(ml=>{
    let mk=0;
    const rows=ml.items.map(i=>{const x=macroOf(i.key,i.g);mk+=x.k;for(const z in S)S[z]+=x[z];
      return `<tr><td class="q">${qty(i)}</td><td>${FOODS[i.key].n}</td><td class="m">${Math.round(x.k)} kcal</td></tr>`}).join("");
    const swap=o.interactive?` <button class="swap" type="button" data-swap="${ml.i}" data-off="${offKey(dag)}" aria-label="Andere invulling voor ${ml.name}">Wissel</button>`:"";
    return `<div class="meal"><div class="meal-h"><h3>${ml.name}${ml.hint?`<span class="hint">${ml.hint}</span>`:""}</h3><span class="k">${fmt(Math.round(mk))} kcal${swap}</span></div><table>${rows}</table></div>`;
  }).join("");
  const pct=(a,b)=>b?Math.round(a/b*100)+"%":"";
  return `
    <h1>${you?"Uw dagdoel":"Dagdoel"}</h1>
    <p class="sub">Gebaseerd op ${you?"uw":"de"} meting van ${dateNL(m.datum)} (${fmt(m.gewicht,1)} kg).</p>
    ${dayBar}
    <div class="target">
      <div class="kcal"><b>${fmt(A.kcal)}</b><span>kcal ${D?(dag==="train"?"op een trainingsdag":"op een rustdag"):"per dag"}</span></div>
      <div class="band" aria-hidden="true"><i style="width:${pk/tot*100}%;background:var(--p)"></i><i style="width:${ck/tot*100}%;background:var(--c)"></i><i style="width:${fk/tot*100}%;background:var(--f)"></i></div>
      <div class="macros">${macros}</div>
      <div class="facts"><span>Vezels <b>${A.fiber} g</b></span><span>Water <b>${fmt(A.water,1)} l</b></span><span>Verbruik${D?" (gem.)":""} <b>${fmt(Math.round(W.tdee/10)*10)} kcal</b></span><span>Verwacht <b>${W.weekly<0?"−":"+"}${fmt(Math.abs(W.weekly),2)} kg/week</b></span></div>
    </div>
    ${W.notes.map(n=>`<div class="note">${n}</div>`).join("")}
    <h2>${D?(dag==="train"?"Maaltijden op een trainingsdag":"Maaltijden op een rustdag"):you?"Uw maaltijden vandaag":"Maaltijden"}</h2>
    ${mealsHtml}
    <div class="totals">
      <div><small>Energie</small><b>${fmt(Math.round(S.k))}</b><small>${pct(S.k,A.kcal)} van doel</small></div>
      <div><small>Eiwit</small><b>${Math.round(S.p)} g</b><small>doel ${A.prot} g</small></div>
      <div><small>Koolhydraten</small><b>${Math.round(S.c)} g</b><small>doel ${A.carb} g</small></div>
      <div><small>Vet</small><b>${Math.round(S.f)} g</b><small>doel ${A.fat} g</small></div>
    </div>
    ${o.interactive?`<div class="actions"><button class="btn" type="button" data-new-menu>Nieuw menu maken</button><button class="btn ghost" type="button" data-print>Printen of opslaan als PDF</button></div>`:""}`;
}

// ---------- render: progress ----------
function chartHTML(rows){
  const W=700,H=240,pl=44,pr=14,pt=16,pb=28;
  const ts=rows.map(r=>new Date(r.m.datum+"T12:00:00").getTime()), ws=rows.map(r=>+r.m.gewicht);
  const t0=Math.min(...ts),t1=Math.max(...ts);
  const lo=Math.floor(Math.min(...ws)-1),hi=Math.ceil(Math.max(...ws)+1);
  const X=t=>pl+(t1===t0?0.5:(t-t0)/(t1-t0))*(W-pl-pr), Y=v=>pt+(hi-v)/(hi-lo)*(H-pt-pb);
  let g="";
  const step=Math.max(1,Math.ceil((hi-lo)/5));
  for(let v=lo;v<=hi;v+=step) g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl-8}" y="${Y(v)+4}" text-anchor="end">${v}</text>`;
  const pts=rows.map((r,i)=>`${X(ts[i])},${Y(ws[i])}`).join(" ");
  const dots=rows.map((r,i)=>`<circle cx="${X(ts[i])}" cy="${Y(ws[i])}" r="3.5" fill="var(--bg)" stroke="var(--gold)" stroke-width="2"><title>${fmt(ws[i],1)} kg</title></circle>`).join("");
  const lab=t=>new Date(t).toLocaleDateString("nl-NL",{month:"short",year:"2-digit"});
  g+=`<text x="${pl}" y="${H-6}">${lab(t0)}</text><text x="${W-pr}" y="${H-6}" text-anchor="end">${lab(t1)}</text>`;
  return `<h2>Gewicht (kg)</h2><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verloop van het gewicht">${g}<polyline fill="none" stroke="var(--gold)" stroke-width="2.5" points="${pts}"/>${dots}</svg>`;
}
function historyHTML(P,metingen,o){
  o=o||{};
  const rows=sorted(metingen).map(m=>({m,a:analyse(P,m)}));
  const dw=rows[rows.length-1].m.gewicht-rows[0].m.gewicht;
  let html=`<p class="sub">${rows.length} ${rows.length===1?"meting":"metingen"}. Verandering sinds de eerste meting: <b style="color:var(--ink)">${signed(dw)} kg</b>.</p>`;
  if(rows.length>1) html+=chartHTML(rows);
  html+=`<div class="table-scroll"><table class="hist"><thead><tr><th>Datum</th><th>Gewicht</th><th>BMI</th><th>Vet%</th><th>Vetvrij</th><th>WHtR</th>${o.coach?"<th>Door</th>":""}<th></th></tr></thead><tbody>`+
    rows.slice().reverse().map(({m,a})=>`<tr><td>${dateNL(m.datum,{day:"numeric",month:"short",year:"2-digit"})}</td><td>${fmt(m.gewicht,1)}</td><td title="${bmiLabel(a.bmi)}">${fmt(a.bmi,1)}</td><td title="${a.methode}">${fmt(a.vet*100,1)}${a.methode==="schatting"?"*":""}</td><td>${fmt(a.lbm,1)}</td><td>${a.whtr?fmt(a.whtr,2):"–"}</td>${o.coach?`<td>${m.door==="coach"?"Coach":"Cliënt"}</td>`:""}<td><button class="del" type="button" data-del="${m.id}">Verwijderen</button></td></tr>`).join("")+
    `</tbody></table></div><p class="sub" style="font-size:13px;margin-top:8px">* Geschat vetpercentage op basis van BMI en leeftijd. Een huidplooimeting met ${o.coach?"de":"uw"} coach is nauwkeuriger.</p>`;
  return html;
}

// ---------- shared form fragments ----------
function profielFieldsHTML(){
  return `
    <div class="row">
      <label>Geslacht<select name="geslacht" required><option value="">Kies…</option><option value="m">Man</option><option value="v">Vrouw</option></select></label>
      <label>Geboortedatum<input type="date" name="geboorte" required></label>
    </div>
    <div class="row">
      <label>Lengte <small>cm</small><input type="number" name="lengte" min="120" max="230" inputmode="numeric" required></label>
      <label>Maaltijden per dag<select name="maaltijden"><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
    </div>
    <label>Activiteitsniveau
      <select name="activiteit">
        <option value="1.35">Zittend werk, nauwelijks training</option>
        <option value="1.45">Licht actief, 1–2 trainingen per week</option>
        <option value="1.55" selected>Actief, 3–4 trainingen per week</option>
        <option value="1.7">Zeer actief, 5–6 trainingen per week</option>
        <option value="1.85">Zwaar fysiek werk én dagelijks training</option>
      </select>
    </label>
    <fieldset>
      <legend>Training</legend>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted)">Op trainingsdagen krijgt u meer koolhydraten en een extra maaltijd rond de training, op rustdagen iets minder. Uw weekgemiddelde blijft gelijk. Geen dagen gekozen: elke dag hetzelfde plan.</p>
      <div class="checks" data-trainingsdagen>${DAGEN.map(([d,l])=>`<label class="chip"><input type="checkbox" value="${d}">${l}</label>`).join("")}</div>
      <label style="margin-top:12px">Wanneer traint u meestal?
        <select name="trainingsmoment"><option value="ochtend">'s Ochtends (na het ontbijt)</option><option value="middag" selected>'s Middags (na de lunch)</option><option value="avond">'s Avonds (voor het avondeten)</option></select>
      </label>
    </fieldset>
    <label>Doel
      <select name="doel">
        <option value="-0.2">Vetmassa verbranden</option>
        <option value="-0.1">Rustig afvallen</option>
        <option value="0">Gewicht behouden</option>
        <option value="0.1">Spiermassa opbouwen</option>
      </select>
    </label>
    <fieldset>
      <legend>Voorkeuren</legend>
      <div class="checks">
        <label class="chip"><input type="checkbox" name="geenRood" checked>Geen rood vlees</label>
        <label class="chip"><input type="checkbox" name="geenVis">Geen vis</label>
        <label class="chip"><input type="checkbox" name="vega">Vegetarisch</label>
        <label class="chip"><input type="checkbox" name="geenZuivel">Geen zuivel</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>Deze producten liever niet</legend>
      <div class="checks" data-excl>${Object.keys(FOODS).filter(k=>k!=="groente").map(k=>`<label class="chip"><input type="checkbox" value="${k}">${FOODS[k].n.replace(/ \(.*\)/,"")}</label>`).join("")}</div>
    </fieldset>`;
}
function fillProfiel(f,P){
  if(!P) return;
  ["geslacht","geboorte","lengte","maaltijden","activiteit","doel"].forEach(k=>{if(P[k]!=null) f.elements[k].value=String(P[k])});
  ["geenRood","geenVis","vega","geenZuivel"].forEach(k=>{f.elements[k].checked=!!P[k]});
  f.querySelectorAll("[data-excl] input").forEach(i=>{i.checked=(P.excl||[]).includes(i.value)});
  f.querySelectorAll("[data-trainingsdagen] input").forEach(i=>{i.checked=(P.trainingsdagen||[]).includes(+i.value)});
  f.elements.trainingsmoment.value=P.trainingsmoment||"middag";
}
function readProfiel(f){
  const e=f.elements, l=+e.lengte.value;
  if(!e.geslacht.value||!e.geboorte.value||!(l>=120&&l<=230)) throw new Error("Vul geslacht, geboortedatum en lengte (120–230 cm) in.");
  return {geslacht:e.geslacht.value,geboorte:e.geboorte.value,lengte:l,maaltijden:+e.maaltijden.value,activiteit:+e.activiteit.value,doel:+e.doel.value,
    geenRood:e.geenRood.checked,geenVis:e.geenVis.checked,vega:e.vega.checked,geenZuivel:e.geenZuivel.checked,
    excl:[...f.querySelectorAll("[data-excl] input:checked")].map(i=>i.value),
    trainingsdagen:[...f.querySelectorAll("[data-trainingsdagen] input:checked")].map(i=>+i.value),
    trainingsmoment:e.trainingsmoment.value};
}
function metingFieldsHTML(o){
  o=o||{};
  return `
    <div class="row">
      <label>Datum<input type="date" name="datum" required value="${today()}"></label>
      <label class="big-input">Gewicht (kg)<input type="number" name="gewicht" step="0.1" min="30" max="300" inputmode="decimal" required placeholder="0,0"></label>
    </div>
    <details${o.open?" open":""}>
      <summary>Uitgebreide meting${o.open?"":" (met uw coach)"}</summary>
      <div style="display:grid;gap:14px;margin-top:10px">
        <div class="row">
          <label>Taille, smalste omtrek <small>cm</small><input type="number" name="taille" step="0.5" inputmode="decimal"></label>
          <label>Heupomvang <small>cm</small><input type="number" name="heup" step="0.5" inputmode="decimal"></label>
        </div>
        <fieldset>
          <legend>Huidplooien (mm) — alle vier invullen</legend>
          <div class="row">
            <label>Biceps<input type="number" name="p1" step="0.1" inputmode="decimal"></label>
            <label>Triceps<input type="number" name="p2" step="0.1" inputmode="decimal"></label>
            <label>Onder schouderblad<input type="number" name="p3" step="0.1" inputmode="decimal"></label>
            <label>Boven heupbeen<input type="number" name="p4" step="0.1" inputmode="decimal"></label>
          </div>
        </fieldset>
      </div>
    </details>`;
}
function readMeting(f){
  const n=k=>{const v=parseFloat(String(f.elements[k].value).replace(",","."));return v>0?v:null};
  const d=f.elements.datum.value, w=n("gewicht");
  if(!d||!(w>=30&&w<=300)) throw new Error("Vul een datum en een gewicht tussen 30 en 300 kg in.");
  const m={datum:d,gewicht:w,taille:n("taille"),heup:n("heup"),p1:n("p1"),p2:n("p2"),p3:n("p3"),p4:n("p4")};
  const pl=[m.p1,m.p2,m.p3,m.p4].filter(x=>x!=null).length;
  if(pl&&pl<4) throw new Error("Vul alle vier huidplooien in, of geen.");
  return m;
}

// ---------- api ----------
async function api(path,method,body){
  const r=await fetch(path,{method:method||"GET",credentials:"same-origin",
    headers:body!==undefined?{"content-type":"application/json"}:{},body:body!==undefined?JSON.stringify(body):undefined});
  let data=null; try{data=await r.json()}catch(e){}
  if(!r.ok){const e=new Error((data&&data.error)||"Er ging iets mis ("+r.status+"). Controleer uw internetverbinding.");e.status=r.status;throw e}
  return data;
}
// runs an async form handler with the submit button disabled and errors shown in the form's [data-msg]
function handleForm(form,fn){
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const btn=form.querySelector("[type=submit]"), msg=form.querySelector("[data-msg]");
    if(msg){msg.className="flash";msg.textContent=""}
    if(btn) btn.disabled=true;
    try{const ok=await fn(form); if(ok&&msg){msg.className="flash";msg.textContent=ok}}
    catch(err){if(msg){msg.className="err";msg.textContent=err.message}}
    finally{if(btn) btn.disabled=false}
  });
}

window.DC={FOODS,DOEL_LABEL,esc,fmt,dateNL,today,daysSince,signed,analyse,dagTargets,bmiLabel,sorted,latest,menuFor,planHTML,historyHTML,
  profielFieldsHTML,fillProfiel,readProfiel,metingFieldsHTML,readMeting,api,handleForm};
})();
