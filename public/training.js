// DCRAMERE Training — program definitions, body-map pictograms and render helpers (client app + coach dashboard)
(function(){
"use strict";
const DC=window.DC, esc=DC.esc, fmt=DC.fmt;

// ---------- exercises ----------
// m = primary muscles, s = secondary, rust = rest in seconds, side = reps per side, unit = what a "rep" is
const EX={
  // push
  incline_db_press:{n:"Incline Dumbbell Press",eq:"Dumbbell",m:["chest"],s:["fdelt","triceps"],rust:120,cue:"Bank op 30°, schouderbladen naar achteren en omlaag. Laat de dumbbells gecontroleerd zakken tot borsthoogte en druk ze in een lichte boog omhoog."},
  flat_db_press:{n:"Flat Dumbbell Press",eq:"Dumbbell",m:["chest"],s:["fdelt","triceps"],rust:120,cue:"Voeten stevig op de grond, lichte boog in de onderrug. Druk omhoog zonder de dumbbells bovenin tegen elkaar te tikken."},
  smith_incline_press:{n:"Smith Slight Incline Press",eq:"Smith",m:["chest"],s:["fdelt","triceps"],rust:120,cue:"Bank op 15–20°. Laat de stang zakken naar de bovenkant van de borst, ellebogen ongeveer 45° van het lichaam."},
  incline_bb_press:{n:"Incline Barbell Press",eq:"Barbell",m:["chest"],s:["fdelt","triceps"],rust:150,cue:"Bank op 30°, grip iets breder dan schouderbreedte. Raak de bovenborst licht aan en druk krachtig omhoog."},
  db_barrel_press:{n:"Dumbbell Barrel Press",eq:"Dumbbell",m:["chest"],s:["triceps"],rust:90,cue:"Druk de dumbbells in een brede boog omhoog, alsof u een ton omarmt. Knijp de borst bovenin aan."},
  incline_db_lateral:{n:"Incline Dumbbell Side Lateral",eq:"Dumbbell",m:["sdelt"],s:[],rust:75,cue:"Steun met de borst tegen een schuine bank en hef de dumbbells zijwaarts tot schouderhoogte. Geen zwaai, rustig terug."},
  cable_lateral_single:{n:"Cable Side Laterals (Single Arm)",eq:"Kabel",m:["sdelt"],s:[],rust:60,side:true,cue:"Kabel laag. Trek met een licht gebogen arm zijwaarts tot schouderhoogte en laat langzaam terugkomen."},
  seated_db_lateral:{n:"Seated Dumbbell Side Lateral",eq:"Dumbbell",m:["sdelt"],s:[],rust:75,cue:"Rechtop zitten, lichte buiging in de ellebogen. Hef tot schouderhoogte zonder mee te zwaaien."},
  machine_lateral:{n:"Machine Side Laterals",eq:"Machine",m:["sdelt"],s:[],rust:60,cue:"Stel de stoel zo in dat uw schouders op één lijn met het draaipunt liggen. Rustig tempo, volledige beweging."},
  seated_db_press_hammer:{n:"Seated Dumbbell Press (Hammer)",eq:"Dumbbell",m:["fdelt"],s:["sdelt","triceps"],rust:120,cue:"Rugleuning bijna rechtop, handpalmen naar elkaar. Druk recht omhoog zonder de onderrug hol te trekken."},
  standing_bb_ohp:{n:"Standing Barbell Shoulder Press",eq:"Barbell",m:["fdelt"],s:["sdelt","triceps","traps"],rust:150,cue:"Billen en buik aangespannen. Druk de stang in een rechte lijn boven het hoofd en breng het hoofd bovenin 'door' de armen."},
  straight_bar_ext:{n:"Straight Bar Extensions",eq:"Kabel",m:["triceps"],s:[],rust:60,cue:"Ellebogen vast tegen het lichaam. Strek de armen volledig en knijp de triceps onderin aan."},
  rope_ext:{n:"Rope Extensions",eq:"Kabel",m:["triceps"],s:[],rust:60,cue:"Duw het touw omlaag en trek de uiteinden onderin uit elkaar. De ellebogen blijven op hun plek."},
  skull_crushers:{n:"Skull Crushers",eq:"Barbell",m:["triceps"],s:[],rust:90,cue:"Laat de (EZ-)stang gecontroleerd zakken naar het voorhoofd of net erachter. De bovenarmen bewegen niet."},
  incline_skull:{n:"Incline Skull Crushers",eq:"Barbell",m:["triceps"],s:[],rust:90,cue:"Op een schuine bank. Laat de stang achter het hoofd zakken voor extra rek op de lange kop van de triceps."},
  // pull
  wide_pulldown:{n:"Wide Grip Lat Pulldowns",eq:"Kabel",m:["lats"],s:["biceps","upperback"],rust:120,cue:"Brede grip, borst omhoog. Trek de stang naar de bovenborst en denk aan 'ellebogen naar de heupen'."},
  vbar_pulldown:{n:"V-Bar Lat Pulldowns",eq:"Kabel",m:["lats"],s:["biceps"],rust:120,cue:"Leun licht achterover en trek de V-greep naar de borst. Laat gecontroleerd terug tot volledige rek."},
  bb_pullover:{n:"Barbell Pullovers",eq:"Barbell",m:["lats"],s:["chest","triceps"],rust:90,cue:"Armen licht gebogen. Laat de stang achter het hoofd zakken tot u rek voelt in de lats en trek terug tot boven de borst."},
  seated_row_vbar:{n:"Seated Row V-Bar",eq:"Kabel",m:["upperback","lats"],s:["biceps"],rust:120,cue:"Borst omhoog. Trek de handgreep naar de navel en knijp de schouderbladen samen, zonder met het bovenlichaam mee te zwaaien."},
  seated_lat_row:{n:"Seated Lat Row",eq:"Kabel",m:["lats"],s:["upperback"],rust:90,cue:"Trek met de ellebogen laag langs het lichaam richting de heupen voor maximale lat-activatie."},
  seated_row_high_elbow:{n:"Seated Row High Elbow Row",eq:"Kabel",m:["upperback","rdelt"],s:["traps"],rust:75,cue:"Brede grip, trek met hoge ellebogen naar de borst. Focus op de bovenrug en de achterkant van de schouders."},
  bent_bb_row:{n:"Bent Over Barbell Row",eq:"Barbell",m:["upperback","lats"],s:["lowerback","biceps"],rust:150,cue:"Heupen naar achteren, rug neutraal, bovenlichaam ongeveer 45°. Trek de stang naar de onderbuik."},
  tbar_row:{n:"T Bar Row",eq:"Barbell",m:["upperback","lats"],s:["biceps","lowerback"],rust:120,cue:"Borst over de stang, rug neutraal. Trek de handgrepen naar de borst en knijp de schouderbladen samen."},
  meadows_row:{n:"Meadows Row",eq:"Barbell",m:["lats","upperback"],s:["rdelt","biceps"],rust:90,side:true,cue:"Sta haaks op de landmine en roei het uiteinde van de stang met één arm omhoog. Steun met de andere arm op de knie."},
  incline_db_high_elbow_row:{n:"Incline Dumbbell High Elbow Row",eq:"Dumbbell",m:["upperback"],s:["rdelt"],rust:90,cue:"Borst op een schuine bank. Roei met de ellebogen wijd richting de schouders voor de bovenrug."},
  incline_db_rear_delt:{n:"Incline Dumbbell Rear Delt Raise",eq:"Dumbbell",m:["rdelt"],s:["upperback"],rust:60,cue:"Borst op een schuine bank, lichte dumbbells. Hef zijwaarts met bijna gestrekte armen, duimen licht omlaag."},
  cable_rear_delt_close:{n:"Cable Rear Delt (Close To Body)",eq:"Kabel",m:["rdelt"],s:[],rust:60,cue:"Trek de kabel dicht langs het lichaam naar achteren. Beweeg vanuit de schouder, niet vanuit de onderarm."},
  rear_delt_btb:{n:"Rear Delt Behind The Back Barbell Raise",eq:"Barbell",m:["rdelt"],s:["traps"],rust:60,cue:"Houd de stang achter het lichaam met een brede grip en hef hem een paar centimeter met de achterkant van de schouders."},
  cable_rear_delt_partials:{n:"Single Arm Cable Rear Delt Partials",eq:"Kabel",m:["rdelt"],s:[],rust:60,side:true,cue:"Korte, gecontroleerde bewegingen in het sterkste deel van de beweging. Houd de spanning continu."},
  cable_straight_curl:{n:"Cable Straight Bar Curl",eq:"Kabel",m:["biceps"],s:["forearms"],rust:60,cue:"Ellebogen naast het lichaam, geen zwaai. Knijp bovenin kort aan en laat langzaam zakken."},
  ez_curl:{n:"EZ Bar Curl",eq:"Barbell",m:["biceps"],s:["forearms"],rust:75,cue:"Staand, ellebogen stil. Volledige beweging van gestrekt tot volledig gebogen."},
  db_preacher_curl:{n:"Dumbbell Preacher Curl (Flat Side)",eq:"Dumbbell",m:["biceps"],s:[],rust:60,side:true,cue:"Gebruik de vlakke kant van de preacherbank. Volledige rek onderin, zonder de elleboog te overstrekken."},
  incline_cable_curl:{n:"Incline Cable Curl",eq:"Kabel",m:["biceps"],s:[],rust:60,cue:"Op een schuine bank tussen de kabels. De armen blijven achter het lichaam voor maximale rek van de biceps."},
  // legs
  leg_ext:{n:"Leg Extensions",eq:"Machine",m:["quads"],s:[],rust:75,cue:"Rug tegen de leuning. Strek de benen volledig en houd bovenin 1 tel vast; de laatste reeksen zijn om te branden."},
  seated_leg_curl:{n:"Seated Leg Curl",eq:"Machine",m:["hams"],s:["calves"],rust:75,cue:"Beenrol net boven de hielen, heupen vast in de stoel. Buig volledig en laat langzaam terugkomen."},
  he_smith_squat:{n:"Heel Elevated Smith Squat",eq:"Smith",m:["quads"],s:["glutes"],rust:150,cue:"Hielen op een verhoging, voeten iets naar voren. Zak diep met een rechte romp."},
  he_highbar_squat:{n:"Heel Elevated High Bar Squats",eq:"Barbell",m:["quads"],s:["glutes","lowerback"],rust:180,cue:"Stang hoog op de trapezius, hielen verhoogd. Zak diep met de knieën ver over de tenen."},
  hack_squat:{n:"Hack Squat",eq:"Machine",m:["quads"],s:["glutes"],rust:150,cue:"Rug plat tegen het kussen, voeten op heupbreedte midden op het platform. Volledige diepte."},
  leg_press_low:{n:"Leg Press (Toes Low)",eq:"Machine",m:["quads"],s:["glutes"],rust:120,cue:"Voeten laag en op heupbreedte op het platform. Zak zo diep mogelijk zonder dat de onderrug loskomt."},
  glute_rdl:{n:"Glute RDL's",eq:"Barbell",m:["glutes","hams"],s:["lowerback"],rust:150,cue:"Knieën licht gebogen, duw de heupen ver naar achteren tot u rek voelt. Rug neutraal, stang dicht langs de benen."},
  smith_stiff_leg:{n:"Smith Dumbbell Stiff Leg",eq:"Dumbbell",m:["hams"],s:["glutes","lowerback"],rust:120,cue:"Benen bijna gestrekt, heupen naar achteren. Laat het gewicht zakken tot u sterke rek in de hamstrings voelt."},
  sumo_deads:{n:"Sumo Deads",eq:"Barbell",m:["glutes","adductors"],s:["hams","quads","lowerback"],rust:180,cue:"Brede stand, tenen naar buiten, grip binnen de knieën. Duw de vloer weg en houd de rug neutraal."},
  walking_lunges:{n:"Weighted Walking Lunges",eq:"Dumbbell",m:["quads","glutes"],s:["adductors"],rust:120,unit:"stappen",cue:"Lange passen, de achterste knie bijna op de grond. Tel het totale aantal stappen."},
  db_split_squat:{n:"Dumbbell Quad Split Squat",eq:"Dumbbell",m:["quads"],s:["glutes"],rust:90,side:true,cue:"Achterste voet op een bank, voorste voet iets dichterbij voor quadfocus. Zak recht naar beneden."},
  seated_calf_partials:{n:"Seated Calf Partials (Top)",eq:"Machine",m:["calves"],s:[],rust:60,cue:"De eerste sets volledig; de hoge reeksen zijn korte, snelle herhalingen in het bovenste deel van de beweging."},
  smith_calf_raise:{n:"Smith Calf Raise",eq:"Smith",m:["calves"],s:[],rust:60,cue:"Voorvoeten op een verhoging. Volledige rek onderin en 1 tel pauze bovenin."}
};

// exercise names stay in English (gym terminology); equipment and cues are translated
for(const e of Object.values(EX)) e.cue=T(e.cue); // equipment is translated where shown (coach-built exercises store the Dutch key)
const TIPS={
  push:[T("Warm op met 5 minuten cardio en 2 lichte sets van de eerste oefening."),T("Schouderbladen naar achteren en omlaag bij alle drukoefeningen; dat beschermt de schouders."),T("Zijwaartse raises: liever lichter en strikt dan zwaar met zwaai.")],
  pull:[T("Trek met de ellebogen, niet met de handen; zo train je de rug in plaats van de biceps."),T("Houd bij roeien de rug neutraal en het bovenlichaam stil."),T("Gebruik lifting straps bij de zware sets als je grip eerder opgeeft dan je rug.")],
  algemeen:[T("Warm op met 5–10 minuten lichte cardio en 1–2 lichte sets van de eerste oefening."),T("Techniek gaat voor gewicht: stop een set als de uitvoering slordig wordt."),T("Houd de rusttijden aan; noteer elke set, zodat u volgende keer weet wat u moet verslaan.")],
  legs:[T("Warm op met 5–10 minuten fietsen en een paar lichte sets beenstrekken."),T("Diepte gaat voor gewicht: werk met een bereik dat u technisch goed beheerst."),T("Neem bij squats en RDL's 2–3 minuten rust; bij kuiten en isolatie is 60 seconden genoeg.")]
};

// ---------- programs ----------
const d=(key,naam,type,focus,list)=>({key,naam,type,focus,ex:list.map(([id,reps])=>({id,reps}))});
const PROGRAMS={
  ppl12:{
    id:"ppl12",naam:"Push · Pull · Legs",sub:T("12 weken, 6 trainingen per week"),weken:12,
    dagen:[
      d("pushA","Push A","push",T("Borst, schouders en triceps"),[["incline_db_press",[10,8,8,6]],["flat_db_press",[10,8,6]],["smith_incline_press",[10,8,8,6]],["incline_db_lateral",[20,10,10,10]],["cable_lateral_single",[15,15,10,10]],["seated_db_press_hammer",[12,10,8,6]],["straight_bar_ext",[10,10,10,10,10,10]],["skull_crushers",[20,10,10,8,8]]]),
      d("pullA","Pull A","pull",T("Rug, achterkant schouders en biceps"),[["wide_pulldown",[10,8,6,6]],["bb_pullover",[10,8,8,6]],["seated_row_vbar",[10,8,6,6]],["bent_bb_row",[8,6]],["incline_db_high_elbow_row",[10,8,6]],["incline_db_rear_delt",[15,15,10,10]],["cable_rear_delt_close",[15]],["cable_straight_curl",[10,10,10,8,8]],["ez_curl",[10,10,10,8,8]]]),
      d("legsA","Legs A","legs",T("Quadriceps, hamstrings, billen en kuiten"),[["leg_ext",[10,10,10,10,20,30]],["seated_leg_curl",[10,10,8,8,20]],["he_smith_squat",[10,8,8,6]],["leg_press_low",[20]],["glute_rdl",[10,8,8]],["walking_lunges",[30,40,50]],["seated_calf_partials",[10,10,10,30,30,30]]]),
      d("pushB","Push B","push",T("Borst, schouders en triceps"),[["flat_db_press",[10,8,6,6]],["incline_bb_press",[10,8,6]],["db_barrel_press",[10,8,8]],["seated_db_lateral",[15,10,10,8]],["machine_lateral",[20]],["standing_bb_ohp",[20,15,10]],["rope_ext",[10]],["incline_skull",[20,10,10,8,8]]]),
      d("pullB","Pull B","pull",T("Rug, achterkant schouders en biceps"),[["vbar_pulldown",[8,8,8,6]],["seated_lat_row",[15]],["tbar_row",[10,10,8,8,6]],["meadows_row",[10]],["rear_delt_btb",[15]],["cable_rear_delt_partials",[10]],["seated_row_high_elbow",[20]],["db_preacher_curl",[10,10,8,8,8]],["incline_cable_curl",[10]]]),
      d("legsB","Legs B","legs",T("Hamstrings, quadriceps, billen en kuiten"),[["smith_stiff_leg",[15,15,15,10]],["db_split_squat",[15,15,15,10]],["he_highbar_squat",[10,8,8]],["hack_squat",[10,8,6,6]],["seated_leg_curl",[10,10,8,8]],["sumo_deads",[10,8,8]],["smith_calf_raise",[20]]])
    ]
  }
};
const PHASES=[
  {van:1,tot:4,naam:T("Fundament"),rir:T("2–3 herhalingen in reserve"),tekst:T("Kies per set een gewicht waarmee u alle herhalingen haalt met nog 2–3 in de tank. Focus op techniek en het vastleggen van uw startgewichten.")},
  {van:5,tot:8,naam:T("Opbouw"),rir:T("1–2 herhalingen in reserve"),tekst:T("Verhoog het gewicht zodra u alle herhalingen van een oefening haalt. Streef elke week naar iets meer gewicht of een herhaling extra.")},
  {van:9,tot:11,naam:T("Intensiteit"),rir:T("0–1 herhaling in reserve"),tekst:T("De laatste set van elke oefening gaat tot (technisch) falen. Houd de rusttijden aan en eet op trainingsdagen volgens uw trainingsdagmenu.")},
  {van:12,tot:12,deload:true,naam:T("Deload"),rir:T("3 herhalingen in reserve"),tekst:T("Herstelweek: ongeveer 60% van de sets met 10–20% minder gewicht. Zo komt u uitgerust uit het programma en kunt u daarna sterker verder.")}
];
// phases: the built-in 12-week program has four; coach-built programs progress weekly with an optional final deload
const CUSTOM_PHASE={naam:T("Progressie"),rir:T("1–2 herhalingen in reserve"),tekst:T("Haal alle herhalingen met goede techniek. Lukt dat bij alle sets, verhoog dan de volgende keer het gewicht of doe een herhaling meer.")};
const DELOAD_PHASE={deload:true,naam:T("Deload"),rir:T("3 herhalingen in reserve"),tekst:T("Herstelweek: ongeveer 60% van de sets met 10–20% minder gewicht, zodat u uitgerust aan het volgende blok begint.")};
function phaseOf(w,progId){
  const prog=progId&&PROGRAMS[progId];
  if(prog&&prog.custom) return prog.deload&&w===prog.weken?DELOAD_PHASE:CUSTOM_PHASE;
  return PHASES.find(p=>w>=p.van&&w<=p.tot)||PHASES[0];
}
// the deload week keeps the first ~60% of each exercise's sets
const setsFor=(reps,week,progId)=>phaseOf(week,progId).deload?reps.slice(0,Math.ceil(reps.length*0.6)):reps;
const weekOf=(start,progId)=>Math.min((PROGRAMS[progId]||PROGRAMS.ppl12).weken,Math.max(1,Math.floor(DC.daysSince(start)/7)+1));
// coach-built program from the API → registry (its own exercises are added to the library)
function registerProgram(def){
  if(!def) return;
  Object.entries(def.oefeningen||{}).forEach(([k,e])=>{EX[k]={...e,custom:true}});
  PROGRAMS[def.id]={id:def.id,naam:def.naam,sub:`${Tn(def.weken,"1 week","{n} weken")}, ${Tn(def.dagen.length,"1 training per week","{n} trainingen per week")}`,
    weken:def.weken,deload:!!def.deload,custom:true,dagen:def.dagen.map(d=>({...d,focus:d.focus||""}))};
}
const dayOf=(prog,key)=>PROGRAMS[prog].dagen.find(x=>x.key===key);
const e1rm=(kg,reps)=>kg>0&&reps>0?kg*(1+reps/30):0; // Epley
const repsLabel=(e,reps)=>reps.join(" · ")+" "+(e.unit==="stappen"?T("stappen"):e.unit||"reps")+(e.side?" "+T("per kant"):"");
const kgFmt=kg=>kg==null||kg===""?"–":fmt(kg,Number.isInteger(+kg)?0:1);
function minutes(day,week,progId){
  const s=day.ex.reduce((t,x)=>t+setsFor(x.reps,week,progId).length*(45+EX[x.id].rust),0);
  return Math.round(s/60/5)*5;
}
const howto=e=>"https://www.youtube.com/results?search_query="+encodeURIComponent(e.n+" exercise technique");

// ---------- body map pictogram ----------
// Stylised front + back figure; primary muscles in gold, secondary dimmed.
const SHAPES=[
  // front (x≈30)
  ["base",'<circle cx="30" cy="8" r="6"/><rect x="27" y="13" width="6" height="4" rx="1"/><circle cx="11" cy="56" r="2.4"/><circle cx="49" cy="56" r="2.4"/><ellipse cx="25" cy="100" rx="3.6" ry="2"/><ellipse cx="35" cy="100" rx="3.6" ry="2"/>'],
  ["fdelt",'<ellipse cx="18" cy="22" rx="5" ry="5"/><ellipse cx="42" cy="22" rx="5" ry="5"/>'],
  ["chest",'<ellipse cx="24.5" cy="27.5" rx="6.2" ry="4.6"/><ellipse cx="35.5" cy="27.5" rx="6.2" ry="4.6"/>'],
  ["biceps",'<ellipse cx="14" cy="34" rx="3.2" ry="6.5"/><ellipse cx="46" cy="34" rx="3.2" ry="6.5"/>'],
  ["forearms",'<ellipse cx="12" cy="47" rx="2.7" ry="6.5"/><ellipse cx="48" cy="47" rx="2.7" ry="6.5"/><ellipse cx="72" cy="47" rx="2.7" ry="6.5"/><ellipse cx="108" cy="47" rx="2.7" ry="6.5"/>'],
  ["abs",'<rect x="24.5" y="33" width="11" height="18" rx="3"/>'],
  ["quads",'<ellipse cx="25" cy="65" rx="5.3" ry="12.5"/><ellipse cx="35" cy="65" rx="5.3" ry="12.5"/>'],
  ["adductors",'<ellipse cx="30" cy="61" rx="1.8" ry="7"/>'],
  ["shins",'<ellipse cx="25" cy="89" rx="3.4" ry="8.5"/><ellipse cx="35" cy="89" rx="3.4" ry="8.5"/>'],
  // back (x≈90)
  ["base",'<circle cx="90" cy="8" r="6"/><rect x="87" y="13" width="6" height="4" rx="1"/><circle cx="71" cy="56" r="2.4"/><circle cx="109" cy="56" r="2.4"/><ellipse cx="85" cy="100" rx="3.6" ry="2"/><ellipse cx="95" cy="100" rx="3.6" ry="2"/>'],
  ["traps",'<path d="M90 14 L100 21 L90 29 L80 21 Z"/>'],
  ["sdelt",'<ellipse cx="78" cy="22" rx="5" ry="5"/><ellipse cx="102" cy="22" rx="5" ry="5"/>'],
  ["upperback",'<rect x="84.5" y="23" width="11" height="10" rx="2.5"/>'],
  ["lats",'<ellipse cx="83" cy="33" rx="4.6" ry="8.5"/><ellipse cx="97" cy="33" rx="4.6" ry="8.5"/>'],
  ["triceps",'<ellipse cx="74" cy="34" rx="3.2" ry="6.5"/><ellipse cx="106" cy="34" rx="3.2" ry="6.5"/>'],
  ["lowerback",'<rect x="86.5" y="39" width="7" height="10" rx="2"/>'],
  ["glutes",'<ellipse cx="85" cy="55" rx="5.6" ry="5.6"/><ellipse cx="95" cy="55" rx="5.6" ry="5.6"/>'],
  ["hams",'<ellipse cx="85" cy="70" rx="5" ry="10"/><ellipse cx="95" cy="70" rx="5" ry="10"/>'],
  ["calves",'<ellipse cx="85" cy="88" rx="4" ry="7.8"/><ellipse cx="95" cy="88" rx="4" ry="7.8"/>']
];
// muscles that show on the other view too (rear delt = back shoulder, side delt shows on both)
const ALIAS={rdelt:["sdelt"],sdelt:["fdelt","sdelt"]};
function bodyMap(e){
  const lvl={};
  const mark=(list,v)=>list.forEach(k=>(ALIAS[k]||[k]).forEach(x=>{lvl[x]=Math.max(lvl[x]||0,v)}));
  mark(e.s,1); mark(e.m,2);
  return `<svg class="bodymap" viewBox="0 0 120 104" role="img" aria-label="${T("Spieren")}: ${e.m.map(k=>MUSCLE_NL[k]).join(", ")}">${SHAPES.map(([k,g])=>
    `<g class="${k==="base"?"bm-base":lvl[k]===2?"bm-p":lvl[k]===1?"bm-s":"bm-o"}">${g}</g>`).join("")}</svg>`;
}
const MUSCLE_NL={chest:T("borst"),fdelt:T("voorkant schouders"),sdelt:T("zijkant schouders"),rdelt:T("achterkant schouders"),triceps:T("triceps"),biceps:T("biceps"),forearms:T("onderarmen"),lats:T("lats"),upperback:T("bovenrug"),traps:T("trapezius"),lowerback:T("onderrug"),abs:T("buik"),quads:T("quadriceps"),hams:T("hamstrings"),glutes:T("billen"),calves:T("kuiten"),adductors:T("adductoren")};

// ---------- log analysis ----------
// workouts: [{week,dag,datum,sets:{exId:[{kg,reps,ok}]},afgerond,updated}]
function lastPerformance(workouts,exId,except){
  const list=(workouts||[]).filter(w=>w!==except&&!(except&&w.week===except.week&&w.dag===except.dag)&&w.sets&&(w.sets[exId]||[]).some(s=>s.ok&&s.kg!=null))
    .sort((a,b)=>(a.datum||"")<(b.datum||"")?1:(a.datum||"")>(b.datum||"")?-1:b.week-a.week);
  return list[0]?{w:list[0],sets:list[0].sets[exId].filter(s=>s.ok)}:null;
}
function bestSet(sets){let b=null;(sets||[]).forEach(s=>{if(s.ok&&s.kg>0&&s.reps>0&&(!b||e1rm(s.kg,s.reps)>e1rm(b.kg,b.reps)))b=s});return b}
function suggestion(prev,targets){
  if(!prev||!prev.sets.length) return "";
  const hitAll=targets.every((t,i)=>prev.sets[i]&&prev.sets[i].reps>=t);
  return hitAll?T("Alle herhalingen gehaald: probeer 2,5 kg (of één stap) zwaarder."):"";
}
function stats(prog,workouts){
  const done=(workouts||[]).filter(w=>w.afgerond);
  let sets=0,vol=0;
  done.forEach(w=>Object.values(w.sets||{}).forEach(a=>a.forEach(s=>{if(s.ok){sets++;vol+=(+s.kg||0)*(+s.reps||0)}})));
  return {klaar:done.length,totaal:PROGRAMS[prog].weken*PROGRAMS[prog].dagen.length,sets,vol,laatste:done.map(w=>w.datum).sort().pop()||null};
}
// strength progression per exercise: first vs best logged top set (estimated 1RM)
function progression(prog,workouts){
  const rows={};
  (workouts||[]).filter(w=>w.sets).sort((a,b)=>a.week-b.week||((a.datum||"")<(b.datum||"")?-1:1)).forEach(w=>{
    Object.entries(w.sets).forEach(([id,sets])=>{
      const b=bestSet(sets); if(!b||!EX[id]) return;
      const r=rows[id]=rows[id]||{id,eerste:null,beste:null,laatste:null};
      if(!r.eerste) r.eerste={...b,week:w.week};
      if(!r.beste||e1rm(b.kg,b.reps)>e1rm(r.beste.kg,r.beste.reps)) r.beste={...b,week:w.week};
      r.laatste={...b,week:w.week};
    });
  });
  return Object.values(rows);
}

// ---------- render: overview ----------
function overviewHTML(P,workouts,week,o){
  o=o||{};
  const prog=PROGRAMS[P.id], cur=weekOf(P.start,P.id), ph=phaseOf(week,P.id), st=stats(P.id,workouts);
  const byKey=k=>(workouts||[]).find(w=>w.week===week&&w.dag===k);
  const next=prog.dagen.find(x=>!(byKey(x.key)||{}).afgerond);
  return `
    <p class="kicker">${prog.naam} · ${prog.sub}</p>
    <h1>${o.coach?T("Trainingsprogramma"):T("Training")}</h1>
    <div class="weekbar">
      <button class="btn small ghost" type="button" data-tr-week="${week-1}" ${week<=1?"disabled":""} aria-label="${T("Vorige week")}">‹</button>
      <div><b>${T("Week {n}",{n:week})}</b> <span>${T("van {n}",{n:prog.weken})}${week===cur?" · "+T("deze week"):""}</span></div>
      <button class="btn small ghost" type="button" data-tr-week="${week+1}" ${week>=prog.weken?"disabled":""} aria-label="${T("Volgende week")}">›</button>
    </div>
    <div class="phase"><b>${T("Fase: {x}",{x:ph.naam})}</b><span>${ph.rir}</span><p>${ph.tekst}</p></div>
    <div class="days">${prog.dagen.map((x,i)=>{
      const w=byKey(x.key), done=w&&w.afgerond, started=w&&!done&&Object.values(w.sets||{}).some(a=>a.some(s=>s.ok));
      return `<button type="button" class="day${done?" done":""}${next===x&&!o.coach?" next":""}" data-tr-day="${x.key}">
        <span class="day-n">${T("Dag {n}",{n:i+1})}</span><b>${x.naam}</b><small>${x.focus}</small>
        <span class="day-meta">${Tn(x.ex.length,"1 oefening","{n} oefeningen")} · ±${minutes(x,week,P.id)} min</span>
        <span class="day-status">${done?`✓ ${T("Afgerond {d}",{d:DC.dateNL(w.datum,{day:"numeric",month:"short"})})}`:started?T("Bezig"):next===x&&!o.coach?T("Volgende training"):""}</span>
      </button>`}).join("")}
      ${prog.dagen.length<7?`<div class="day rest"><span class="day-n">${7-prog.dagen.length===1?T("Dag {n}",{n:7}):T("Overige {n} dagen",{n:7-prog.dagen.length})}</span><b>${7-prog.dagen.length===1?T("Rustdag"):T("Rustdagen")}</b><small>${T("Herstel, wandelen of lichte mobiliteit")}</small></div>`:""}
    </div>
    <div class="stats tr-stats">
      <div><small>${T("Trainingen afgerond")}</small><b>${st.klaar}<span class="unit">/ ${st.totaal}</span></b></div>
      <div><small>${T("Sets gelogd")}</small><b>${fmt(st.sets)}</b></div>
      <div><small>${T("Totaal volume")}</small><b>${fmt(Math.round(st.vol/1000),0)}<span class="unit">${T("ton")}</span></b></div>
      <div><small>${T("Laatste training")}</small><b style="font-size:18px">${st.laatste?DC.dateNL(st.laatste,{day:"numeric",month:"short"}):"–"}</b></div>
    </div>`;
}

// ---------- render: workout ----------
function workoutHTML(P,workouts,wo,o){
  o=o||{};
  const day=dayOf(P.id,wo.dag), ph=phaseOf(wo.week,P.id), ro=!!o.readonly;
  const total=day.ex.reduce((t,x)=>t+setsFor(x.reps,wo.week,P.id).length,0);
  const done=Object.values(wo.sets||{}).reduce((t,a)=>t+a.filter(s=>s.ok).length,0);
  return `
    ${ro?"":`<button class="linkbtn" type="button" data-tr-back>← ${T("Training")}</button>`}
    <p class="kicker" style="margin-top:14px">${T("Week {n}",{n:wo.week})} · ${T("Fase {x}",{x:ph.naam})} · ${ph.rir}</p>
    <h1>${day.naam}</h1>
    <p class="sub">${day.focus?day.focus+" · ":""}${Tn(day.ex.length,"1 oefening","{n} oefeningen")} · ±${minutes(day,wo.week,P.id)} min</p>
    ${ro?"":`<div class="wo-progress" aria-hidden="true"><i style="width:${total?done/total*100:0}%"></i></div><p class="wo-status"><span data-wo-count>${T("{a} van {b} sets",{a:done,b:total})}</span><span data-wo-saved></span></p>`}
    ${wo.afgerond&&!ro?`<div class="banner"><span><b>${T("Afgerond op {d}.",{d:DC.dateNL(wo.datum,{day:"numeric",month:"long"})})}</b> ${T("U kunt uw sets nog aanpassen.")}</span></div>`:""}
    ${ro?"":`<details class="tips"><summary>${TIPS[day.type]?(day.type==="push"?T("Tips voor push-dagen"):day.type==="pull"?T("Tips voor pull-dagen"):T("Tips voor benen-dagen")):T("Tips voor deze training")}</summary><ul>${(TIPS[day.type]||TIPS.algemeen).map(t=>`<li>${t}</li>`).join("")}</ul></details>`}
    ${day.ex.map((x,i)=>{
      const e=EX[x.id], reps=setsFor(x.reps,wo.week,P.id), logged=(wo.sets||{})[x.id]||[];
      const prev=lastPerformance(workouts,x.id,wo), sug=suggestion(prev,reps);
      const prevTxt=prev?`${T("Vorige keer (week {n}):",{n:prev.w.week})} ${prev.sets.map(s=>`${kgFmt(s.kg)}×${s.reps}`).join(" · ")}`:"";
      return `<article class="ex" data-ex="${x.id}">
        <div class="ex-h">${bodyMap(e)}<div>
          <p class="kicker">${T("Oefening {n}",{n:i+1})} · ${T(e.eq)}</p><h3>${e.n}</h3>
          <p class="ex-target">${repsLabel(e,reps)}</p></div></div>
        ${ro?"":`<p class="ex-cue">${e.cue}</p>`}
        ${prevTxt&&!ro?`<p class="ex-prev">${prevTxt}${sug?`<br><b>${sug}</b>`:""}</p>`:""}
        <table class="sets"><thead><tr><th>${T("Set")}</th><th>${T("Doel")}</th><th>kg</th><th>${e.unit==="stappen"?T("Stappen"):T("Reps")}</th>${ro?"":"<th></th>"}</tr></thead><tbody>
        ${reps.map((t,si)=>{
          const s=logged[si]||{}, pk=prev&&prev.sets[si]?prev.sets[si].kg:(prev&&prev.sets.length?prev.sets[prev.sets.length-1].kg:null);
          return ro?`<tr class="${s.ok?"done":""}"><td>${si+1}</td><td>${t}</td><td>${s.ok?kgFmt(s.kg):"–"}</td><td>${s.ok?(s.reps??"–"):"–"}</td></tr>`
          :`<tr class="${s.ok?"done":""}"><td>${si+1}</td><td>${t}</td>
            <td><input type="text" inputmode="decimal" data-set="${x.id}:${si}:kg" value="${s.kg??""}" placeholder="${pk!=null?kgFmt(pk):"kg"}" aria-label="${T("Gewicht set {n}",{n:si+1})}"></td>
            <td><input type="text" inputmode="numeric" data-set="${x.id}:${si}:reps" value="${s.reps??""}" placeholder="${t}" aria-label="${T("Herhalingen set {n}",{n:si+1})}"></td>
            <td><button class="set-ok" type="button" data-set-ok="${x.id}:${si}" aria-pressed="${!!s.ok}" aria-label="${T("Set {n} klaar",{n:si+1})}">✓</button></td></tr>`}).join("")}
        </tbody></table>
        ${ro?"":`<a class="ex-howto" href="${howto(e)}" target="_blank" rel="noopener">${T("Bekijk uitleg")} ↗</a>`}
      </article>`}).join("")}
    ${ro?(wo.notitie?`<p class="sub"><b>${T("Notitie:")}</b> ${esc(wo.notitie)}</p>`:""):`
    <label style="margin-top:22px">${T("Notitie voor uw coach")} <small>${T("optioneel")}</small><textarea data-wo-note style="min-height:80px" placeholder="${T("Hoe voelde de training? Pijntjes, records, opmerkingen…")}">${esc(wo.notitie||"")}</textarea></label>
    <div class="actions"><button class="btn block" type="button" data-wo-finish>${wo.afgerond?T("Wijzigingen opslaan"):T("Training afronden")}</button></div>`}`;
}

// summary after finishing: sets, volume and new records (best e1RM vs. all earlier sessions)
function summaryHTML(P,workouts,wo){
  let sets=0,vol=0; const prs=[];
  Object.entries(wo.sets||{}).forEach(([id,a])=>{
    a.forEach(s=>{if(s.ok){sets++;vol+=(+s.kg||0)*(+s.reps||0)}});
    const b=bestSet(a); if(!b) return;
    const earlier=(workouts||[]).filter(w=>!(w.week===wo.week&&w.dag===wo.dag)).map(w=>bestSet((w.sets||{})[id])).filter(Boolean);
    const prevBest=earlier.reduce((m,s)=>Math.max(m,e1rm(s.kg,s.reps)),0);
    if(earlier.length&&e1rm(b.kg,b.reps)>prevBest) prs.push(`${EX[id].n}: ${kgFmt(b.kg)} kg × ${b.reps}`);
  });
  return `<div class="wo-summary"><p class="kicker">${T("Training afgerond")}</p><h2>${T("Sterk werk.")}</h2>
    <div class="stats"><div><small>${T("Sets")}</small><b>${sets}</b></div><div><small>${T("Volume")}</small><b>${fmt(Math.round(vol))}<span class="unit">kg</span></b></div><div><small>${T("Records")}</small><b>${prs.length}</b></div><div><small>${T("Week")}</small><b>${wo.week}<span class="unit">/ ${(PROGRAMS[P.id]||PROGRAMS.ppl12).weken}</span></b></div></div>
    ${prs.length?`<ul class="prs">${prs.map(p=>`<li>🏆 ${p}</li>`).join("")}</ul>`:""}
    <div class="actions"><button class="btn" type="button" data-tr-back>${T("Terug naar overzicht")}</button></div></div>`;
}

// ---------- render: coach ----------
function coachGridHTML(P,workouts,sel){
  const prog=PROGRAMS[P.id], cur=weekOf(P.start,P.id);
  const cell=(w,k)=>(workouts||[]).find(x=>x.week===w&&x.dag===k);
  return `<div class="table-scroll"><table class="trgrid"><thead><tr><th>${T("Week")}</th>${prog.dagen.map(x=>`<th>${x.naam}</th>`).join("")}</tr></thead><tbody>
    ${Array.from({length:prog.weken},(_,i)=>i+1).map(w=>`<tr class="${w===cur?"cur":""}"><td>${w}<small>${phaseOf(w,P.id).naam}</small></td>${prog.dagen.map(x=>{
      const c=cell(w,x.key), n=c?Object.values(c.sets||{}).reduce((t,a)=>t+a.filter(s=>s.ok).length,0):0;
      return `<td>${c?`<button type="button" class="cellbtn${c.afgerond?" ok":""}${sel&&sel.week===w&&sel.dag===x.key?" sel":""}" data-tr-cell="${w}:${x.key}">${c.afgerond?"✓":T("{n} sets",{n})}<small>${c.datum?DC.dateNL(c.datum,{day:"numeric",month:"short"}):""}</small></button>`:(w<cur?'<span class="miss">–</span>':"")}</td>`}).join("")}</tr>`).join("")}
  </tbody></table></div>`;
}
function progressionHTML(P,workouts){
  const rows=progression(P.id,workouts).filter(r=>r.laatste);
  if(!rows.length) return `<p class="empty">${T("Nog geen gelogde sets.")}</p>`;
  return `<div class="table-scroll"><table class="hist"><thead><tr><th>${T("Oefening")}</th><th>${T("Eerste")}</th><th>${T("Beste")}</th><th>${T("Laatste")}</th><th>${T("Geschatte 1RM")}</th></tr></thead><tbody>${rows.map(r=>{
    const a=e1rm(r.eerste.kg,r.eerste.reps), b=e1rm(r.beste.kg,r.beste.reps), ch=a?Math.round((b/a-1)*100):0;
    const f=s=>`${kgFmt(s.kg)}×${s.reps}<small> ${T("wk {n}",{n:s.week})}</small>`;
    return `<tr><td>${EX[r.id].n}</td><td>${f(r.eerste)}</td><td>${f(r.beste)}</td><td>${f(r.laatste)}</td><td>${fmt(Math.round(b))} kg <span class="${ch>0?"up":""}">${ch>0?"+":""}${ch}%</span></td></tr>`}).join("")}</tbody></table></div>
    <p class="sub" style="font-size:13px;margin-top:8px">${T("Geschatte 1RM via de Epley-formule op de beste set per training.")}</p>`;
}

window.TR={EX,PROGRAMS,TIPS,MUSCLE_NL,registerProgram,PHASES,phaseOf,setsFor,weekOf,dayOf,e1rm,bestSet,lastPerformance,stats,progression,bodyMap,
  overviewHTML,workoutHTML,summaryHTML,coachGridHTML,progressionHTML};
})();
