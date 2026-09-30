// DCRAMERE Voeding — shared calculations, meal generator and render helpers (client app + coach dashboard)
(function(){
"use strict";

// ---------- food database (per 100 g, koolhydraten excl. vezels) ----------
// n = full name, s = short name for dish titles, cat = shopping-list group, b = preparation step
const FOODS = {
  kip:{n:"Kipfilet",s:"kipfilet",k:110,p:23,c:0,f:1.5,v:0,tag:["vlees"],cat:"eiwit",b:"Kruid de kipfilet met bijvoorbeeld knoflook, paprikapoeder en peper, en bak of grill hem 5–7 minuten per kant tot hij gaar is."},
  witvis:{n:"Witte vis (bijv. kabeljauw)",s:"witte vis",k:82,p:18,c:0,f:0.7,v:0,tag:["vis"],cat:"eiwit",b:"Bak, grill of stoom de vis 4–6 minuten. Breng op smaak met citroen en kruiden."},
  zalm:{n:"Zalm",s:"zalm",k:208,p:20,c:0,f:13,v:0,tag:["vis"],cat:"eiwit",b:"Bak de zalm 3–4 minuten per kant, of gaar hem 12 minuten in de oven op 200 °C."},
  tonijn:{n:"Tonijn in water",s:"tonijn",k:116,p:26,c:0,f:1,v:0,tag:["vis"],cat:"eiwit",b:"Laat de tonijn goed uitlekken."},
  kvv:{n:"Kip, vlees of vis",s:"kip, vlees of vis",k:109,p:23,c:0,f:1.8,v:0,tag:["vlees"],cat:"eiwit",b:"Kies een magere soort en bereid die met weinig vet: grillen, stoven of bakken met de olie uit dit gerecht."},
  gehakt:{n:"Mager rundergehakt",s:"rundergehakt",k:137,p:21,c:0,f:5,v:0,tag:["vlees","rood"],cat:"eiwit",b:"Rul het gehakt in een droge pan en kruid naar smaak."},
  tofu:{n:"Tofu",s:"tofu",k:144,p:15,c:2,f:8.7,v:1,cat:"eiwit",b:"Dep de tofu droog, snijd hem in blokjes en bak hem goudbruin."},
  tempeh:{n:"Tempeh",s:"tempeh",k:193,p:19,c:9,f:11,v:5,cat:"eiwit",b:"Snijd de tempeh in plakken en bak of stoom hem 8–10 minuten."},
  ei:{n:"Ei, gekookt",s:"ei",shop:"Eieren",k:143,p:12.6,c:0.7,f:9.5,v:0,unit:["stuk","stuks",60],cat:"eiwit",b:"Kook de eieren 8–10 minuten."},
  eiwit:{n:"Eiwit (van ei)",s:"eiwit",k:52,p:11,c:0.7,f:0.2,v:0,unit:["stuk","stuks",33],cat:"eiwit",b:"Bak of roer het eiwit in een pan met antiaanbaklaag."},
  kwark:{n:"Magere kwark",s:"kwark",k:57,p:10,c:4,f:0.2,v:0,tag:["zuivel"],cat:"zuivel"},
  yoghurt:{n:"Griekse yoghurt 0%",s:"Griekse yoghurt",k:59,p:10,c:3.6,f:0.4,v:0,tag:["zuivel"],cat:"zuivel"},
  havermout:{n:"Havermout",s:"havermout",k:372,p:13.5,c:58,f:7,v:10,cat:"koolh",b:"Kook de havermout 3–5 minuten in water, of laat hem een nacht weken."},
  brood:{n:"Volkorenbrood",s:"volkorenbrood",k:230,p:10,c:38,f:3,v:7,unit:["snee","sneetjes",35],cat:"koolh"},
  rijst:{n:"Zilvervliesrijst (droog gewogen)",s:"zilvervliesrijst",k:350,p:8,c:73,f:2.5,v:3,cat:"koolh",b:"Kook de rijst 25–30 minuten gaar. Tip: kook een voorraad voor 2–3 dagen."},
  pasta:{n:"Volkorenpasta (droog gewogen)",s:"volkorenpasta",k:340,p:13,c:61,f:2.5,v:9,cat:"koolh",b:"Kook de pasta 10–12 minuten beetgaar."},
  aardappel:{n:"Aardappelen",s:"aardappelen",k:77,p:2,c:17,f:0.1,v:2.2,cat:"koolh",b:"Kook de aardappelen 15–20 minuten, of rooster ze in partjes 30 minuten in de oven."},
  zoeteaardappel:{n:"Zoete aardappel",s:"zoete aardappel",k:86,p:1.6,c:20,f:0.1,v:3,cat:"koolh",b:"Rooster de zoete aardappel in blokjes 25 minuten op 200 °C, of kook hem 15 minuten."},
  cassave:{n:"Cassave",s:"cassave",k:160,p:1.4,c:38,f:0.3,v:1.8,cat:"koolh",b:"Schil de cassave, kook hem 20–30 minuten tot hij zacht is en verwijder de harde kern."},
  bakbanaan:{n:"Bakbanaan",s:"bakbanaan",k:122,p:1.3,c:32,f:0.4,v:2.3,cat:"koolh",b:"Snijd de bakbanaan in plakken en bak of kook hem gaar."},
  peul:{n:"Peulvruchten (droog gewogen)",s:"peulvruchten",k:314,p:20,c:44,f:2,v:18,cat:"koolh",b:"Week de peulvruchten een nacht en kook ze gaar. Uit pot of blik mag ook: neem dan ongeveer 2,5 keer het droge gewicht."},
  groente:{n:"Groente, gekookt",s:"groente",shop:"Groente (vers of diepvries)",k:31,p:2,c:3.6,f:0.4,v:2.4,cat:"groente",b:"Stoom of kook de groente 5–8 minuten. Breng op smaak met kruiden in plaats van zout of saus."},
  banaan:{n:"Banaan (bacove)",s:"banaan",k:89,p:1.1,c:22,f:0.3,v:2.6,unit:["stuk","stuks",120],cat:"fruit"},
  appel:{n:"Appel",s:"appel",k:52,p:0.3,c:12,f:0.2,v:2.4,unit:["stuk","stuks",150],cat:"fruit"},
  papaya:{n:"Papaya",s:"papaya",k:43,p:0.5,c:11,f:0.3,v:1.7,unit:["schaaltje","schaaltjes",140],cat:"fruit"},
  watermeloen:{n:"Watermeloen",s:"watermeloen",k:30,p:0.6,c:7,f:0.2,v:0.4,unit:["schaaltje","schaaltjes",150],cat:"fruit"},
  ananas:{n:"Ananas",s:"ananas",k:50,p:0.5,c:12,f:0.1,v:1.4,unit:["schaaltje","schaaltjes",140],cat:"fruit"},
  bessen:{n:"Bessen, gemengd",s:"bessen",k:50,p:0.7,c:10,f:0.3,v:3,cat:"fruit"},
  olijfolie:{n:"Olijfolie",s:"olijfolie",k:884,p:0,c:0,f:100,v:0,unit:["el","el",13],cat:"vet",oil:true},
  kokosolie:{n:"Kokosolie, koudgeperst",s:"kokosolie",k:892,p:0,c:0,f:99,v:0,unit:["el","el",13],cat:"vet",oil:true},
  avocado:{n:"Avocado",s:"avocado",k:160,p:2,c:2,f:14.7,v:6.7,cat:"vet"},
  amandelen:{n:"Amandelen",s:"amandelen",k:600,p:21,c:7,f:50,v:12,cat:"vet"},
  walnoten:{n:"Walnoten (of andere ongebrande, ongezouten noten)",s:"walnoten",k:680,p:15,c:3.5,f:66,v:6,unit:["handje","handjes",26],cat:"vet"},
  pindakaas:{n:"Pindakaas (100% pinda)",s:"pindakaas",k:620,p:25,c:12,f:50,v:6,cat:"vet"}
};
for(const f of Object.values(FOODS)){f.n=T(f.n);f.s=T(f.s);if(f.b)f.b=T(f.b);if(f.shop)f.shop=T(f.shop);if(f.unit)f.unit=[T(f.unit[0]),T(f.unit[1]),f.unit[2]]}
const CATS=[["eiwit",T("Vlees, vis, ei en vegetarisch")],["zuivel",T("Zuivel")],["koolh",T("Brood, granen en knollen")],["groente",T("Groente")],["fruit",T("Fruit")],["vet",T("Noten, oliën en vetten")]];
const TEMPL = {
  ontbijt:{fixed:[],prot:["kwark","ei","yoghurt"],carb:["havermout","brood"],fruit:["banaan","bessen","papaya","appel"],fat:["walnoten","amandelen","pindakaas"]},
  hoofd:{fixed:[["groente",250]],prot:["kip","witvis","kvv","zalm","tofu","ei","tonijn","tempeh","gehakt"],carb:["rijst","zoeteaardappel","peul","aardappel","cassave","pasta","bakbanaan"],fat:["kokosolie","olijfolie","walnoten","avocado"]},
  snack:{fixed:[],prot:["kwark","yoghurt","ei","tonijn"],carb:[],fruit:["papaya","watermeloen","ananas","banaan","appel","bessen"],fat:["walnoten","amandelen"]},
  // around the workout: protein + fast carbs, deliberately no added fat
  training:{fixed:[],prot:["kwark","yoghurt","ei"],carb:["havermout","brood"],fruit:["banaan","ananas","papaya"],fat:[]}
};
// smallest sensible portions: protein per meal type (grams, or grams of a unit food), carbohydrate per food
const PROT_MIN={ontbijt:100,hoofd:100,snack:75,training:75}, PROT_MIN_UNIT={hoofd:120};
const CARB_MIN={havermout:30,brood:35,rijst:30,pasta:30,aardappel:100,zoeteaardappel:100,cassave:80,bakbanaan:80,peul:30};
const TRAINING_SHARE=.15;
const DAGEN=[[1,T("ma")],[2,T("di")],[3,T("wo")],[4,T("do")],[5,T("vr")],[6,T("za")],[0,T("zo")]];
const MOMENT_LABEL={ochtend:T("'s ochtends"),middag:T("'s middags"),avond:T("'s avonds")};
const LAYOUT = {
  3:[[N_("Ontbijt"),"ontbijt",.30],[N_("Lunch"),"hoofd",.35],[N_("Avondmaaltijd"),"hoofd",.35]],
  4:[[N_("Ontbijt"),"ontbijt",.25],[N_("Lunch"),"hoofd",.30],[N_("Tussendoortje"),"snack",.15],[N_("Avondmaaltijd"),"hoofd",.30]],
  5:[[N_("Ontbijt"),"ontbijt",.22],[N_("Tussendoortje"),"snack",.12],[N_("Lunch"),"hoofd",.28],[N_("Tussendoortje"),"snack",.12],[N_("Avondmaaltijd"),"hoofd",.26]]
};
const DW = {m:[[0,1.1620,.0630],[20,1.1631,.0632],[30,1.1422,.0544],[40,1.1620,.0700],[50,1.1715,.0779]],
            v:[[0,1.1549,.0678],[20,1.1599,.0717],[30,1.1423,.0632],[40,1.1333,.0612],[50,1.1339,.0645]]};
const DOEL_LABEL = {"-0.2":T("Vet verbranden"),"-0.1":T("Rustig afvallen"),"0":T("Behouden"),"0.1":T("Spieropbouw")};

// ---------- formatting ----------
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(x,d=0)=>Number(x).toLocaleString(I18N.locale,{minimumFractionDigits:d,maximumFractionDigits:d});
// noon local time, so a YYYY-MM-DD date never shifts a day in UTC-negative timezones (Suriname = UTC−3)
const dateNL=(d,o)=>new Date(d+"T12:00:00").toLocaleDateString(I18N.locale,o||{day:"numeric",month:"long",year:"numeric"});
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const daysSince=d=>Math.floor((new Date(today()+"T12:00:00")-new Date(d+"T12:00:00"))/864e5);
const signed=(x,d=1)=>(x>0?"+":x<0?"−":"")+fmt(Math.abs(x),d);
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const listNL=a=>a.length<2?a.join(""):new Intl.ListFormat(I18N.locale,{type:"conjunction"}).format(a);

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
    vet=(495/D-450)/100; methode=N_("huidplooimeting");
  }else{
    vet=(1.29*bmi+0.20*age-11.4*(man?1:0)-8.3)/100; methode=N_("schatting");
  }
  vet=Math.min(Math.max(vet,0.03),0.6);
  const lbm=w*(1-vet);
  const bmr = methode==="huidplooimeting" ? 370+21.6*lbm : 10*w+6.25*h-5*age+(man?5:-161);
  const tdee=bmr*(+P.activiteit||1.55);
  let adj=+P.doel||0; const notes=[];
  if(bmi<18.5 && adj<0){adj=0;notes.push(T("De BMI is lager dan 18,5. Het plan staat daarom op gewicht behouden in plaats van afvallen. Bespreek het doel met uw coach."));}
  let kcal=tdee*(1+adj);
  const floor=Math.max(bmr, man?1500:1200);
  if(kcal<floor){kcal=floor;notes.push(T("Het dagdoel is afgerond naar een veilige ondergrens."));}
  kcal=Math.round(kcal/10)*10;
  const auto={kcal,prot:Math.round(Math.min(lbm*(adj<0?2.2:2.0), w*2.4))};
  auto.fat=Math.round(Math.max(kcal*0.25/9, w*0.7));
  // coach override (P.override, set in the dashboard): calories and optionally protein/fat; carbs fill the rest
  const ov=P.override&&P.override.kcal>0?P.override:null;
  if(ov){
    kcal=Math.round(ov.kcal/10)*10;
    notes.length=0; notes.push(T("Uw coach heeft uw dagdoel persoonlijk ingesteld."));
  }
  let prot=ov&&ov.prot>0?ov.prot:Math.min(lbm*(adj<0?2.2:2.0), w*2.4);
  let fat=ov&&ov.fat>0?ov.fat:Math.max(kcal*0.25/9, w*0.7);
  const fib=kcal/1000*14; let carb=Math.max((kcal-prot*4-fat*9-fib*2)/4,50);
  prot=Math.round(prot); fat=Math.round(fat); carb=Math.round(carb);
  const whtr=m.taille?m.taille/h:null, whr=(m.taille&&m.heup)?m.taille/m.heup:null;
  const weekly=(kcal-tdee)*7/7700;
  return {bmi,vet,lbm,fm:w*vet,methode,bmr,tdee,kcal,prot,fat,carb,fiber:Math.round(kcal/1000*14),water:r1(w*0.035),whtr,whr,weekly,notes,age,
    handmatig:!!ov,auto,floor:Math.round(floor)};
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
function bmiLabel(b){return b<18.5?T("ondergewicht"):b<25?T("gezond gewicht"):b<27?T("neiging tot overgewicht"):b<30?T("overgewicht"):b<35?T("obesitas"):b<40?T("zeer ernstig overgewicht"):T("morbide obesitas")}
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
// Which foods go into a meal (rotated by idx), with portion bounds. Amounts are solved per day in optimizeDay.
function mealStructure(P,type,idx,scale){
  scale=scale||1; // bigger eaters get proportionally bigger maximum portions
  const tp=TEMPL[type], fixed=[], vars=[];
  tp.fixed.forEach(([k,g])=>{if(allowed(P,k)) fixed.push({key:k,g})});
  const fruit=tp.fruit?pick(P,tp.fruit,idx*3+1):null;
  const prot=pick(P,tp.prot,idx), carb=tp.carb.length?pick(P,tp.carb,idx*2+1):null, fat=pick(P,tp.fat,idx+2);
  const add=(key,role,min,max)=>{
    const u=FOODS[key].unit, step=u?(FOODS[key].f>40?u[2]/2:u[2]):5;
    vars.push({key,role,min,max:Math.max(min,Math.round(max*scale/step)*step),step});
  };
  // a snack may be fruit + nuts only, so its protein portion may drop to zero
  if(prot){const u=FOODS[prot].unit; add(prot,"prot",type==="snack"?0:u?(PROT_MIN_UNIT[type]||u[2]):PROT_MIN[type],type==="hoofd"?300:500)}
  // low-density starches (potato, cassava, plantain) need a higher cap to reach high-calorie targets
  if(carb) add(carb,"carb",CARB_MIN[carb]||30,FOODS[carb].k<200?600:400);
  if(fruit){const u=FOODS[fruit].unit; add(fruit,"fruit",u?u[2]:80,u?u[2]*2:250)}
  // realistic fat caps per meal: 1½ tbsp oil, 2 handfuls of nuts, 100 g avocado, 40 g nut butter/almonds
  if(fat){const f=FOODS[fat], u=f.unit; add(fat,"fat",0,f.oil?u[2]*1.5:u?u[2]*2:fat==="avocado"?100:40)}
  return {fixed,vars};
}

// Solves all portions of one day at once: weighted least squares on day totals (kcal, protein, carbs, fat)
// plus each meal's share of the calories, within the portion bounds. Coordinate descent on the continuous
// problem, then rounding to real portions (whole eggs, slices, 5 g) and a greedy ±1-step repair.
// SHARE_W keeps each meal near its calorie share, PSHARE_W spreads protein the same way (no 75 g chicken
// dinner next to a 355 g quark snack).
const FIT_W={k:6,p:2.5,c:1,f:1.5}, SHARE_W=1.2, PSHARE_W=0.8;
function optimizeDay(meals,G){
  const tgt={k:G.kcal,p:G.prot,c:G.carb,f:G.fat};
  const vars=[]; meals.forEach((ml,mi)=>ml.vars.forEach(v=>{v.mi=mi;v.x=v.min;vars.push(v)}));
  const base={k:0,p:0,c:0,f:0}, mealBase=meals.map(()=>0), mealBaseP=meals.map(()=>0);
  meals.forEach((ml,mi)=>ml.fixed.forEach(i=>{const x=macroOf(i.key,i.g);for(const z in base)base[z]+=x[z];mealBase[mi]+=x.k;mealBaseP[mi]+=x.p}));
  const pShare=meals.map(ml=>ml.share);
  const pShareSum=pShare.reduce((s,x)=>s+(x||0),0);
  const totals=()=>{
    const S={...base}, MK=mealBase.slice(), MP=mealBaseP.slice();
    vars.forEach(v=>{const f=FOODS[v.key],a=v.x/100;S.k+=f.k*a;S.p+=f.p*a;S.c+=f.c*a;S.f+=f.f*a;MK[v.mi]+=f.k*a;MP[v.mi]+=f.p*a});
    return {S,MK,MP};
  };
  // target protein per non-snack meal: its share of the protein not eaten in snacks
  const protTarget=(mi,S,MP)=>{
    const snackP=MP.reduce((s,p,i)=>s+(pShare[i]==null?p:0),0);
    return pShare[mi]/pShareSum*Math.max(0,tgt.p-snackP);
  };
  // protein above target is harmless within reason: overshoot costs little (≤10%) or moderately, shortfall costs full weight
  const wOf=(z,S)=>z==="p"&&S.p>tgt.p?(S.p<tgt.p*1.1?0.3:1):FIT_W[z];
  const J=()=>{
    const {S,MK,MP}=totals(); let j=0;
    for(const z in tgt) j+=wOf(z,S)*((S[z]-tgt[z])/tgt[z])**2;
    meals.forEach((ml,mi)=>{
      j+=SHARE_W*((MK[mi]-ml.share*tgt.k)/tgt.k)**2;
      if(pShare[mi]!=null) j+=PSHARE_W*((MP[mi]-protTarget(mi,S,MP))/tgt.p)**2;
    });
    return j;
  };
  for(let it=0;it<80;it++){
    for(const v of vars){
      v.x=0; const {S,MK,MP}=totals(), f=FOODS[v.key];
      let num=0, den=0;
      for(const z in tgt){const a=f[z]/100, w=wOf(z,S)/tgt[z]**2; num+=w*a*(tgt[z]-S[z]); den+=w*a*a}
      const a=f.k/100, w=SHARE_W/tgt.k**2, ml=meals[v.mi]; num+=w*a*(ml.share*tgt.k-MK[v.mi]); den+=w*a*a;
      if(pShare[v.mi]!=null){const ap=f.p/100, wp=PSHARE_W/tgt.p**2; num+=wp*ap*(protTarget(v.mi,S,MP)-MP[v.mi]); den+=wp*ap*ap}
      v.x=Math.min(v.max,Math.max(v.min,den>0?num/den:v.min));
    }
  }
  vars.forEach(v=>{v.x=Math.min(v.max,Math.max(v.min,Math.round(v.x/v.step)*v.step)); if(v.min>0&&v.x<v.min) v.x=Math.ceil(v.min/v.step)*v.step});
  let best=J();
  for(let pass=0;pass<60;pass++){
    let improved=false;
    for(const v of vars) for(const d of [v.step,-v.step]){
      const old=v.x, nx=old+d;
      if(nx<v.min-1e-9||nx>v.max+1e-9) continue;
      v.x=nx; const j=J();
      if(j<best-1e-12){best=j;improved=true} else v.x=old;
    }
    if(!improved) break;
  }
}
const ROLE_ORDER={prot:0,carb:1,fixed:2,fruit:3,fat:4};
function layoutFor(P,dag){
  const base=LAYOUT[P.maaltijden]||LAYOUT[3];
  if(dag!=="train") return base;
  const L=base.map(([n,t,s])=>[n,t,s*(1-TRAINING_SHARE)]);
  const m=P.trainingsmoment||"middag";
  const pos=m==="ochtend"?1:m==="avond"?L.length-1:L.findIndex(x=>x[0]==="Lunch")+1;
  L.splice(pos,0,[N_("Rond de training"),"training",TRAINING_SHARE,T("30–60 minuten vóór of direct na de training")]);
  return L;
}
// training days keep their own swap offsets, because the extra meal shifts the meal indices
const offKey=dag=>dag==="train"?"offT":"off";
function menuFor(P,menu,A,dag){
  const L=layoutFor(P,dag), off=(menu&&menu[offKey(dag)])||[], seed=(menu&&menu.seed)||0;
  const scale=Math.max(1,A.kcal/2400);
  const meals=L.map(([name,type,share,hint],i)=>({name,type,share,hint,i,...mealStructure(P,type,seed+(off[i]||0)+i*2,scale)}));
  optimizeDay(meals,A);
  return meals.map(ml=>{
    const items=[...ml.vars.filter(v=>v.x>0).map(v=>({key:v.key,g:v.x,r:v.role})),...ml.fixed.map(i=>({...i,r:"fixed"}))]
      .sort((a,b)=>ROLE_ORDER[a.r]-ROLE_ORDER[b.r]).map(({key,g})=>({key,g}));
    return {name:ml.name,type:ml.type,hint:ml.hint,i:ml.i,items,titel:dishTitle(ml.type,items),bereiding:preparation(ml.type,items)};
  });
}
function qty(i){
  const u=FOODS[i.key].unit;
  if(u){const n=i.g/u[2]; return n.toLocaleString(I18N.locale)+" "+(n<=1?u[0]:u[1])}
  return i.g+" g";
}
function dishTitle(type,items){
  const k=items.map(i=>i.key), f=x=>FOODS[x];
  const prot=k.find(x=>["eiwit","zuivel"].includes(f(x).cat));
  const rest=k.filter(x=>x!==prot&&x!=="groente"&&!f(x).oil).map(x=>f(x).s);
  if(k.includes("groente")) rest.push(f("groente").s);
  if(!prot) return cap(listNL(rest));
  return rest.length?T("{a} met {b}",{a:cap(f(prot).s),b:listNL(rest)}):cap(f(prot).s);
}
function preparation(type,items){
  const steps=items.map(i=>FOODS[i.key].b).filter(Boolean);
  const k=items.map(i=>i.key);
  const oil=k.find(x=>FOODS[x].oil);
  if(oil) steps.push(T("Gebruik de {x} om in te bakken of over de groente; dit is de hoeveelheid voor het hele gerecht.",{x:FOODS[oil].s}));
  const zu=k.find(x=>FOODS[x].cat==="zuivel");
  if(zu) steps.push(T(k.some(x=>FOODS[x].cat==="fruit")?"Doe de {x} in een kom en voeg de rest toe, met het fruit in stukjes.":"Doe de {x} in een kom en voeg de rest toe.",{x:FOODS[zu].s}));
  else if(type==="hoofd") steps.push(T("Serveer alles samen op één bord."));
  return steps;
}

// ---------- client-owned products ----------
// Products from the client's "Mijn producten" become foods with key "p<id>". Those marked "in menu"
// are added to the meal templates for the chosen meals and role, so the optimizer can use them.
const ROLE_SLOT={eiwit:"prot",koolh:"carb",vet:"fat",fruit:"fruit"}, ROLE_CAT={eiwit:"eiwit",koolh:"koolh",vet:"vet",fruit:"fruit"};
let customKeys=[];
function productFood(p){
  const naam=p.naam+(p.merk?` (${p.merk})`:"");
  return {n:naam,s:p.naam.toLowerCase(),k:+p.kcal,p:+p.eiwit,c:+p.koolh,f:+p.vet,v:+p.vezels||0,cat:ROLE_CAT[p.rol]||"overig",
    unit:p.portie_g?[p.portie_naam||T("portie"),p.portie_naam||T("porties"),+p.portie_g]:undefined,custom:true,id:p.id};
}
function setCustomFoods(list){
  customKeys.forEach(k=>{delete FOODS[k];Object.values(TEMPL).forEach(t=>["prot","carb","fruit","fat"].forEach(r=>{if(t[r]){const i=t[r].indexOf(k);if(i>=0)t[r].splice(i,1)}}))});
  customKeys=[];
  (list||[]).forEach(p=>{
    const k="p"+p.id; FOODS[k]=productFood(p); customKeys.push(k);
    if(p.in_menu&&ROLE_SLOT[p.rol]) (p.maaltijden||[]).forEach(m=>{
      [m,...(m==="snack"?["training"]:[])].forEach(t=>{const slot=TEMPL[t]&&TEMPL[t][ROLE_SLOT[p.rol]];if(slot&&!slot.includes(k))slot.push(k)});
    });
  });
}
// nutrients for g grams of a food key (base or custom)
function nutr(key,g){const x=macroOf(key,g);return {kcal:x.k,eiwit:x.p,koolh:x.c,vet:x.f}}
// the day's targets for a date: latest measurement on/before that date, training vs rest day by weekday
function targetFor(P,metingen,datum){
  const ms=sorted(metingen); if(!P||!ms.length) return null;
  const m=[...ms].reverse().find(x=>x.datum<=datum)||ms[0];
  const W=analyse(P,m), D=dagTargets(P,W);
  const dag=D?(isTrainingDay(P,new Date(datum+"T12:00:00"))?"train":"rust"):null;
  return {...(D?{...W,...D[dag]}:W),dag};
}
// which diary meal a generated meal belongs to
const diaryMeal=ml=>ml.type==="ontbijt"?"ontbijt":ml.type==="hoofd"?(ml.name==="Lunch"?"lunch":"avond"):"snack";

// ---------- plan data (shared by screen, print and shopping list) ----------
function planData(P,m,menu,dag){
  const W=analyse(P,m), D=dagTargets(P,W);
  const todayType=isTrainingDay(P)?"train":"rust";
  const d=D?(dag||todayType):null;
  const A=D?{...W,...D[d]}:W;
  const meals=menuFor(P,menu,A,d);
  const S={k:0,p:0,c:0,f:0,v:0};
  meals.forEach(ml=>{ml.kcal=0;ml.items.forEach(i=>{const x=macroOf(i.key,i.g);ml.kcal+=x.k;for(const z in S)S[z]+=x[z]})});
  return {W,D,A,dag:d,todayType,meals,S};
}
function mealHTML(ml,o){
  const rows=ml.items.map(i=>`<tr><td class="q">${qty(i)}</td><td>${FOODS[i.key].n}</td><td class="m">${Math.round(macroOf(i.key,i.g).k)} kcal</td></tr>`).join("");
  const swap=o.interactive?` <button class="swap" type="button" data-swap="${ml.i}" data-off="${offKey(o.dag)}" aria-label="${T("Andere invulling voor {x}",{x:T(ml.name)})}">${T("Wissel")}</button>`:"";
  const eaten=o.interactive&&o.eaten?(o.eaten.has(ml.i)?`<span class="eaten done">✓ ${T("In dagboek")}</span>`:`<button class="eaten" type="button" data-eaten="${ml.i}">${T("Gegeten")}</button>`):"";
  const prep=ml.bereiding.length?(o.print?`<ol class="prep">${ml.bereiding.map(s=>`<li>${s}</li>`).join("")}</ol>`
    :`<details class="prep"><summary>${T("Bereiding")}</summary><ol>${ml.bereiding.map(s=>`<li>${s}</li>`).join("")}</ol></details>`):"";
  return `<div class="meal"><div class="meal-h"><h3><span class="eyebrow">${T(ml.name)}${ml.hint?`<span class="sep">·</span>${ml.hint}`:""}</span>${ml.titel}</h3><span class="k">${fmt(Math.round(ml.kcal))} kcal${swap}</span></div><table>${rows}</table>${prep}${eaten?`<div class="meal-foot">${eaten}</div>`:""}</div>`;
}
function totalsHTML(S,A){
  const pct=(a,b)=>b?Math.round(a/b*100)+"%":"";
  return `<div class="totals">
      <div><small>${T("Energie")}</small><b>${fmt(Math.round(S.k))}</b><small>${T("{x} van doel",{x:pct(S.k,A.kcal)})}</small></div>
      <div><small>${T("Eiwit")}</small><b>${Math.round(S.p)} g</b><small>${T("doel {x} g",{x:A.prot})}</small></div>
      <div><small>${T("Koolhydraten")}</small><b>${Math.round(S.c)} g</b><small>${T("doel {x} g",{x:A.carb})}</small></div>
      <div><small>${T("Vet")}</small><b>${Math.round(S.f)} g</b><small>${T("doel {x} g",{x:A.fat})}</small></div>
    </div>`;
}
function targetHTML(A,W,D,dag){
  const pk=A.prot*4,ck=A.carb*4,fk=A.fat*9,tot=pk+ck+fk;
  const macros=[[T("Eiwit"),A.prot,pk,"--p"],[T("Koolhydraten"),A.carb,ck,"--c"],[T("Vet"),A.fat,fk,"--f"]].map(([l,g,k,c])=>
    `<div class="macro"><div class="v">${g}<span class="unit">g</span></div><div class="l"><span class="dot" style="background:var(${c})"></span>${l}<span class="sep">·</span>${Math.round(k/tot*100)}%</div></div>`).join("");
  return `<div class="target">
      <div class="kcal"><b>${fmt(A.kcal)}</b><span>kcal ${D?(dag==="train"?T("op een trainingsdag"):T("op een rustdag")):T("per dag")}</span></div>
      <div class="band" aria-hidden="true"><i style="width:${pk/tot*100}%;background:var(--p)"></i><i style="width:${ck/tot*100}%;background:var(--c)"></i><i style="width:${fk/tot*100}%;background:var(--f)"></i></div>
      <div class="macros">${macros}</div>
      <div class="facts"><span>${T("Vezels")} <b>${A.fiber} g</b></span><span>${T("Water")} <b>${fmt(A.water,1)} l</b></span><span>${D?T("Verbruik (gem.)"):T("Verbruik")} <b>${fmt(Math.round(W.tdee/10)*10)} kcal</b></span><span>${T("Verwacht")} <b>${W.weekly<0?"−":"+"}${fmt(Math.abs(W.weekly),2)} ${T("kg/week")}</b></span></div>
    </div>`;
}

// ---------- render: plan ----------
function planHTML(P,m,menu,o){
  o=o||{};
  const you=!o.coach, {W,D,A,dag,todayType,meals,S}=planData(P,m,menu,o.dag);
  let dayBar="";
  if(D){
    const btn=(t,l)=>`<button type="button" data-dag="${t}" aria-pressed="${dag===t}">${l}<small>${fmt(D[t].kcal)} kcal${t===todayType?'<span class="sep">·</span>'+T("vandaag"):""}</small></button>`;
    const days=DAGEN.filter(([d])=>P.trainingsdagen.includes(d)).map(([,l])=>l).join(", ");
    dayBar=`<div class="daytoggle" role="group" aria-label="${T("Soort dag")}">${btn("train",T("Trainingsdag"))}${btn("rust",T("Rustdag"))}</div>
      <p class="sub" style="font-size:14px">${T("Trainingsdagen: {d}, {m}. Gemiddeld over de week: {k} kcal per dag.",{d:days,m:MOMENT_LABEL[P.trainingsmoment||"middag"],k:fmt(W.kcal)})}</p>`;
  }
  return `
    ${o.banner||""}
    <h1>${you?T("Uw dagdoel"):T("Dagdoel")}</h1>
    <p class="sub">${T(you?"Gebaseerd op uw meting van {d} ({w} kg).":"Gebaseerd op de meting van {d} ({w} kg).",{d:dateNL(m.datum),w:fmt(m.gewicht,1)})}</p>
    ${dayBar}
    ${targetHTML(A,W,D,dag)}
    ${W.notes.map(n=>`<div class="note">${n}</div>`).join("")}
    <h2>${D?(dag==="train"?T("Maaltijden op een trainingsdag"):T("Maaltijden op een rustdag")):you?T("Uw maaltijden vandaag"):T("Maaltijden")}</h2>
    ${meals.map(ml=>mealHTML(ml,{interactive:o.interactive,dag,eaten:o.eaten})).join("")}
    ${totalsHTML(S,A)}
    <div class="actions">
      ${o.interactive?`<button class="btn" type="button" data-new-menu>${T("Nieuw menu maken")}</button>`:""}
      <button class="btn ghost" type="button" data-boodschappen>${T("Boodschappenlijst")}</button>
      <button class="btn ghost" type="button" data-print>${T("Plan als PDF")}</button>
    </div>`;
}

// ---------- shopping list ----------
function shoppingList(P,m,menu){
  const W=analyse(P,m), D=dagTargets(P,W);
  const n=D?P.trainingsdagen.length:0;
  const days=D?[["train",n],["rust",7-n]]:[[null,7]];
  const tot={};
  days.forEach(([dag,count])=>{
    const A=D?{...W,...D[dag]}:{...W};
    menuFor(P,menu,A,dag).forEach(ml=>ml.items.forEach(i=>{tot[i.key]=(tot[i.key]||0)+i.g*count}));
  });
  const amount=(key,g)=>{
    const f=FOODS[key], u=f.unit;
    if(u){
      const c=Math.ceil(g/u[2]-1e-9);
      if(key==="brood") return T("{n} sneetjes (± {b} brood)",{n:c,b:fmt(Math.ceil(c/20*2)/2,c%20&&Math.ceil(c/20*2)%2?1:0)});
      if(f.oil) return T("{n} el (± {ml} ml)",{n:c,ml:Math.ceil(c*15/50)*50});
      return `${c} ${c===1?u[0]:u[1]}`;
    }
    const r=Math.ceil(g/50)*50;
    return r>=1000?fmt(r/1000,r%1000?1:0)+" kg":r+" g";
  };
  return CATS.map(([cat,label])=>({label,items:Object.keys(tot).filter(k=>FOODS[k].cat===cat)
    .sort((a,b)=>FOODS[a].n.localeCompare(FOODS[b].n)).map(k=>({naam:FOODS[k].shop||FOODS[k].n,hoeveel:amount(k,tot[k])}))}))
    .filter(g=>g.items.length);
}
function shoppingHTML(P,m,menu){
  const W=analyse(P,m), D=dagTargets(P,W);
  const note=D?T("Voor 7 dagen: {t} trainingsdagen en {r} rustdagen, volgens het huidige menu.",{t:P.trainingsdagen.length,r:7-P.trainingsdagen.length}):T("Voor 7 dagen, volgens het huidige menu.");
  return `<p class="sub">${note} ${T("Hoeveelheden zijn naar boven afgerond.")}</p>`+
    shoppingList(P,m,menu).map(g=>`<h3 class="shop-h">${g.label}</h3><ul class="shop">${g.items.map(i=>`<li><label><input type="checkbox"><span>${i.naam}</span></label><b>${i.hoeveel}</b></li>`).join("")}</ul>`).join("");
}

// ---------- print document ----------
function printHTML(P,m,menu,o){
  o=o||{};
  const W=analyse(P,m), D=dagTargets(P,W);
  const types=D?["train","rust"]:[null];
  const days=D?DAGEN.filter(([d])=>P.trainingsdagen.includes(d)).map(([,l])=>l).join(", "):"";
  const section=dag=>{
    const pd=planData(P,m,menu,dag);
    const title=dag==="train"?`${T("Trainingsdag")} <small>(${days}, ${MOMENT_LABEL[P.trainingsmoment||"middag"]})</small>`:dag==="rust"?T("Rustdag"):T("Dagmenu");
    return `<section class="p-day"><h2>${title}</h2>
      <div class="p-targets"><div><b>${fmt(pd.A.kcal)}</b><small>kcal</small></div><div><b>${pd.A.prot}<span class="unit">g</span></b><small>${T("eiwit")}</small></div><div><b>${pd.A.carb}<span class="unit">g</span></b><small>${T("koolhydraten")}</small></div><div><b>${pd.A.fat}<span class="unit">g</span></b><small>${T("vet")}</small></div></div>
      ${pd.meals.map(ml=>mealHTML(ml,{print:true})).join("")}</section>`;
  };
  return `<header class="p-head"><img src="${o.merk&&o.merk.logo?o.merk.logo:"/img/logo.webp"}" alt="${esc(o.merk&&o.merk.naam||"DCRAMERE")}"><div><p class="p-kicker">${T("Persoonlijk voedingsplan")}</p><h1>${esc(o.naam||"")}</h1>
      <p>${T("Opgesteld op {d}",{d:dateNL(today())})}<span class="sep">·</span>${T("gebaseerd op de meting van {d} ({w} kg)",{d:dateNL(m.datum),w:fmt(m.gewicht,1)})}<br>Coach: ${esc(o.coach||"Dino E. Cramer")} — ${esc(o.merk&&o.merk.naam||"DCRAMERE")}</p></div></header>
    <div class="p-summary"><div><small>${T("Doel")}</small><b>${DOEL_LABEL[String(P.doel)]||""}</b></div><div><small>${T("Gemiddeld per dag")}</small><b>${fmt(W.kcal)} kcal</b></div><div><small>${T("Verwacht")}</small><b>${W.weekly<0?"−":"+"}${fmt(Math.abs(W.weekly),2)} ${T("kg/week")}</b></div><div><small>${T("Water")}</small><b>${T("{x} l per dag",{x:fmt(W.water,1)})}</b></div></div>
    ${types.map(section).join("")}
    <section class="p-shop"><h2>${T("Boodschappenlijst voor een week")}</h2>${shoppingHTML(P,m,menu)}</section>
    <footer class="p-foot">${T("MEET. ANALYSEER. PRESTEER.")} — ${T("Dit plan is een richtlijn op basis van erkende formules en vervangt geen medisch advies.")}</footer>`;
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
  const lab=t=>new Date(t).toLocaleDateString(I18N.locale,{month:"short",year:"2-digit"});
  g+=`<text x="${pl}" y="${H-6}">${lab(t0)}</text><text x="${W-pr}" y="${H-6}" text-anchor="end">${lab(t1)}</text>`;
  return `<h2>${T("Gewicht (kg)")}</h2><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T("Verloop van het gewicht")}">${g}<polyline fill="none" stroke="var(--gold)" stroke-width="2.5" points="${pts}"/>${dots}</svg>`;
}
function historyHTML(P,metingen,o){
  o=o||{};
  const rows=sorted(metingen).map(m=>({m,a:analyse(P,m)}));
  const dw=rows[rows.length-1].m.gewicht-rows[0].m.gewicht;
  let html=`<p class="sub">${Tn(rows.length,"1 meting","{n} metingen")}. ${T("Verandering sinds de eerste meting:")} <b style="color:var(--ink)">${signed(dw)} kg</b>.</p>`;
  if(rows.length>1) html+=chartHTML(rows);
  html+=`<div class="table-scroll"><table class="hist"><thead><tr><th>${T("Datum")}</th><th>${T("Gewicht")}</th><th>BMI</th><th>${T("Vet%")}</th><th>${T("Vetvrij")}</th><th>WHtR</th>${o.coach?`<th>${T("Door")}</th>`:""}<th></th></tr></thead><tbody>`+
    rows.slice().reverse().map(({m,a})=>`<tr><td>${dateNL(m.datum,{day:"numeric",month:"short",year:"2-digit"})}</td><td>${fmt(m.gewicht,1)}</td><td title="${bmiLabel(a.bmi)}">${fmt(a.bmi,1)}</td><td title="${T(a.methode)}">${fmt(a.vet*100,1)}${a.methode==="schatting"?"*":""}</td><td>${fmt(a.lbm,1)}</td><td>${a.whtr?fmt(a.whtr,2):"–"}</td>${o.coach?`<td>${m.door==="coach"?"Coach":T("Cliënt")}</td>`:""}<td><button class="del" type="button" data-del="${m.id}">${T("Verwijderen")}</button></td></tr>`).join("")+
    `</tbody></table></div><p class="sub" style="font-size:13px;margin-top:8px">* ${T(o.coach?"Geschat vetpercentage op basis van BMI en leeftijd. Een huidplooimeting met de coach is nauwkeuriger.":"Geschat vetpercentage op basis van BMI en leeftijd. Een huidplooimeting met uw coach is nauwkeuriger.")}</p>`;
  return html;
}

// ---------- check-ins ----------
// bad = which end of the 1–5 scale needs the coach's attention
const CHECK_Q=[
  ["energie",T("Energie"),T("zeer laag"),T("zeer goed"),"low"],
  ["honger",T("Honger"),T("nauwelijks"),T("veel honger"),"high"],
  ["slaap",T("Slaap"),T("slecht"),T("uitstekend"),"low"],
  ["stress",T("Stress"),T("weinig"),T("veel"),"high"],
  ["naleving",T("Plan gevolgd"),T("nauwelijks"),T("volledig"),"low"]
];
const flagged=(q,v)=>q[4]==="low"?v<=2:v>=4;
function checkinFieldsHTML(){
  return `<input type="hidden" name="datum" value="${today()}">`+CHECK_Q.map(q=>`
    <fieldset class="scale"><legend>${q[1]}</legend>
      <div class="scale-row">${[1,2,3,4,5].map(v=>`<label><input type="radio" name="${q[0]}" value="${v}" required><span>${v}</span></label>`).join("")}</div>
      <div class="scale-ends"><span>${q[2]}</span><span>${q[3]}</span></div>
    </fieldset>`).join("")+`
    <label>${T("Aantal trainingen deze week")} <small>${T("optioneel")}</small><input type="number" name="training" min="0" max="14" inputmode="numeric"></label>
    <label>${T("Opmerking voor uw coach")} <small>${T("optioneel")}</small><textarea name="opmerking" style="min-height:90px" placeholder="${T("Hoe ging het? Waar liep u tegenaan?")}"></textarea></label>`;
}
function readCheckin(f){
  const k={datum:f.elements.datum.value||today(),training:f.elements.training.value===""?null:+f.elements.training.value,opmerking:f.elements.opmerking.value.trim()};
  for(const q of CHECK_Q){const v=f.querySelector(`input[name="${q[0]}"]:checked`);if(!v) throw new Error(T("Kies een score voor {x}.",{x:q[1].toLowerCase()}));k[q[0]]=+v.value}
  return k;
}
function checkinsHTML(list){
  if(!list||!list.length) return `<p class="empty">${T("Nog geen check-ins.")}</p>`;
  return `<div class="table-scroll"><table class="hist checkins"><thead><tr><th>${T("Week van")}</th>${CHECK_Q.map(q=>`<th>${q[1]}</th>`).join("")}<th>${T("Train.")}</th></tr></thead><tbody>`+
    list.map(k=>`<tr><td>${dateNL(k.datum,{day:"numeric",month:"short"})}</td>${CHECK_Q.map(q=>`<td class="${flagged(q,k[q[0]])?"stale":""}">${k[q[0]]}</td>`).join("")}<td>${k.training==null?"–":k.training}</td></tr>${k.opmerking?`<tr class="remark"><td colspan="${CHECK_Q.length+2}">“${esc(k.opmerking)}”</td></tr>`:""}`).join("")+
    `</tbody></table></div><p class="sub" style="font-size:13px;margin-top:8px">${T("Scores van 1 tot 5. Rood = aandachtspunt (lage energie, slaap of naleving; veel honger of stress).")}</p>`;
}
const checkinFlags=k=>k?CHECK_Q.filter(q=>flagged(q,k[q[0]])).map(q=>q[1].toLowerCase()):[];

// ---------- progress photos ----------
const POSES=[["voor",T("Voorkant")],["achter",T("Achterkant")],["zijkant",T("Zijkant")]];
const FOTO_EVERY=28; // days between photo sets
function fotoSets(fotos){
  const by={};
  (fotos||[]).forEach(f=>{(by[f.datum]=by[f.datum]||{datum:f.datum})[f.pose]=f.id});
  return Object.values(by).sort((a,b)=>a.datum<b.datum?-1:1);
}
const lastFotoDate=fotos=>{const s=fotoSets(fotos);return s.length?s[s.length-1].datum:null};
const fotosDue=fotos=>{const d=lastFotoDate(fotos);return !d||daysSince(d)>=FOTO_EVERY};
// Downscale on the device before upload (max 1600 px, JPEG). Drawing to a canvas also drops all EXIF
// metadata such as GPS location; createImageBitmap applies the EXIF rotation first.
async function prepareFoto(file){
  if(!file||!/^image\//.test(file.type)) throw new Error(T("Kies een foto."));
  let img;
  try{img=await createImageBitmap(file,{imageOrientation:"from-image"})}
  catch(e){throw new Error(T("Deze foto kan niet worden gelezen. Probeer een JPEG- of PNG-foto."))}
  const MAX=1600, r=Math.min(1,MAX/Math.max(img.width,img.height));
  const cv=document.createElement("canvas"); cv.width=Math.round(img.width*r); cv.height=Math.round(img.height*r);
  cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
  return await new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error(T("Verwerken van de foto is mislukt."))),"image/jpeg",0.85));
}
// profile picture: centre square crop to 400×400 JPEG (also strips EXIF/GPS)
async function prepareAvatar(file){
  if(!file||!/^image\//.test(file.type)) throw new Error(T("Kies een foto."));
  let img; try{img=await createImageBitmap(file,{imageOrientation:"from-image"})}catch(e){throw new Error(T("Deze foto kan niet worden gelezen."))}
  const side=Math.min(img.width,img.height), cv=document.createElement("canvas"); cv.width=cv.height=400;
  cv.getContext("2d").drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,400,400);
  return await new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error(T("Verwerken van de foto is mislukt."))),"image/jpeg",0.88));
}
// round avatar: photo, or initials on a gold ring
function avatarHTML(url,naam,size){
  size=size||40;
  const ini=String(naam||"?").trim().split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  return url?`<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`
    :`<span class="avatar ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px" aria-hidden="true">${esc(ini)}</span>`;
}
async function uploadFoto(url,blob){
  const r=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":"image/jpeg","x-taal":I18N.lang},body:blob});
  let data=null; try{data=await r.json()}catch(e){}
  if(!r.ok) throw new Error((data&&data.error)||T("Uploaden is mislukt. Controleer uw internetverbinding."));
  return data;
}
// three slots for one date; data-foto-pose inputs are handled by the page script
function fotoUploadHTML(fotos,datum,src,o){
  o=o||{};
  const set=fotoSets(fotos).find(s=>s.datum===datum)||{};
  return `<div class="foto-grid">${POSES.map(([p,l])=>`
    <div class="foto-slot${set[p]?" has":""}">
      <div class="foto-frame">${set[p]?`<img src="${src(set[p])}" alt="${l}" loading="lazy">`:`<span class="foto-ghost foto-ghost-${p}" aria-hidden="true"></span>`}</div>
      <b>${l}</b>
      <div class="foto-btns">
        <label class="btn small${set[p]?" ghost":""}"><input type="file" accept="image/*" capture="environment" data-foto-pose="${p}" hidden>${set[p]?T("Opnieuw"):T("Foto maken")}</label>
        <label class="btn small ghost"><input type="file" accept="image/*" data-foto-pose="${p}" hidden>${T("Uit galerij")}</label>
        ${set[p]&&o.del?`<button class="linkbtn" type="button" data-foto-del="${set[p]}">${T("Verwijderen")}</button>`:""}
      </div>
    </div>`).join("")}</div>`;
}
const FOTO_TIPS=`<ul class="tips"><li>${T("Zelfde plek, zelfde licht en zelfde tijdstip (bij voorkeur 's ochtends, nuchter).")}</li><li>${T("Strakke sportkleding of zwemkleding, armen ontspannen langs het lichaam.")}</li><li>${T("Laat iemand anders de foto maken, of gebruik de zelfontspanner, op heuphoogte.")}</li><li>${T("Uw foto's zijn alleen zichtbaar voor u en uw coach. Locatiegegevens worden verwijderd.")}</li></ul>`;
// side-by-side comparison of two dates (defaults: first vs latest)
function fotoCompareHTML(fotos,src,a,b){
  const sets=fotoSets(fotos);
  if(!sets.length) return `<p class="empty">${T("Nog geen progressiefoto's.")}</p>`;
  const A=sets.find(s=>s.datum===a)||sets[0], B=sets.find(s=>s.datum===b)||sets[sets.length-1];
  const opt=sel=>sets.map(s=>`<option value="${s.datum}"${s.datum===sel?" selected":""}>${dateNL(s.datum,{day:"numeric",month:"short",year:"numeric"})}</option>`).join("");
  const cell=(s,p,l)=>s[p]?`<img src="${src(s[p])}" alt="${l} ${dateNL(s.datum)}" loading="lazy">`:`<span class="foto-missing">${T("geen foto")}</span>`;
  return `<div class="compare-bar"><label>${T("Van")}<select data-foto-cmp="a">${opt(A.datum)}</select></label><label>${T("Tot")}<select data-foto-cmp="b">${opt(B.datum)}</select></label>
      <span class="sub">${Tn(sets.length,"1 set","{n} sets")} · ${T("{n} weken ertussen",{n:Math.max(0,Math.round((new Date(B.datum)-new Date(A.datum))/864e5/7))})}</span></div>
    <div class="compare">${POSES.map(([p,l])=>`<div class="compare-row"><p class="kicker">${l}</p><div class="compare-pair"><figure>${cell(A,p,l)}<figcaption>${dateNL(A.datum,{day:"numeric",month:"short",year:"numeric"})}</figcaption></figure><figure>${cell(B,p,l)}<figcaption>${dateNL(B.datum,{day:"numeric",month:"short",year:"numeric"})}</figcaption></figure></div></div>`).join("")}</div>`;
}

