// Unit tests for public/training.js — program integrity, phases, log analysis, rendering safety.
import { test } from "node:test";
import assert from "node:assert/strict";

import "./i18n-stub.mjs";
globalThis.window = {};
await import("../public/core.js");
await import("../public/training.js");
const TR = globalThis.window.TR, DC = globalThis.window.DC;
const P = TR.PROGRAMS.ppl12;

test("ppl12: 6 days, every exercise defined with muscles, cue and rest", () => {
  assert.equal(P.weken, 12);
  assert.deepEqual(P.dagen.map((d) => d.key), ["pushA", "pullA", "legsA", "pushB", "pullB", "legsB"]);
  for (const d of P.dagen) {
    assert.ok(d.ex.length >= 7 && d.ex.length <= 9, d.key);
    for (const x of d.ex) {
      const e = TR.EX[x.id];
      assert.ok(e, `unknown exercise ${x.id}`);
      assert.ok(e.m.length && e.cue.length > 20 && e.rust >= 45, x.id);
      assert.ok(x.reps.length >= 1 && x.reps.length <= 6 && x.reps.every((r) => r > 0), x.id);
    }
  }
  const used = new Set(P.dagen.flatMap((d) => d.ex.map((x) => x.id)));
  // every library exercise is used by the PPL program or can be picked by the tailored program, and has a cue
  const opMaat = new Set(["bb_bench_press", "push_ups", "dips", "db_shoulder_press", "standing_db_lateral", "pull_ups", "inverted_row", "db_row", "db_curl", "back_squat", "goblet_squat", "bw_squat", "deadlift", "db_rdl", "hip_thrust", "glute_bridge", "bw_lunges", "kb_swing", "calf_raise_bw", "plank", "cable_crunch", "hanging_leg_raise", "superman"]);
  assert.deepEqual([...Object.keys(TR.EX)].filter((k) => !used.has(k) && !opMaat.has(k)), [], "no unused exercises");
  for (const k of Object.keys(TR.EX)) assert.ok(TR.EX[k].cue && TR.EX[k].m.length && TR.EX[k].rust, k);
});

test("worker exercise library matches training.js", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const ids = JSON.parse(src.match(/const BASE_EX = new Set\((\[[^\]]*\])\)/)[1]);
  assert.deepEqual(ids.sort(), Object.keys(TR.EX).filter((k) => !TR.EX[k].custom).sort());
});

test("custom programs: registry, phases, deload, week clamp", () => {
  TR.registerProgram({ id: "c77", naam: "Test", weken: 4, deload: true, oefeningen: { c_abcd1234: { n: "Eigen", eq: "Band", m: ["abs"], s: [], rust: 60, cue: "x" } },
    dagen: [{ key: "d1", naam: "A", type: "full", ex: [{ id: "c_abcd1234", reps: [10, 10, 10, 10, 10] }] }] });
  assert.equal(TR.PROGRAMS.c77.sub, "4 weken, 1 training per week");
  assert.equal(TR.phaseOf(2, "c77").naam, "Progressie");
  assert.equal(TR.phaseOf(4, "c77").naam, "Deload");
  assert.equal(TR.setsFor([10, 10, 10, 10, 10], 4, "c77").length, 3);
  assert.equal(TR.setsFor([10, 10, 10, 10, 10], 12, "ppl12").length, 3);
  const ago = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  assert.equal(TR.weekOf(ago(200), "c77"), 4);
  assert.match(TR.overviewHTML({ id: "c77", start: ago(0) }, [], 1), /Overige 6 dagen/);
});

test("phases and deload", () => {
  assert.equal(TR.phaseOf(1).naam, "Fundament");
  assert.equal(TR.phaseOf(6).naam, "Opbouw");
  assert.equal(TR.phaseOf(11).naam, "Intensiteit");
  assert.equal(TR.phaseOf(12).naam, "Deload");
  assert.deepEqual(TR.setsFor([10, 8, 8, 6], 5), [10, 8, 8, 6]);
  assert.deepEqual(TR.setsFor([10, 8, 8, 6], 12), [10, 8, 8]);
  assert.deepEqual(TR.setsFor([20], 12), [20]);
});

