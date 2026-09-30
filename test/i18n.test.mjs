// Translations: every Dutch source string used in the app, the Worker and the static pages has an
// English, Portuguese and Spanish translation with the same {placeholders} and markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allKeys, dict, LANGS, norm } from "../scripts/i18n-keys.mjs";

const keys = await allKeys();
const tags = (s) => (s.match(/<\/?[a-z]+/g) || []).sort();
const vars = (s) => (s.match(/\{\w+\}/g) || []).sort();

test("source strings are collected from scripts, Worker, data and pages", () => {
  assert.ok(keys.length > 1000, `only ${keys.length} keys found`);
  for (const k of ["Opslaan", "Kipfilet", "Tijd voor uw wekelijkse check-in", "{f} is te lang.", "Vind uw coach"]) assert.ok(keys.includes(k), k);
});

for (const l of LANGS) {
  test(`${l}: complete, with matching placeholders and markup`, () => {
    const d = Object.fromEntries(Object.entries(dict(l)).map(([k, v]) => [norm(k), v]));
    const missing = keys.filter((k) => !d[k] || !String(d[k]).trim());
    assert.deepEqual(missing, [], `${missing.length} untranslated`);
    for (const [k, v] of Object.entries(d)) {
      assert.deepEqual(vars(v), vars(k), `placeholders differ in "${k}"`);
      assert.deepEqual(tags(v), tags(k), `markup differs in "${k}"`);
    }
  });
}
