// Unit tests for public/core.js — calculations, meal generator, shopping list, rendering safety.
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = {};
await import("../public/core.js");
const DC = globalThis.window.DC;

const M = { datum: "2026-09-28", gewicht: 82.5 };
const BASE = { geslacht: "m", geboorte: "1990-05-01", lengte: 180, maaltijden: 4, activiteit: 1.55, doel: -0.1,
  geenRood: false, geenVis: false, vega: false, geenZuivel: false, excl: [], trainingsdagen: [], trainingsmoment: "middag" };
const PROFILES = [
  [{ ...BASE }, 82.5],
  [{ ...BASE, geslacht: "v", geboorte: "1992-03-10", lengte: 168, doel: -0.1 }, 70.9],
  [{ ...BASE, maaltijden: 5, activiteit: 1.7, doel: 0.1, lengte: 188, geboorte: "1985-01-01" }, 95],
  [{ ...BASE, geslacht: "v", maaltijden: 3, lengte: 162, activiteit: 1.45, doel: -0.2, vega: true, geboorte: "1998-01-01" }, 60],
  [{ ...BASE, maaltijden: 3, lengte: 178, activiteit: 1.35, doel: -0.2, geboorte: "1978-01-01" }, 110],
  [{ ...BASE, geslacht: "v", maaltijden: 5, lengte: 160, activiteit: 1.7, doel: 0, geenZuivel: true, geboorte: "2000-01-01" }, 55],
];
const totals = (menu) => {
  const S = { k: 0, p: 0, c: 0, f: 0 };
  menu.forEach((ml) => ml.items.forEach((i) => { const f = DC.FOODS[i.key]; for (const z in S) S[z] += f[z] * i.g / 100; }));
  return S;
};
function* days() {
  for (const [P0, w] of PROFILES) for (const td of [[], [1, 3, 5]]) {
    const P = { ...P0, trainingsdagen: td }, m = { datum: M.datum, gewicht: w };
    const W = DC.analyse(P, m), D = DC.dagTargets(P, W);
    for (const dag of D ? ["train", "rust"] : [null]) for (let seed = 0; seed < 8; seed++)
      yield { P, m, W, D, dag, seed, T: D ? { ...W, ...D[dag] } : { ...W } };
  }
}

test("analyse: BMI and Mifflin-St Jeor baseline", () => {
  const A = DC.analyse(BASE, M);
  assert.equal(A.bmi.toFixed(2), (82.5 / 1.8 ** 2).toFixed(2));
  assert.equal(A.methode, "schatting");
  assert.ok(A.kcal >= 1500, "never below the male floor");
});

test("analyse: skinfolds switch to Durnin & Womersley + Katch-McArdle", () => {
  const A = DC.analyse(BASE, { ...M, p1: 6, p2: 14, p3: 11, p4: 13 });
  assert.equal(A.methode, "huidplooimeting");
  assert.ok(A.vet > 0.05 && A.vet < 0.3);
});

test("analyse: underweight never gets a deficit", () => {
  const A = DC.analyse({ ...BASE, doel: -0.2 }, { ...M, gewicht: 55 });
  assert.ok(A.bmi < 18.5);
  assert.ok(A.notes.length > 0);
  assert.ok(A.kcal >= Math.round(A.tdee / 10) * 10 - 10);
});

test("dagTargets: weekly average equals the base target for 1–6 training days", () => {
  for (let n = 1; n <= 6; n++) {
    const P = { ...BASE, trainingsdagen: [1, 2, 3, 4, 5, 6].slice(0, n) };
    const A = DC.analyse(P, M), D = DC.dagTargets(P, A);
    const avg = (n * D.train.kcal + (7 - n) * D.rust.kcal) / 7;
    assert.ok(Math.abs(avg - A.kcal) <= 10, `n=${n}: avg ${avg} vs ${A.kcal}`);
    assert.ok(D.train.kcal > D.rust.kcal);
    assert.equal(D.train.prot, D.rust.prot);
  }
  assert.equal(DC.dagTargets({ ...BASE, trainingsdagen: [] }, DC.analyse(BASE, M)), null);
});

test("generator: calories within 6% for every menu, 2.5% on average", () => {
  let sum = 0, n = 0;
  for (const d of days()) {
    const S = totals(DC.menuFor(d.P, { seed: d.seed }, { ...d.T }, d.dag));
    const err = Math.abs(S.k / d.T.kcal - 1);
    assert.ok(err < 0.06, `kcal off by ${(err * 100).toFixed(1)}% (seed ${d.seed}, ${d.dag})`);
    sum += err; n++;
  }
  assert.ok(sum / n < 0.025, `average kcal error ${(sum / n * 100).toFixed(2)}%`);
});

test("generator: protein never more than 15% short, fat within 12%", () => {
  for (const d of days()) {
    const S = totals(DC.menuFor(d.P, { seed: d.seed }, { ...d.T }, d.dag));
    assert.ok(S.p >= d.T.prot * 0.85, `protein ${S.p.toFixed(0)} < 85% of ${d.T.prot}`);
    assert.ok(Math.abs(S.f / d.T.fat - 1) < 0.12, `fat ${S.f.toFixed(0)} vs ${d.T.fat}`);
  }
});

