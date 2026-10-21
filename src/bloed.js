// Blood test knowledge: common markers (names in nl/en/pt/es as they appear on lab reports), what a low or high
// value commonly relates to in a nutrition/training context, and values that need a doctor straight away.
// Values are judged against the lab's own reference range (units differ per lab); these notes only explain.
// N_ marks Dutch source text for the translation dictionaries (scripts/i18n-keys.mjs).
const N_ = (s) => s;
const ARTS = N_("Bespreek deze waarde met uw arts.");

export const MARKERS = [
  { code: "hb", naam: N_("Hemoglobine"), alias: /h(a)?emoglobin|\bhb\b|\bhgb\b|hemoglobina/i,
    laag: N_("Een laag hemoglobine kan wijzen op bloedarmoede. Voeding met ijzer, vitamine B12 en foliumzuur helpt; laat de oorzaak door uw arts uitzoeken."),
    hoog: N_("Een verhoogd hemoglobine kan door uitdroging of roken komen. Drink voldoende en bespreek het met uw arts.") },
  { code: "ferritine", naam: N_("Ferritine"), alias: /ferritin/i,
    laag: N_("Een lage ferritine betekent een kleine ijzervoorraad. Eet ijzerrijk (rood vlees, peulvruchten, groene bladgroente) met vitamine C erbij en bespreek suppletie met uw arts."),
    hoog: N_("Een verhoogde ferritine kan bij een ontsteking of ijzerstapeling horen. Gebruik geen ijzersupplement voordat u dit met uw arts heeft besproken.") },
  { code: "ijzer", naam: N_("IJzer"), alias: /^(serum[ -])?(ijzer|iron|ferro|hierro)\b(?!.*(bind|satur|verzad|capac))/i,
    laag: N_("Het ijzergehalte is laag. Eet ijzerrijke voeding met vitamine C erbij en bespreek het met uw arts."), hoog: ARTS },
  { code: "vitd", naam: N_("Vitamine D"), alias: /vitamin[ae]? ?d|25[- ]?\(?oh\)?|calcidiol/i,
    laag: N_("Vitamine D is laag. Veilig zonlicht, vette vis en eieren helpen; vaak wordt een supplement geadviseerd. Overleg met uw arts over de dosis."),
    hoog: N_("Vitamine D is hoog. Stop met niet-voorgeschreven supplementen en overleg met uw arts.") },
  { code: "b12", naam: N_("Vitamine B12"), alias: /b[- ]?12|cobalamin/i,
    laag: N_("Vitamine B12 is laag. Vlees, vis, eieren en zuivel bevatten B12; bij een vegetarisch of veganistisch eetpatroon is een supplement vaak nodig."),
    hoog: N_("Vitamine B12 is hoog, meestal door supplementen. Bespreek het met uw arts als u geen supplementen gebruikt.") },
  { code: "folaat", naam: N_("Foliumzuur"), alias: /folium|fola(a)?t|folate|folic|f[oó]lico/i,
    laag: N_("Foliumzuur is laag. Groene groenten, peulvruchten en volkorenproducten helpen."), hoog: ARTS },
  { code: "glucose", naam: N_("Glucose"), alias: /glucos|glicos|glicemia|bloedsuiker|blood sugar/i,
    laag: N_("De bloedsuiker is laag. Eet regelmatig en bespreek klachten zoals duizeligheid met uw arts."),
    hoog: N_("De bloedsuiker is verhoogd. Minder snelle suikers, meer vezels, beweging en afvallen helpen; laat dit door uw arts controleren.") },
  { code: "hba1c", naam: N_("HbA1c"), alias: /hba1c|\ba1c\b|gegl[iy]ceerd|glycated|glicada|glicosilada/i,
    laag: ARTS, hoog: N_("HbA1c is verhoogd: de gemiddelde bloedsuiker van de afgelopen maanden is te hoog. Afvallen, vezelrijk eten en minder suiker helpen; bespreek dit met uw arts.") },
  { code: "chol", naam: N_("Totaal cholesterol"), alias: /^(totaal |total |colesterol total|cholesterol totaal|t-?chol)|^c?holesterol(\s|$)|^colesterol(\s|$)/i,
    laag: ARTS, hoog: N_("Het cholesterol is verhoogd. Meer vezels (havermout, peulvruchten), minder verzadigd vet (vet vlees, roomboter) en meer beweging helpen.") },
  { code: "ldl", naam: N_("LDL-cholesterol"), alias: /\bldl\b/i,
    laag: ARTS, hoog: N_("LDL, het 'slechte' cholesterol, is verhoogd. Vervang verzadigd vet door onverzadigd vet (olijfolie, noten, vis) en eet meer vezels.") },
  { code: "hdl", naam: N_("HDL-cholesterol"), alias: /\bhdl\b/i,
    laag: N_("HDL, het 'goede' cholesterol, is laag. Beweging, afvallen, niet roken en gezonde vetten verhogen het."), hoog: ARTS },
  { code: "trig", naam: N_("Triglyceriden"), alias: /triglyc|triglic|trigli/i,
    laag: ARTS, hoog: N_("De triglyceriden zijn verhoogd. Minder suiker, witmeel en alcohol en meer beweging verlagen ze.") },
  { code: "tsh", naam: N_("TSH (schildklier)"), alias: /\btsh\b|thyroid stimulating|tireotrop/i,
    laag: N_("TSH wijkt af. De schildklier regelt uw stofwisseling en kan uw energie en gewicht beïnvloeden; bespreek dit met uw arts."),
    hoog: N_("TSH wijkt af. De schildklier regelt uw stofwisseling en kan uw energie en gewicht beïnvloeden; bespreek dit met uw arts.") },
  { code: "alat", naam: N_("ALAT (lever)"), alias: /\balat\b|\balt\b|sgpt|\btgp\b|alanin/i,
    laag: ARTS, hoog: N_("ALAT, een leverwaarde, is verhoogd. Dit kan komen door leververvetting bij overgewicht, alcohol, medicijnen of zware training kort voor de test; bespreek het met uw arts.") },
  { code: "asat", naam: N_("ASAT (lever/spier)"), alias: /\basat\b|\bast\b|sgot|\btgo\b|aspart/i,
    laag: ARTS, hoog: N_("ASAT is verhoogd. Dit komt voor na zware training, maar ook bij lever- of spierproblemen; bespreek het met uw arts.") },
  { code: "ggt", naam: N_("Gamma-GT (lever)"), alias: /gamma|\bggt\b|γ-?gt/i,
    laag: ARTS, hoog: N_("Gamma-GT is verhoogd; dit hangt vaak samen met alcohol of leververvetting. Bespreek het met uw arts.") },
  { code: "kreat", naam: N_("Kreatinine (nier)"), alias: /kreatinin|creatinin/i,
    laag: ARTS, hoog: N_("Kreatinine is verhoogd. Dit kan door veel spiermassa, veel eiwit of te weinig drinken komen, maar ook door een verminderde nierfunctie; bespreek het met uw arts.") },
  { code: "egfr", naam: N_("eGFR (nierfunctie)"), alias: /\be?gfr\b|filtra/i,
    laag: N_("De nierfunctie (eGFR) is verlaagd. Bespreek dit met uw arts voordat u meer eiwit gaat eten."), hoog: ARTS },
  { code: "crp", naam: N_("CRP (ontsteking)"), alias: /\bcrp\b|c-?reacti|prote[ií]na c/i,
    laag: ARTS, hoog: N_("CRP, een ontstekingswaarde, is verhoogd. Dit kan door een infectie, een blessure of zware training komen; bespreek het met uw arts als het niet daalt.") },
  { code: "testo", naam: N_("Testosteron"), alias: /testoster/i,
    laag: N_("Testosteron is laag. Genoeg slaap, krachttraining, gezonde vetten en een niet te groot calorietekort helpen; bespreek het met uw arts."), hoog: ARTS },
  { code: "kalium", naam: N_("Kalium"), alias: /kalium|potass|potasio|pot[aá]ssio|^k\+?$/i,
    laag: N_("Kalium wijkt af. Kalium is belangrijk voor hart en spieren; neem contact op met uw arts."),
    hoog: N_("Kalium wijkt af. Kalium is belangrijk voor hart en spieren; neem contact op met uw arts.") },
  { code: "natrium", naam: N_("Natrium"), alias: /natrium|sodium|sodio|s[oó]dio|^na\+?$/i, laag: ARTS, hoog: ARTS },
  { code: "leuko", naam: N_("Leukocyten"), alias: /leuko|leuco|\bwbc\b|white blood|witte bloed/i,
    laag: N_("Het aantal witte bloedcellen wijkt af. Dit kan bij een infectie horen; bespreek het met uw arts."),
    hoog: N_("Het aantal witte bloedcellen wijkt af. Dit kan bij een infectie horen; bespreek het met uw arts.") },
  { code: "trombo", naam: N_("Trombocyten"), alias: /trombo|thrombo|platelet|plaquet|\bplt\b/i, laag: ARTS, hoog: ARTS },
  { code: "urinezuur", naam: N_("Urinezuur"), alias: /urinezuur|uric acid|[aá]cido [uú]rico/i,
    laag: ARTS, hoog: N_("Urinezuur is verhoogd. Minder alcohol, suikerhoudende dranken en orgaanvlees helpen; drink genoeg water.") },
];
export const ALGEMEEN = N_("Deze waarde valt buiten het referentiebereik van het laboratorium. Bespreek het met uw arts.");
export const matchMarker = (naam) => MARKERS.find((m) => m.alias.test(String(naam || "").trim())) || null;