// ---------- intake ----------
const INTAKE_Q=[
  ["doel","textarea",T("Wat wilt u bereiken, en waarom is dat belangrijk voor u?"),true],
  ["streefgewicht","number",T("Streefgewicht (kg)")],
  ["medisch","textarea",T("Medische aandoeningen of medicijnen"),T("Bijvoorbeeld diabetes, hoge bloeddruk, schildklier")],
  ["blessures","textarea",T("Blessures of lichamelijke klachten")],
  ["allergieen","text",T("Allergieën of intoleranties")],
  ["werk","select",T("Wat voor werk doet u?"),[["zittend",T("Vooral zittend")],["staand",T("Vooral staand of lopend")],["fysiek",T("Zwaar fysiek")],["ploegen",T("Wisselende diensten")]]],
  ["slaap","number",T("Hoeveel uur slaapt u gemiddeld per nacht?")],
  ["ervaring","select",T("Ervaring met training"),[["geen",T("Geen")],["beginner",T("Beginner (minder dan 1 jaar)")],["gevorderd",T("Gevorderd (1–3 jaar)")],["ervaren",T("Ervaren (meer dan 3 jaar)")]]],
  ["sport","text",T("Welke sport of training doet u?")],
  ["lastig","textarea",T("Wat vindt u het lastigst aan gezond eten?")],
  ["alcohol","select",T("Hoe vaak drinkt u alcohol?"),[["nooit",T("Nooit")],["soms",T("Soms (minder dan 1× per week)")],["wekelijks",T("Wekelijks")],["dagelijks",T("Dagelijks")]]]
];
function intakeFieldsHTML(){
  return INTAKE_Q.map(([k,t,l,x])=>{
    const ph=typeof x==="string"?` placeholder="${x}"`:"";
    if(t==="textarea") return `<label>${l}${x===true?"":` <small>${T("optioneel")}</small>`}<textarea name="${k}" style="min-height:90px"${ph}${x===true?" required":""}></textarea></label>`;
    if(t==="select") return `<label>${l}<select name="${k}"><option value="">${T("Kies…")}</option>${x.map(([v,o])=>`<option value="${v}">${o}</option>`).join("")}</select></label>`;
    return `<label>${l} <small>${T("optioneel")}</small><input name="${k}" type="${t}"${t==="number"?' inputmode="decimal" step="0.5"':""}${ph}></label>`;
  }).join("");
}
function fillIntake(f,I){if(!I)return;INTAKE_Q.forEach(([k])=>{if(I[k]!=null) f.elements[k].value=I[k]})}
function readIntake(f){
  const I={};
  INTAKE_Q.forEach(([k,t])=>{const v=f.elements[k].value.trim();I[k]=t==="number"?(v===""?null:parseFloat(v.replace(",","."))):v});
  if(!I.doel) throw new Error(T("Beschrijf kort wat u wilt bereiken."));
  return I;
}
function intakeSummaryHTML(I){
  if(!I) return `<p class="empty">${T("De cliënt heeft de intake nog niet ingevuld.")}</p>`;
  return `<dl class="intake">${INTAKE_Q.map(([k,t,l,x])=>{
    let v=I[k]; if(v==null||v==="") return "";
    if(t==="select") v=(x.find(o=>o[0]===v)||[,v])[1];
    return `<dt>${l}</dt><dd>${esc(v)}${k==="streefgewicht"?" kg":k==="slaap"?" "+T("uur"):""}</dd>`;
  }).join("")}</dl>`;
}