test("weekOf clamps to 1–12", () => {
  const ago = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return new Date(t - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  assert.equal(TR.weekOf(ago(0)), 1);
  assert.equal(TR.weekOf(ago(7)), 2);
  assert.equal(TR.weekOf(ago(-10)), 1, "future start");
  assert.equal(TR.weekOf(ago(400)), 12);
});

test("last performance, suggestion inputs and records", () => {
  const w1 = { week: 1, dag: "pushA", datum: "2026-09-01", sets: { incline_db_press: [{ kg: 30, reps: 10, ok: true }, { kg: 32.5, reps: 8, ok: true }] } };
  const w2 = { week: 2, dag: "pushA", datum: "2026-09-08", sets: { incline_db_press: [{ kg: 32.5, reps: 10, ok: true }, { kg: 50, reps: 3, ok: false }] } };
  const cur = { week: 3, dag: "pushA", sets: {} };
  const prev = TR.lastPerformance([w1, w2], "incline_db_press", cur);
  assert.equal(prev.w.week, 2);
  assert.deepEqual(prev.sets.map((s) => s.kg), [32.5], "unticked sets are ignored");
  assert.equal(TR.bestSet(w1.sets.incline_db_press).kg, 32.5);
  assert.ok(TR.e1rm(100, 10) > 130 && TR.e1rm(100, 10) < 135);
  const rows = TR.progression("ppl12", [w1, w2]);
  assert.equal(rows[0].eerste.week, 1); assert.equal(rows[0].laatste.week, 2);
  const sum = TR.summaryHTML({ id: "ppl12" }, [w1], { week: 2, dag: "pushA", sets: w2.sets });
  assert.match(sum, /Records<\/small><b>1/);
});

test("rendering escapes notes and shows deload set counts", () => {
  const Pa = { id: "ppl12", start: "2026-09-01" };
  const wo = { week: 12, dag: "pushA", datum: "2026-11-20", sets: {}, notitie: "<img src=x onerror=1>", afgerond: 1 };
  const html = TR.workoutHTML(Pa, [wo], wo, { readonly: true });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("Deload"));
  const ov = TR.overviewHTML(Pa, [], 1);
  assert.ok(ov.includes("Push A") && ov.includes("Rustdag"));
  assert.match(TR.bodyMap(TR.EX.incline_db_press), /bm-p/);
});

test("automatic adjustment: lighter week after a hard check-in, target weights", () => {
  const today = "2026-10-20";
  assert.equal(TR.bijsturing([], today), null);
  const sore = [{ datum: "2026-10-18", energie: 3, honger: 4, slaap: 5, stress: 4, naleving: 1, opmerking: "Very sore after 3 consecutive training days" }];
  const b = TR.bijsturing(sore, today);
  assert.equal(b.reden, "spierpijn of pijn"); assert.equal(b.dagenOver, 5);
  assert.equal(TR.bijsturing(sore, "2026-10-25"), null, "ends after 7 days");
  assert.equal(TR.bijsturing([{ datum: today, energie: 2, slaap: 2, stress: 2, opmerking: "" }], today).reden, "weinig energie en slechte slaap");
  assert.equal(TR.bijsturing([{ datum: today, energie: 4, slaap: 4, stress: 2, opmerking: "great week" }], today), null);
  // fewer sets only in the current week of the program
  const start = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), P = { id: "ppl12", start };
  const reps = [10, 8, 8, 6], week = TR.weekOf(start, "ppl12");
  TR.setBijsturing({ licht: true, reden: "spierpijn of pijn", datum: start, dagenOver: 5 }, P);
  assert.deepEqual(TR.setsFor(reps, week, "ppl12"), [10, 8, 8]);
  assert.deepEqual(TR.setsFor(reps, week + 1, "ppl12"), reps);
  TR.setBijsturing(null, P);
  assert.deepEqual(TR.setsFor(reps, week, "ppl12"), reps);
  // target weights: one step up when all reps were done, ~10% lighter in a lighter week, none for bodyweight
  const db = { eq: "Dumbbell" }, bb = { eq: "Barbell" }, bw = { eq: "Lichaamsgewicht" };
  assert.equal(TR.doelKg(20, db, true, false), 22); assert.equal(TR.doelKg(60, bb, true, false), 62.5);
  assert.equal(TR.doelKg(60, bb, false, false), 60); assert.equal(TR.doelKg(60, bb, true, true), 55);
  assert.equal(TR.doelKg(null, bb, true, false), null); assert.equal(TR.doelKg(10, bw, true, false), 10);
});

