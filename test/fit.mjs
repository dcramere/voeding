// quick fit report across profiles/seeds (dev tool, not a test)
globalThis.window = {};
await import("../public/core.js");
const DC = window.DC;
const sum = (M) => { const S = { k: 0, p: 0, c: 0, f: 0 }; M.forEach((ml) => ml.items.forEach((i) => { const f = DC.FOODS[i.key]; for (const z in S) S[z] += f[z] * i.g / 100; })); return S; };
const cases = [
  ["v 70,9 4m afvallen", { geslacht: "v", geboorte: "1992-03-10", lengte: 168, maaltijden: 4, activiteit: 1.55, doel: -0.1, geenRood: true }, 70.9],
  ["m 82,5 4m afvallen", { geslacht: "m", geboorte: "1990-05-01", lengte: 180, maaltijden: 4, activiteit: 1.55, doel: -0.1, geenRood: true }, 82.5],
  ["m 95 5m bulk", { geslacht: "m", geboorte: "1985-01-01", lengte: 188, maaltijden: 5, activiteit: 1.7, doel: 0.1 }, 95],
  ["v 60 3m vega cut", { geslacht: "v", geboorte: "1998-01-01", lengte: 162, maaltijden: 3, activiteit: 1.45, doel: -0.2, vega: true }, 60],
  ["m 110 3m cut", { geslacht: "m", geboorte: "1978-01-01", lengte: 178, maaltijden: 3, activiteit: 1.35, doel: -0.2 }, 110],
  ["v 55 5m behoud zuivelvrij", { geslacht: "v", geboorte: "2000-01-01", lengte: 160, maaltijden: 5, activiteit: 1.7, doel: 0, geenZuivel: true }, 55],
];
const worst = { k: 0, p: 0, f: 0, c: 0 };
for (const [n, b, w] of cases) for (const td of [[], [1, 3, 5]]) {
  const P = { ...b, excl: [], trainingsdagen: td, trainingsmoment: "middag" };
  const W = DC.analyse(P, { datum: "2026-09-28", gewicht: w }), D = DC.dagTargets(P, W);
  for (const dag of D ? ["train", "rust"] : [null]) {
    const T = D ? { ...W, ...D[dag] } : { ...W }; const e = { k: [], p: [], f: [], c: [] };
    for (let seed = 0; seed < 10; seed++) { const A = { ...T }; const S = sum(DC.menuFor(P, { seed }, A, dag)); e.k.push(S.k / T.kcal - 1); e.p.push(S.p / T.prot - 1); e.f.push(S.f / T.fat - 1); e.c.push(S.c / A.carb - 1); }
    const r = (a) => { const avg = a.reduce((x, y) => x + y) / a.length; const mx = a.reduce((x, y) => Math.abs(y) > Math.abs(x) ? y : x); return [avg, mx]; };
    const line = Object.fromEntries(Object.entries(e).map(([k, a]) => [k, r(a)]));
    for (const k in worst) worst[k] = Math.max(worst[k], Math.abs(line[k][1]));
    console.log(n.padEnd(26), String(dag).padEnd(5), Object.entries(line).map(([k, [a, m]]) => `${k} ${(a * 100).toFixed(0).padStart(3)}% (max ${(m * 100).toFixed(0)}%)`).join("  "));
  }
}
console.log("WORST", Object.entries(worst).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join("  "));