// lab reference: numbers, or text like "4.0 - 5.5", "< 5.0", "> 60"
export function parseRef(w) {
  let min = Number.isFinite(+w.ref_min) && w.ref_min !== null && w.ref_min !== "" ? +w.ref_min : null;
  let max = Number.isFinite(+w.ref_max) && w.ref_max !== null && w.ref_max !== "" ? +w.ref_max : null;
  const t = String(w.ref_tekst || "").replace(",", ".");
  if (min == null && max == null && t) {
    const r = t.match(/(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)/);
    if (r) { min = +r[1]; max = +r[2]; }
    else if (/^\s*(<|≤|tot|up to|hasta|até)/i.test(t)) max = parseFloat(t.replace(/[^\d.]/g, ""));
    else if (/^\s*(>|≥|vanaf|from|desde|acima)/i.test(t)) min = parseFloat(t.replace(/[^\d.]/g, ""));
  }
  return { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
}
// low / high / normal / unknown — against the lab's range, otherwise the lab's own H/L flag
export function beoordeel(w) {
  const v = +w.waarde, { min, max } = parseRef(w);
  if (Number.isFinite(v) && (min != null || max != null)) return min != null && v < min ? "laag" : max != null && v > max ? "hoog" : "normaal";
  const f = String(w.vlag || "").trim().toUpperCase();
  return /^(H|HIGH|HOOG|ALTO|↑|\+)/.test(f) ? "hoog" : /^(L|LOW|LAAG|BAJO|BAIXO|↓|-)/.test(f) ? "laag" : "onbekend";
}
// values that need a doctor straight away (only when the unit is recognised)
export function urgent(code, waarde, eenheid) {
  const v = +waarde, u = String(eenheid || "").toLowerCase().replace(/\s/g, "");
  if (!Number.isFinite(v)) return false;
  const mmol = /mmol\/l|meq\/l/.test(u), mg = /mg\/dl/.test(u);
  switch (code) {
    case "glucose": return (mmol && (v >= 15 || v <= 2.8)) || (mg && (v >= 270 || v <= 50));
    case "kalium": return (mmol || !u) && (v <= 2.8 || v >= 6.2);
    case "natrium": return (mmol || !u) && (v <= 125 || v >= 155);
    case "hb": return (/g\/dl/.test(u) && v <= 7) || (mmol && v <= 4.3) || (/g\/l/.test(u) && !/dl/.test(u) && v <= 70);
    case "hba1c": return (/%/.test(u) && v >= 10) || (/mmol\/mol/.test(u) && v >= 86);
    case "crp": return /mg\/l/.test(u) && v >= 100;
    default: return false;
  }
}

// Nutrition guidance per finding (marker code + direction), used for the recommendation plan: the AI tailors it to
// what the client eats; without AI these lines are the plan. eiwitStop: do not advise extra protein (kidney values).
const IJZER = { meer: [N_("Mager rood vlees of eend 2 tot 3 keer per week."), N_("Peulvruchten zoals kidneybonen en dhal, met fruit of groente rijk aan vitamine C (papaya, ananas, paprika) in dezelfde maaltijd.")],
  minder: [N_("Koffie en thee bij de maaltijd: drink ze liever een uur ervoor of erna.")] };
const CHOL = { meer: [N_("Havermout, peulvruchten en groente voor meer oplosbare vezels."), N_("Vette vis zoals zalm 2 keer per week, en noten of olijfolie als vetbron.")],
  minder: [N_("Verzadigd vet: vet vlees, roomboter, kokosolie, vleeswaren en gefrituurd eten.")] };
const SUIKER = { meer: [N_("Vezelrijke koolhydraten (peulvruchten, havermout, volkorenbrood) verdeeld over de dag, steeds met eiwit en groente.")],
  minder: [N_("Snelle suikers: frisdrank, vruchtensap, honing, snoep, zoet gebak en grote porties witte rijst.")] };
const LEVER = { meer: [N_("Groente, volkorenproducten en mager eiwit als basis van elke maaltijd.")], minder: [N_("Alcohol, suiker en frisdrank. Geleidelijk afvallen helpt de lever.")] };
const NIER = { eiwitStop: true, meer: [N_("Voldoende water, verdeeld over de dag.")], minder: [N_("Extra eiwit en eiwitshakes, tot u dit met uw arts heeft besproken.")] };
export const ADVIES = {
  "hb:laag": IJZER, "ferritine:laag": IJZER, "ijzer:laag": IJZER,
  "chol:hoog": CHOL, "ldl:hoog": CHOL,
  "hdl:laag": { meer: [N_("Gezonde vetten: vette vis, noten, avocado en olijfolie.")], minder: [N_("Suiker en witmeel. Meer beweging en niet roken verhogen het HDL ook.")] },
  "trig:hoog": { meer: [N_("Volkorenproducten, peulvruchten en groente, en 2 keer per week vette vis.")], minder: [N_("Suiker, honing, frisdrank, vruchtensap, witbrood en alcohol.")] },
  "glucose:hoog": SUIKER, "hba1c:hoog": SUIKER,
  "vitd:laag": { meer: [N_("Vette vis zoals zalm en eieren, en dagelijks 15 tot 20 minuten veilig zonlicht op armen en benen.")], minder: [] },
  "b12:laag": { meer: [N_("Dagelijks vlees, vis, eieren of zuivel zoals kwark en yoghurt.")], minder: [] },
  "folaat:laag": { meer: [N_("Dagelijks groene bladgroente, peulvruchten en volkorenproducten.")], minder: [] },
  "alat:hoog": LEVER, "asat:hoog": LEVER, "ggt:hoog": LEVER,
  "urinezuur:hoog": { meer: [N_("Ruim water (2 tot 3 liter per dag) en magere zuivel.")], minder: [N_("Alcohol (vooral bier), frisdrank, orgaanvlees en grote porties schaal- en schelpdieren.")] },
  "kreat:hoog": NIER, "egfr:laag": NIER,
  "crp:hoog": { meer: [N_("Vette vis, noten, olijfolie en elke dag groente en fruit.")], minder: [N_("Bewerkte en gefrituurde producten.")] },
  "testo:laag": { meer: [N_("Gezonde vetten, genoeg calorieën en 7 tot 9 uur slaap.")], minder: [N_("Een te groot calorietekort en alcohol.")] },
};

// Food swaps in a meal plan per finding, used when no AI is available: [from, to, only in this diary meal (optional)]
export const SWAPS = {
  "glucose:hoog": [["honing", "bessen"]], "hba1c:hoog": [["honing", "bessen"]], "trig:hoog": [["honing", "bessen"]],
  "chol:hoog": [["kokosolie", "olijfolie"], ["eend", "kip"]], "ldl:hoog": [["kokosolie", "olijfolie"], ["eend", "kip"]],
  "hb:laag": [["kip", "gehakt", "avond"]], "ferritine:laag": [["kip", "gehakt", "avond"]], "ijzer:laag": [["kip", "gehakt", "avond"]],
  "vitd:laag": [["kip", "zalm", "lunch"], ["witvis", "zalm"]], "crp:hoog": [["witvis", "zalm"]],
};