test("generator: dietary restrictions and exclusions are respected", () => {
  const cases = [
    [{ vega: true }, (k) => !(DC.FOODS[k].tag || []).some((t) => t === "vlees" || t === "vis")],
    [{ geenVis: true }, (k) => !(DC.FOODS[k].tag || []).includes("vis")],
    [{ geenRood: true }, (k) => !(DC.FOODS[k].tag || []).includes("rood")],
    [{ geenZuivel: true }, (k) => !(DC.FOODS[k].tag || []).includes("zuivel")],
    [{ excl: ["kip", "rijst", "banaan"] }, (k) => !["kip", "rijst", "banaan"].includes(k)],
  ];
  for (const [extra, ok] of cases) for (let seed = 0; seed < 12; seed++) for (const td of [[], [1, 3, 5]]) {
    const P = { ...BASE, ...extra, trainingsdagen: td }, W = DC.analyse(P, M), D = DC.dagTargets(P, W);
    for (const dag of D ? ["train", "rust"] : [null]) {
      const menu = DC.menuFor(P, { seed }, D ? { ...W, ...D[dag] } : { ...W }, dag);
      menu.forEach((ml) => ml.items.forEach((i) => assert.ok(ok(i.key), `${JSON.stringify(extra)} got ${i.key}`)));
    }
  }
});

test("generator: realistic portions (main meal ≥100 g protein food, whole units)", () => {
  for (const d of days()) for (const ml of DC.menuFor(d.P, { seed: d.seed }, { ...d.T }, d.dag)) {
    for (const i of ml.items) {
      const u = DC.FOODS[i.key].unit;
      if (u) assert.ok(Number.isInteger(i.g / u[2] * 2), `${i.key} ${i.g} g is not a (half) unit`);
      else assert.equal(i.g % 5, 0, `${i.key} ${i.g} g not rounded to 5 g`);
    }
    if (ml.type === "hoofd") {
      const main = ml.items.find((i) => ["eiwit"].includes(DC.FOODS[i.key].cat));
      assert.ok(main && main.g >= 100, `${ml.name}: main protein ${main && main.g} g`);
    }
    assert.ok(ml.titel.length > 3);
  }
});

test("generator: training day adds a 'Rond de training' meal at the chosen moment", () => {
  for (const [moment, after] of [["ochtend", "Ontbijt"], ["middag", "Lunch"]]) {
    const P = { ...BASE, trainingsdagen: [1, 3, 5], trainingsmoment: moment };
    const W = DC.analyse(P, M), D = DC.dagTargets(P, W);
    const names = DC.menuFor(P, { seed: 0 }, { ...W, ...D.train }, "train").map((m) => m.name);
    assert.equal(names[names.indexOf("Rond de training") - 1], after);
    assert.ok(!DC.menuFor(P, { seed: 0 }, { ...W, ...D.rust }, "rust").some((m) => m.name === "Rond de training"));
  }
});

test("generator: deterministic for the same seed, swap offsets change one meal", () => {
  const W = DC.analyse(BASE, M);
  const a = JSON.stringify(DC.menuFor(BASE, { seed: 3 }, { ...W }, null));
  assert.equal(a, JSON.stringify(DC.menuFor(BASE, { seed: 3 }, { ...W }, null)));
  const b = DC.menuFor(BASE, { seed: 3, off: [0, 1] }, { ...W }, null);
  const a2 = JSON.parse(a);
  assert.deepEqual(b[0].items.map((i) => i.key), a2[0].items.map((i) => i.key));
  assert.notDeepEqual(b[1].items.map((i) => i.key), a2[1].items.map((i) => i.key));
});

test("shopping list covers 7 days of the menu", () => {
  const P = { ...BASE, trainingsdagen: [1, 3, 5] };
  const W = DC.analyse(P, M), D = DC.dagTargets(P, W);
  const list = DC.shoppingList(P, M, { seed: 0 });
  const names = list.flatMap((g) => g.items.map((i) => i.naam));
  const expected = new Set();
  for (const dag of ["train", "rust"]) DC.menuFor(P, { seed: 0 }, { ...W, ...D[dag] }, dag)
    .forEach((ml) => ml.items.forEach((i) => expected.add(DC.FOODS[i.key].shop || DC.FOODS[i.key].n)));
  assert.deepEqual(new Set(names), expected);
  const groente = list.flatMap((g) => g.items).find((i) => i.naam.startsWith("Groente"));
  assert.ok(groente && /kg$/.test(groente.hoeveel));
});

test("print document escapes the client name and contains both day types", () => {
  const P = { ...BASE, trainingsdagen: [1, 3, 5] };
  const html = DC.printHTML(P, M, { seed: 0 }, { naam: '<script>alert(1)</script>Anna', coach: "Dino" });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Trainingsdag") && html.includes("Rustdag") && html.includes("Boodschappenlijst"));
});

test("dates never shift a day in UTC-negative timezones", () => {
  assert.match(DC.dateNL("2026-09-28"), /28 september 2026/);
});