// ---------- shared form fragments ----------
function profielFieldsHTML(){
  return `
    <div class="row">
      <label>${T("Geslacht")}<select name="geslacht" required><option value="">${T("Kies…")}</option><option value="m">${T("Man")}</option><option value="v">${T("Vrouw")}</option></select></label>
      <label>${T("Geboortedatum")}<input type="date" name="geboorte" required></label>
    </div>
    <div class="row">
      <label>${T("Lengte")} <small>cm</small><input type="number" name="lengte" min="120" max="230" inputmode="numeric" required></label>
      <label>${T("Maaltijden per dag")}<select name="maaltijden"><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
    </div>
    <label>${T("Activiteitsniveau")}
      <select name="activiteit">
        <option value="1.35">${T("Zittend werk, nauwelijks training")}</option>
        <option value="1.45">${T("Licht actief, 1–2 trainingen per week")}</option>
        <option value="1.55" selected>${T("Actief, 3–4 trainingen per week")}</option>
        <option value="1.7">${T("Zeer actief, 5–6 trainingen per week")}</option>
        <option value="1.85">${T("Zwaar fysiek werk én dagelijks training")}</option>
      </select>
    </label>
    <fieldset>
      <legend>${T("Training")}</legend>
      <p style="margin:0 0 10px;font-size:13px;color:var(--muted)">${T("Op trainingsdagen krijgt u meer koolhydraten en een extra maaltijd rond de training, op rustdagen iets minder. Uw weekgemiddelde blijft gelijk. Geen dagen gekozen: elke dag hetzelfde plan.")}</p>
      <div class="checks" data-trainingsdagen>${DAGEN.map(([d,l])=>`<label class="chip"><input type="checkbox" value="${d}">${l}</label>`).join("")}</div>
      <label style="margin-top:12px">${T("Wanneer traint u meestal?")}
        <select name="trainingsmoment"><option value="ochtend">${T("'s Ochtends (na het ontbijt)")}</option><option value="middag" selected>${T("'s Middags (na de lunch)")}</option><option value="avond">${T("'s Avonds (voor het avondeten)")}</option></select>
      </label>
    </fieldset>
    <label>${T("Doel")}
      <select name="doel">
        <option value="-0.2">${T("Vetmassa verbranden")}</option>
        <option value="-0.1">${T("Rustig afvallen")}</option>
        <option value="0">${T("Gewicht behouden")}</option>
        <option value="0.1">${T("Spiermassa opbouwen")}</option>
      </select>
    </label>
    <fieldset>
      <legend>${T("Voorkeuren")}</legend>
      <div class="checks">
        <label class="chip"><input type="checkbox" name="geenRood" checked>${T("Geen rood vlees")}</label>
        <label class="chip"><input type="checkbox" name="geenVis">${T("Geen vis")}</label>
        <label class="chip"><input type="checkbox" name="vega">${T("Vegetarisch")}</label>
        <label class="chip"><input type="checkbox" name="geenZuivel">${T("Geen zuivel")}</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>${T("Deze producten liever niet")}</legend>
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
  if(!e.geslacht.value||!e.geboorte.value||!(l>=120&&l<=230)) throw new Error(T("Vul geslacht, geboortedatum en lengte (120–230 cm) in."));
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
      <label>${T("Datum")}<input type="date" name="datum" required value="${today()}"></label>
      <label class="big-input">${T("Gewicht (kg)")}<input type="number" name="gewicht" step="0.1" min="30" max="300" inputmode="decimal" required placeholder="0,0"></label>
    </div>
    <details${o.open?" open":""}>
      <summary>${o.open?T("Uitgebreide meting"):T("Uitgebreide meting (met uw coach)")}</summary>
      <div style="display:grid;gap:14px;margin-top:10px">
        <div class="row">
          <label>${T("Taille, smalste omtrek")} <small>cm</small><input type="number" name="taille" step="0.5" inputmode="decimal"></label>
          <label>${T("Heupomvang")} <small>cm</small><input type="number" name="heup" step="0.5" inputmode="decimal"></label>
        </div>
        <fieldset>
          <legend>${T("Huidplooien (mm) — alle vier invullen")}</legend>
          <div class="row">
            <label>Biceps<input type="number" name="p1" step="0.1" inputmode="decimal"></label>
            <label>Triceps<input type="number" name="p2" step="0.1" inputmode="decimal"></label>
            <label>${T("Onder schouderblad")}<input type="number" name="p3" step="0.1" inputmode="decimal"></label>
            <label>${T("Boven heupbeen")}<input type="number" name="p4" step="0.1" inputmode="decimal"></label>
          </div>
        </fieldset>
      </div>
    </details>`;
}
function readMeting(f){
  const n=k=>{const v=parseFloat(String(f.elements[k].value).replace(",","."));return v>0?v:null};
  const d=f.elements.datum.value, w=n("gewicht");
  if(!d||!(w>=30&&w<=300)) throw new Error(T("Vul een datum en een gewicht tussen 30 en 300 kg in."));
  const m={datum:d,gewicht:w,taille:n("taille"),heup:n("heup"),p1:n("p1"),p2:n("p2"),p3:n("p3"),p4:n("p4")};
  const pl=[m.p1,m.p2,m.p3,m.p4].filter(x=>x!=null).length;
  if(pl&&pl<4) throw new Error(T("Vul alle vier huidplooien in, of geen."));
  return m;
}