test("tailored program from the intake: split, equipment, session length, favourite exercises", () => {
  const thuis = TR.opMaat({ ervaring: "gevorderd", locatie: "thuis_db", duur: "45", oefeningen: ["goblet_squat", "push_ups", "back_squat"] }, { trainingsdagen: [1, 3, 5] }, "Rifaro Test");
  assert.equal(thuis.naam, "Op maat: Rifaro");
  assert.deepEqual(thuis.data.dagen.map((d) => d.type), ["push", "pull", "legs"]);
  const ids = thuis.data.dagen.flatMap((d) => d.ex.map((x) => x.id));
  assert.ok(ids.every((id) => ["Dumbbell", "Kettlebell", "Lichaamsgewicht", "Band"].includes(TR.EX[id].eq)), "only home equipment: " + ids.join(","));
  assert.ok(thuis.data.dagen.every((d) => d.ex.length <= 5), "45 minutes → at most 5 exercises");
  assert.ok(ids.includes("goblet_squat") && ids.includes("push_ups") && !ids.includes("back_squat"), "favourites that fit are used");
  for (const d of thuis.data.dagen) assert.equal(new Set(d.ex.map((x) => x.id)).size, d.ex.length, "no duplicates in a day");
  // beginner, 4 days at the gym → upper/lower, 3 sets, 8 weeks with a deload; A and B days differ
  const gym = TR.opMaat({ ervaring: "beginner", locatie: "sportschool", duur: "60" }, { trainingsdagen: [1, 2, 4, 5] }, "X");
  assert.deepEqual(gym.data.dagen.map((d) => d.naam), ["Upper A", "Lower A", "Upper B", "Lower B"]);
  assert.equal(gym.data.weken, 8); assert.equal(gym.data.deload, true);
  assert.ok(gym.data.dagen.every((d) => d.ex.every((x) => x.reps.length <= 3)));
  assert.notDeepEqual(gym.data.dagen[0].ex.map((x) => x.id), gym.data.dagen[2].ex.map((x) => x.id));
  // no equipment, no profile → 3 full-body days with bodyweight only; plank in seconds
  const bw = TR.opMaat({ locatie: "thuis_geen", duur: "30" }, null, "Y");
  assert.equal(bw.data.dagen.length, 3);
  assert.ok(bw.data.dagen.flatMap((d) => d.ex).every((x) => TR.EX[x.id].eq === "Lichaamsgewicht"));
  assert.ok(bw.data.dagen.every((d) => d.ex.length <= 4));
  // six days → push/pull/legs twice; experienced lifters get 4 sets on compounds
  const zes = TR.opMaat({ ervaring: "ervaren" }, { trainingsdagen: [0, 1, 2, 3, 4, 5, 6] }, "Z");
  assert.equal(zes.data.dagen.length, 6); assert.equal(zes.data.dagen[0].ex[0].reps.length, 4);
  // intake chips cover every library exercise exactly once
  const chips = TR.oefenGroepen().flatMap(([, ids]) => ids);
  assert.equal(new Set(chips).size, Object.keys(TR.EX).filter((k) => !TR.EX[k].custom).length);
});

test("weight unit: kg or lb on screen, always kg in storage, progression steps per unit", () => {
  const db = TR.EX.incline_db_press, bar = TR.EX.incline_bb_press;
  TR.setEenheid("kg");
  assert.equal(TR.doelKg(20, db, true, false), 22); assert.equal(TR.doelKg(60, bar, true, false), 62.5);
  assert.equal(TR.naarKg(80), 80); assert.equal(TR.toon(45.36), 45.36);
  TR.setEenheid("lb");
  assert.equal(TR.getEenheid(), "lb");
  assert.equal(TR.naarKg(100), 45.36, "typed 100 lb → stored kg");
  assert.equal(TR.toon(45.36), 100, "and back without drift");
  assert.equal(TR.toon(20), 44, "20 kg ≈ 44 lb (steps of 0.5 lb)");
  assert.equal(TR.toon(TR.doelKg(TR.naarKg(100), bar, true, false)), 105, "+5 lb when every rep was done");
  assert.equal(TR.toon(TR.doelKg(TR.naarKg(100), bar, false, true)), 90, "lighter week: −10% rounded to 5 lb");
  assert.equal(TR.doelKg(30, TR.EX.push_ups, true, false), 30, "bodyweight: no step");
  const html = TR.workoutHTML({ id: "ppl12", start: "2026-01-05" }, [], { week: 1, dag: "pushA", sets: { incline_db_press: [{ kg: 45.36, reps: 8, ok: true }] } });
  assert.match(html, /<th>lb<\/th>/); assert.match(html, /value="100"/); assert.match(html, /data-tr-unit="lb" aria-pressed="true"/);
  TR.setEenheid("kg");
  assert.match(TR.workoutHTML({ id: "ppl12", start: "2026-01-05" }, [], { week: 1, dag: "pushA", sets: {} }), /<th>kg<\/th>/);
});
