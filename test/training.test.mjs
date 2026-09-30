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
  assert.deepEqual([...Object.keys(TR.EX)].filter((k) => !used.has(k)), [], "no unused exercises");
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