// ---------- api & ui helpers ----------
async function api(path,method,body){
  const r=await fetch(path,{method:method||"GET",credentials:"same-origin",
    headers:Object.assign({"x-taal":I18N.lang},body!==undefined?{"content-type":"application/json"}:{}),body:body!==undefined?JSON.stringify(body):undefined});
  let data=null; try{data=await r.json()}catch(e){}
  if(!r.ok){const e=new Error((data&&data.error)||T("Er ging iets mis ({x}). Controleer uw internetverbinding.",{x:r.status}));e.status=r.status;throw e}
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
// coach branding: name, logo and accent colour (validated server-side for contrast on black)
function applyBrand(merk){
  const r=document.documentElement.style, k=merk&&merk.kleur;
  if(k){
    const n=parseInt(k.slice(1),16), c=[n>>16&255,n>>8&255,n&255];
    r.setProperty("--gold",k); r.setProperty("--c",k);
    r.setProperty("--gold-dim",`rgb(${c.map(v=>Math.round(v*0.72)).join(",")})`);
    r.setProperty("--gold-soft",`rgba(${c.join(",")},.08)`);
  }else ["--gold","--c","--gold-dim","--gold-soft"].forEach(v=>r.removeProperty(v));
  document.querySelectorAll(".brand").forEach(b=>{
    const img=b.querySelector("img"), name=b.querySelector("b");
    if(img) img.src=merk&&merk.logo?merk.logo:"/img/emblem.webp";
    if(name) name.textContent=merk&&merk.naam?merk.naam:"DCRAMERE";
  });
}
// fills the hidden #print container and opens the print dialog (browsers offer "Save as PDF")
function printPlan(P,m,menu,o){
  const el=document.getElementById("print");
  el.innerHTML=printHTML(P,m,menu,o);
  const img=el.querySelector("img");
  const go=()=>{document.body.classList.add("printing");window.print();document.body.classList.remove("printing")};
  if(img&&!img.complete){img.onload=go;img.onerror=go}else go();
}

window.DC={applyBrand,prepareAvatar,avatarHTML,FOODS,TEMPL,setCustomFoods,productFood,nutr,targetFor,diaryMeal,macroOf,DOEL_LABEL,esc,fmt,dateNL,today,daysSince,signed,analyse,dagTargets,bmiLabel,sorted,latest,menuFor,planData,planHTML,historyHTML,
  shoppingList,shoppingHTML,printHTML,printPlan,POSES,FOTO_EVERY,FOTO_TIPS,fotoSets,lastFotoDate,fotosDue,prepareFoto,uploadFoto,fotoUploadHTML,fotoCompareHTML,checkinFieldsHTML,readCheckin,checkinsHTML,checkinFlags,intakeFieldsHTML,fillIntake,readIntake,intakeSummaryHTML,
  profielFieldsHTML,fillProfiel,readProfiel,metingFieldsHTML,readMeting,api,handleForm};
})();
