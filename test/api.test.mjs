// Integration tests: boots the real Worker with `wrangler dev` on a throwaway local D1/KV and drives the API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, openSync } from "node:fs";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`, SETUP = "test-setup-code-123";
const STRIPE_PORT = 8798, WHSEC = "whsec_test_secret";

// ---- minimal Stripe API mock (only what the worker uses) ----
const sessions = new Map(); let seq = 0;
const stripeMock = createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
    const u = new URL(req.url, "http://x"), p = new URLSearchParams(body);
    const send = (code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== "Bearer sk_test_mock") return send(401, { error: { message: "bad key" } });
    if (req.method === "GET" && u.pathname.startsWith("/v1/prices/")) {
      const id = u.pathname.split("/").pop();
      return send(200, { id, unit_amount: id === "price_client" ? 7900 : 4900, currency: "usd", recurring: { interval: "month" } });
    }
    if (req.method === "POST" && u.pathname === "/v1/checkout/sessions") {
      const id = "cs_test_" + String(++seq).padStart(10, "0"), metadata = {};
      for (const [k, v] of p) { const m = k.match(/^metadata\[(.+)\]$/); if (m) metadata[m[1]] = v; }
      sessions.set(id, { id, object: "checkout.session", status: "open", mode: "subscription", metadata,
        customer_email: p.get("customer_email"), customer: p.get("customer"), price: p.get("line_items[0][price]"), success_url: p.get("success_url") });
      return send(200, { id, url: "https://checkout.stripe.test/" + id });
    }
    if (req.method === "GET" && u.pathname.startsWith("/v1/checkout/sessions/")) {
      const s = sessions.get(u.pathname.split("/").pop());
      if (!s) return send(404, { error: { message: "No such session" } });
      return send(200, { ...s, customer_details: { email: s.customer_email },
        subscription: s.status === "complete" ? { id: "sub_" + s.id, status: "active", current_period_end: 1790000000, customer: "cus_" + s.id } : null });
    }
    if (req.method === "POST" && u.pathname === "/v1/billing_portal/sessions") return send(200, { url: "https://billing.stripe.test/" + p.get("customer") });
    send(404, { error: { message: "not mocked: " + req.method + " " + u.pathname } });
  });
});
const pay = (url) => { const s = sessions.get(url.split("/").pop()); s.status = "complete"; return s.id; };
function signed(event) {
  const payload = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  return { payload, sig: `t=${t},v1=${createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex")}` };
}
const webhook = (event, sig) => { const s = signed(event); return fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": sig || s.sig, "content-type": "application/json" }, body: s.payload }); };
const subEvent = (id, type, subId, status) => ({ id, type, data: { object: { id: subId, object: "subscription", status, current_period_end: 1795000000, customer: "cus_x" } } });
const persist = mkdtempSync(join(tmpdir(), "voeding-test-"));
const wrangler = (args, opts = {}) => execFileSync("npx", ["wrangler", ...args], { stdio: "pipe", ...opts }).toString();
let dev;

before(async () => {
  await new Promise((r) => stripeMock.listen(STRIPE_PORT, "127.0.0.1", r));
  wrangler(["d1", "migrations", "apply", "dcramere-voeding", "--local", "--persist-to", persist, "--config", "wrangler.test.jsonc"]);
  dev = spawn("npx", ["wrangler", "dev", "--config", "wrangler.test.jsonc", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", persist,
    "--var", `SETUP_CODE:${SETUP}`, "--var", "STRIPE_SECRET_KEY:sk_test_mock", "--var", `STRIPE_API_BASE:http://127.0.0.1:${STRIPE_PORT}`,
    "--var", "STRIPE_PRICE_CLIENT:price_client", "--var", "STRIPE_PRICE_COACH:price_coach", "--var", `STRIPE_WEBHOOK_SECRET:${WHSEC}`,
    "--test-scheduled", "--show-interactive-dev-session=false"],
    // output goes to a file (TEST_SERVER_LOG=path) or is discarded: an unread pipe fills up and blocks wrangler
    { stdio: process.env.TEST_SERVER_LOG ? ["ignore", openSync(process.env.TEST_SERVER_LOG, "w"), openSync(process.env.TEST_SERVER_LOG, "a")] : "ignore", detached: true });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/api/coach/status`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error("wrangler dev did not start within 60 s");
});
// kill the whole process group (npx → wrangler → workerd), not just npx
function stop() { try { process.kill(-dev.pid, "SIGTERM"); } catch {} }
after(() => { stop(); stripeMock.close(); rmSync(persist, { recursive: true, force: true }); });

// minimal cookie-jar client (one per browser/user)
function client() {
  const jar = new Map();
  return async (path, method = "GET", body, headers = {}) => {
    const raw = body instanceof Uint8Array;
    const res = await fetch(BASE + path, {
      method, headers: { ...(body !== undefined && !raw ? { "content-type": "application/json" } : {}),
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(";"); const [k, v] = kv.split("="); v ? jar.set(k, v) : jar.delete(k); }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}
const coach = client(), anna = client(), bram = client(), anon = client();
const PROFIEL = { geslacht: "v", geboorte: "1992-03-10", lengte: 168, maaltijden: 4, activiteit: 1.55, doel: -0.1,
  geenRood: true, excl: ["zalm"], trainingsdagen: [1, 3, 5], trainingsmoment: "avond" };
const tokenOf = (link) => new URL(link).searchParams.get("invite");
let annaId, bramLink;

test("coach setup: wrong code rejected, first setup works, second blocked", async () => {
  assert.equal((await coach("/api/coach/status")).data.setupNodig, true);
  assert.equal((await coach("/api/coach/setup", "POST", { code: "nope", naam: "X", email: "x@t.nl", password: "0123456789" })).status, 403);
  const ok = await coach("/api/coach/setup", "POST", { code: SETUP, naam: "Coach", email: "coach@t.nl", password: "coach-pass-123" });
  assert.equal(ok.status, 200);
  assert.equal((await anon("/api/coach/setup", "POST", { code: SETUP, naam: "Evil", email: "e@t.nl", password: "0123456789" })).status, 403);
  assert.equal((await coach("/api/coach/me")).data.naam, "Coach");
});

test("coach creates clients; duplicate e-mail rejected", async () => {
  const a = await coach("/api/coach/clients", "POST", { naam: "Anna Test", email: "anna@t.nl" });
  assert.equal(a.status, 201); annaId = a.data.id;
  assert.equal((await coach("/api/coach/clients", "POST", { naam: "A2", email: "ANNA@t.nl" })).status, 409);
  bramLink = (await coach("/api/coach/clients", "POST", { naam: "Bram", email: "bram@t.nl" })).data.link;
  const inv = await anna(`/api/invite?token=${tokenOf(a.data.link)}`);
  assert.deepEqual(inv.data, { naam: "Anna Test", email: "anna@t.nl" });
  // activation requires privacy consent; the link then works exactly once
  assert.equal((await anna("/api/invite", "POST", { token: tokenOf(a.data.link), password: "anna-pass-1" })).status, 400);
  assert.equal((await anna("/api/invite", "POST", { token: tokenOf(a.data.link), password: "anna-pass-1", privacy: true })).status, 200);
  assert.equal((await anon(`/api/invite?token=${tokenOf(a.data.link)}`)).status, 404);
});

test("client onboarding: intake, profile, weight, check-in", async () => {
  const me = (await anna("/api/me")).data;
  assert.equal(me.intake, null); assert.equal(me.profiel, null); assert.deepEqual(me.checkins, []);
  assert.ok(me.privacyAkkoord > 0, "consent recorded at activation");
  assert.equal((await anna("/api/privacy", "POST", { akkoord: false })).status, 400);
  assert.equal((await anna("/api/privacy", "POST", { akkoord: true })).data.privacyAkkoord, me.privacyAkkoord, "first consent time is kept");
  assert.equal((await anna("/api/intake", "PUT", { doel: "" })).status, 400);
  const intake = await anna("/api/intake", "PUT", { doel: "5 kg vet kwijt", streefgewicht: 66, werk: "zittend", alcohol: "hacker", slaap: 7 });
  assert.equal(intake.status, 200);
  assert.equal(intake.data.alcohol, "", "unknown choice values are dropped");
  const prof = await anna("/api/profiel", "PUT", { naam: "Anna Test", profiel: { ...PROFIEL, excl: ["zalm", "<b>"], trainingsdagen: [1, 1, 3, 9] } });
  assert.equal(prof.status, 200);
  assert.deepEqual(prof.data.profiel.excl, ["zalm"]);
  assert.deepEqual(prof.data.profiel.trainingsdagen, [1, 3]);
  assert.equal((await anna("/api/metingen", "POST", { datum: "2026-09-01", gewicht: 72.4, p1: 5 })).status, 400, "partial skinfolds");
  assert.equal((await anna("/api/metingen", "POST", { datum: "2026-09-01", gewicht: 72.4 })).status, 200);
  const m2 = await anna("/api/metingen", "POST", { datum: "2026-09-28", gewicht: 70.9 });
  assert.equal(m2.data.metingen.length, 2);
  assert.equal((await anna("/api/checkins", "POST", { datum: "2026-09-28", energie: 6, honger: 3, slaap: 3, stress: 3, naleving: 3 })).status, 400);
  const k = { datum: "2026-09-28", energie: 2, honger: 4, slaap: 3, stress: 3, naleving: 5, training: 3, opmerking: "Zware week" };
  assert.equal((await anna("/api/checkins", "POST", k)).status, 200);
  const again = await anna("/api/checkins", "POST", { ...k, energie: 3 });
  assert.equal(again.data.checkins.length, 1, "same date upserts");
  assert.equal(again.data.checkins[0].energie, 3);
  assert.equal((await anna("/api/menu", "PUT", { seed: 2, off: [1], offT: [0, 2], evil: 1 })).data.evil, undefined);
});

test("coach sees intake, check-ins, privacy consent and list summary", async () => {
  const c = (await coach(`/api/coach/clients/${annaId}`)).data;
  assert.equal(c.intake.doel, "5 kg vet kwijt");
  assert.equal(c.checkins[0].opmerking, "Zware week");
  assert.ok(c.privacyAkkoord > 0);
  assert.equal(c.metingen.length, 2);
  const row = (await coach("/api/coach/clients")).data.find((x) => x.id === annaId);
  assert.equal(row.checkin.datum, "2026-09-28");
  assert.equal(row.laatste.gewicht, 70.9);
  assert.equal(row.eerste.gewicht, 72.4);
  assert.equal((await coach(`/api/coach/clients/${annaId}/metingen`, "POST", { datum: "2026-09-20", gewicht: 71.6, p1: 6, p2: 14, p3: 11, p4: 13 })).data.metingen.length, 3);
});

test("isolation: roles and clients cannot reach each other's data", async () => {
  assert.equal((await anna("/api/coach/clients")).status, 401, "client cookie is not a coach session");
  assert.equal((await coach("/api/me")).status, 401, "coach cookie is not a client session");
  await bram("/api/invite", "POST", { token: tokenOf(bramLink), password: "bram-pass-1", privacy: true });
  const annaMeting = (await anna("/api/me")).data.metingen[0].id;
  await bram(`/api/metingen/${annaMeting}`, "DELETE");
  assert.equal((await anna("/api/me")).data.metingen.length, 3, "bram cannot delete anna's measurement");
  assert.equal((await anon("/api/me")).status, 401);
});

test("progress photos: upload, validation, access control, replace, delete", async () => {
  const jpeg = (n = 2000, fill = 7) => { const b = new Uint8Array(n).fill(fill); b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
  const post = async (jar, path, body, type = "image/jpeg") => jar(path, "POST", body, { "content-type": type });
  const r1 = await post(anna, "/api/fotos?datum=2026-09-28&pose=voor", jpeg());
  assert.equal(r1.status, 201);
  assert.equal(r1.data.fotos.length, 1);
  const id1 = r1.data.fotos[0].id;
  assert.equal((await post(anna, "/api/fotos?datum=2026-09-28&pose=boven", jpeg())).status, 400, "unknown pose");
  assert.equal((await post(anna, "/api/fotos?datum=2026-09-28&pose=achter", new TextEncoder().encode("<svg onload=alert(1)>".padEnd(100)), "image/jpeg")).status, 415, "not an image");
  assert.equal((await post(anna, "/api/fotos?datum=2026-09-28&pose=achter", jpeg(5 * 1024 * 1024 + 10))).status, 413, "too large");
  // owner and coach can view; another client cannot; anonymous cannot
  const own = await anna(`/api/fotos/${id1}`);
  assert.equal(own.status, 200); assert.equal(own.headers.get("content-type"), "image/jpeg");
  assert.equal((await bram(`/api/fotos/${id1}`)).status, 404);
  assert.equal((await anon(`/api/fotos/${id1}`)).status, 401);
  assert.equal((await coach(`/api/coach/fotos/${id1}`)).status, 200);
  // coach uploads the side photo; replacing the front photo gives it a new id
  assert.equal((await post(coach, `/api/coach/clients/${annaId}/fotos?datum=2026-09-28&pose=zijkant`, jpeg())).status, 201);
  const r2 = await post(anna, "/api/fotos?datum=2026-09-28&pose=voor", jpeg(3000, 9));
  const voor = r2.data.fotos.filter((f) => f.pose === "voor");
  assert.equal(voor.length, 1); assert.notEqual(voor[0].id, id1);
  assert.equal((await coach(`/api/coach/fotos/${id1}`)).status, 404, "replaced photo is gone");
  assert.equal((await coach("/api/coach/clients")).data.find((c) => c.id === annaId).laatsteFoto, "2026-09-28");
  assert.equal((await coach(`/api/coach/clients/${annaId}`)).data.fotos.length, 2);
  // bram cannot delete anna's photo; anna can
  await bram(`/api/fotos/${voor[0].id}`, "DELETE");
  assert.equal((await anna("/api/me")).data.fotos.length, 2);
  assert.equal((await anna(`/api/fotos/${voor[0].id}`, "DELETE")).data.fotos.length, 1);
});

test("training: assignment, logging, validation, coach view", async () => {
  const wo = { programma: "ppl12", week: 1, dag: "pushA", datum: "2026-09-29", notitie: "Goed", afgerond: false,
    sets: { incline_db_press: [{ kg: 30, reps: 10, ok: true }, { kg: "32,5", reps: 8, ok: true }] } };
  assert.equal((await anna("/api/workouts", "PUT", wo)).status, 400, "no program assigned yet");
  assert.equal((await coach(`/api/coach/clients/${annaId}`, "PUT", { programma: { id: "nope", start: "2026-09-29" } })).status, 400);
  const asg = await coach(`/api/coach/clients/${annaId}`, "PUT", { programma: { id: "ppl12", start: "2026-09-29" } });
  assert.deepEqual(asg.data.programma, { id: "ppl12", start: "2026-09-29" });
  assert.deepEqual((await anna("/api/me")).data.programma, { id: "ppl12", start: "2026-09-29" });
  // "32,5" is not a number for the API (the app converts commas) → rejected
  assert.equal((await anna("/api/workouts", "PUT", wo)).status, 400);
  wo.sets.incline_db_press[1].kg = 32.5;
  const r = await anna("/api/workouts", "PUT", wo);
  assert.equal(r.status, 200);
  assert.equal(r.data.workouts.length, 1);
  assert.equal(r.data.workouts[0].afgerond, null);
  assert.equal((await anna("/api/workouts", "PUT", { ...wo, week: 13 })).status, 400);
  assert.equal((await anna("/api/workouts", "PUT", { ...wo, dag: "armDay" })).status, 400);
  assert.equal((await anna("/api/workouts", "PUT", { ...wo, programma: "other" })).status, 409);
  assert.equal((await anna("/api/workouts", "PUT", { ...wo, sets: { "bad key!": [] } })).status, 400);
  assert.equal((await anna("/api/workouts", "PUT", { ...wo, sets: { x: [{ kg: 5000, reps: 1, ok: true }] } })).status, 400);
  // finishing keeps the first finish time; editing afterwards keeps it finished
  const fin = await anna("/api/workouts", "PUT", { ...wo, afgerond: true });
  const t1 = fin.data.workouts[0].afgerond; assert.ok(t1 > 0);
  const again = await anna("/api/workouts", "PUT", { ...wo, notitie: "aangepast", afgerond: true });
  assert.equal(again.data.workouts[0].afgerond, t1);
  assert.equal(again.data.workouts.length, 1, "same week/day upserts");
  // coach sees it; list shows last finished training
  const c = (await coach(`/api/coach/clients/${annaId}`)).data;
  assert.equal(c.workouts[0].sets.incline_db_press[1].kg, 32.5);
  assert.equal((await coach("/api/coach/clients")).data.find((x) => x.id === annaId).laatsteTraining, "2026-09-29");
  // bram (no program) cannot write anything
  assert.equal((await bram("/api/workouts", "PUT", wo)).status, 400);
  // removing the program hides the logs; re-assigning brings them back
  await coach(`/api/coach/clients/${annaId}`, "PUT", { programma: null });
  assert.deepEqual((await anna("/api/me")).data.workouts, []);
  await coach(`/api/coach/clients/${annaId}`, "PUT", { programma: { id: "ppl12", start: "2026-09-29" } });
  assert.equal((await anna("/api/me")).data.workouts.length, 1);
});

test("own products: validation, CRUD, barcode, label scan without AI", async () => {
  const shake = { naam: "Proteïne shake", merk: "Test", barcode: "8712345678906", kcal: 380, eiwit: 75, koolh: 8, vet: 5, vezels: 1,
    portie_naam: "schep", portie_g: 30, in_menu: true, rol: "eiwit", maaltijden: ["snack", "ontbijt", "diner"] };
  assert.equal((await anna("/api/producten", "POST", { ...shake, naam: "" })).status, 400);
  assert.equal((await anna("/api/producten", "POST", { ...shake, eiwit: 90, koolh: 20 })).status, 400, "macros > 100 g per 100 g");
  assert.equal((await anna("/api/producten", "POST", { ...shake, barcode: "12ab" })).status, 400);
  assert.equal((await anna("/api/producten", "POST", { ...shake, rol: "snoep" })).status, 400);
  const r = await anna("/api/producten", "POST", shake);
  assert.equal(r.status, 201);
  const p = r.data.producten.find((x) => x.id === r.data.id);
  assert.deepEqual(p.maaltijden, ["snack", "ontbijt"], "unknown meal types dropped");
  assert.equal(p.in_menu, true);
  assert.equal((await anna("/api/producten", "POST", shake)).status, 409, "duplicate barcode");
  // own barcode resolves to the product without calling Open Food Facts
  assert.deepEqual((await anna(`/api/barcode/${shake.barcode}`)).data, { bron: "eigen", id: r.data.id });
  assert.equal((await anna("/api/barcode/abc")).status, 404);
  // label scan: test config has no AI binding → clear 503, and still validates input first when AI exists
  assert.equal((await anna("/api/etiket", "POST", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(50).fill(1)]), { "content-type": "image/jpeg" })).status, 503);
  const upd = await anna(`/api/producten/${r.data.id}`, "PUT", { ...shake, kcal: 390, in_menu: false });
  assert.equal(upd.data.producten[0].kcal, 390);
  assert.deepEqual(upd.data.producten[0].maaltijden, []);
  assert.equal((await bram(`/api/producten/${r.data.id}`, "PUT", shake)).status, 404, "other client cannot edit");
  await bram(`/api/producten/${r.data.id}`, "DELETE");
  assert.equal((await anna("/api/me")).data.producten.length, 1, "other client cannot delete");
  assert.equal((await coach(`/api/coach/clients/${annaId}`)).data.producten.length, 1);
});

test("food diary: add, edit, delete, recent, isolation, coach range", async () => {
  const item = { naam: "Magere kwark", bron: "basis", ref: "kwark", gram: 250, kcal: 142.5, eiwit: 25, koolh: 10, vet: 0.5 };
  assert.equal((await anna("/api/dagboek", "POST", { datum: "2026-09-29", maaltijd: "brunch", items: [item] })).status, 400);
  assert.equal((await anna("/api/dagboek", "POST", { datum: "2026-09-29", maaltijd: "ontbijt", items: [{ ...item, gram: -1 }] })).status, 400);
  assert.equal((await anna("/api/dagboek", "POST", { datum: "2026-09-29", maaltijd: "ontbijt", items: [] })).status, 400);
  const a = await anna("/api/dagboek", "POST", { datum: "2026-09-29", maaltijd: "ontbijt", items: [item, { ...item, naam: "Banaan", ref: "banaan", gram: 120 }] });
  assert.equal(a.status, 201); assert.equal(a.data.items.length, 2);
  assert.ok(a.data.recent.some((x) => x.naam === "Magere kwark"));
  await anna("/api/dagboek", "POST", { datum: "2026-09-29", maaltijd: "lunch", items: [{ ...item, bron: "menu", ref: "menu:1:kip", naam: "Kipfilet" }] });
  const day = await anna("/api/dagboek?datum=2026-09-29");
  assert.equal(day.data.items.length, 3);
  assert.ok(!day.data.recent.some((x) => x.bron === "menu"), "menu entries are not 'recent'");
  const id = day.data.items[0].id;
  const put = await anna(`/api/dagboek/${id}`, "PUT", { ...item, gram: 125, kcal: 71.3, eiwit: 12.5, koolh: 5, vet: 0.3, maaltijd: "snack" });
  assert.equal(put.data.items.find((x) => x.id === id).maaltijd, "snack");
  assert.equal((await bram(`/api/dagboek/${id}`, "DELETE")).status, 404, "other client");
  assert.equal((await bram("/api/dagboek?datum=2026-09-29")).data.items.length, 0);
  assert.equal((await anna(`/api/dagboek/${id}`, "DELETE")).data.items.length, 2);
  const cd = await coach(`/api/coach/clients/${annaId}/dagboek?van=2026-09-20&tot=2026-09-30`);
  assert.equal(cd.data.items.length, 2);
  assert.equal((await coach(`/api/coach/clients/${annaId}/dagboek?van=2026-01-01&tot=2026-09-30`)).status, 400, "max 62 days");
});

test("security: cross-origin writes, non-JSON bodies, lockout, deactivation", async () => {
  assert.equal((await anna("/api/profiel", "PUT", { naam: "x" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await fetch(`${BASE}/api/login`, { method: "POST", body: "email=a" })).status, 415);
  const x = client();
  const codes = [];
  for (let i = 0; i < 9; i++) codes.push((await x("/api/login", "POST", { email: "nobody@t.nl", password: "wrong" })).status);
  assert.ok(codes.includes(429), `lockout expected, got ${codes}`);
  assert.equal((await coach(`/api/coach/clients/${annaId}`, "PUT", { actief: false })).status, 200);
  assert.equal((await anna("/api/me")).status, 401, "deactivation ends the session");
  await coach(`/api/coach/clients/${annaId}`, "PUT", { actief: true });
});

test("backups: coach export and weekly snapshot", async () => {
  const exp = await coach("/api/coach/export");
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get("content-disposition"), /attachment/);
  const raw = JSON.stringify(exp.data);
  assert.ok(!raw.includes("pw_hash") && !raw.includes("pbkdf2$"), "no password hashes in exports");
  assert.equal(exp.data.clients.find((c) => c.email === "anna@t.nl").checkins.length, 1);
  assert.equal(exp.data.clients.find((c) => c.email === "anna@t.nl").workouts.length, 1);
  assert.equal(exp.data.clients.find((c) => c.email === "anna@t.nl").producten.length, 1);
  assert.equal(exp.data.clients.find((c) => c.email === "anna@t.nl").dagboek.length, 2);
  // opening the client list triggers the weekly snapshot in the background
  await coach("/api/coach/clients");
  await new Promise((r) => setTimeout(r, 1500));
  const keys = JSON.parse(wrangler(["kv", "key", "list", "--binding", "BACKUPS", "--local", "--persist-to", persist, "--config", "wrangler.test.jsonc"]));
  assert.ok(keys.some((k) => k.name.startsWith("backup/")), "dashboard visit wrote a snapshot");
  assert.ok(keys.some((k) => k.name === "meta:laatste"));
  assert.equal((await fetch(`${BASE}/__scheduled`)).status, 200, "cron entry point still works");
});

test("deleting a client removes all their data", async () => {
  assert.equal((await coach(`/api/coach/clients/${annaId}`, "DELETE")).status, 200);
  assert.equal((await coach(`/api/coach/clients/${annaId}`)).status, 404);
  assert.equal((await anna("/api/me")).status, 401);
});

test("stripe: prices, client checkout, payment → account, gating, portal, resubscribe", async () => {
  const pr = (await anon("/api/prijzen")).data;
  assert.deepEqual(pr.client, { bedrag: 79, valuta: "USD", interval: "month" });
  assert.equal(pr.coach.bedrag, 49);
  const buyer = client();
  assert.equal((await buyer("/api/checkout/client", "POST", { naam: "Kim", email: "kim@t.nl" })).status, 400, "terms not accepted");
  assert.equal((await buyer("/api/checkout/client", "POST", { naam: "Bram", email: "bram@t.nl", akkoord: true })).status, 409, "email of an invited client");
  const co = await buyer("/api/checkout/client", "POST", { naam: "Kim Klant", email: "kim@t.nl", akkoord: true });
  assert.equal(co.status, 200);
  const sid = co.data.url.split("/").pop();
  assert.equal(sessions.get(sid).price, "price_client");
  assert.match(sessions.get(sid).success_url, /\/app\/\?betaald=\{CHECKOUT_SESSION_ID\}$/);
  assert.deepEqual((await buyer(`/api/checkout/client?session_id=${sid}`)).data, { status: "open" }, "not paid yet → no account");
  pay(co.data.url);
  const done = await buyer(`/api/checkout/client?session_id=${sid}`);
  assert.equal(done.data.status, "complete"); assert.ok(done.data.invite); assert.equal(done.data.naam, "Kim Klant");
  assert.equal((await buyer("/api/invite", "POST", { token: done.data.invite, password: "kim-pass-12", privacy: true })).status, 200);
  const me = (await buyer("/api/me")).data;
  assert.deepEqual(me.abonnement, { status: "active", einde: 1790000000 });
  assert.equal((await buyer(`/api/checkout/client?session_id=${sid}`)).data.login, true, "second visit: log in instead of a new invite");
  // the client landed under the owner coach
  assert.ok((await coach("/api/coach/clients")).data.some((c) => c.email === "kim@t.nl"));
  // subscription cancelled via webhook → access paused (402), billing still reachable
  assert.equal((await webhook(subEvent("evt_1", "customer.subscription.updated", "sub_" + sid, "canceled"))).status, 200);
  const blocked = await buyer("/api/me");
  assert.equal(blocked.status, 402); assert.equal(blocked.data.code, "abonnement");
  assert.match((await buyer("/api/billing/portal", "POST", {})).data.url, /billing\.stripe\.test\/cus_/);
  const again = await buyer("/api/billing/checkout", "POST", {});
  assert.equal(sessions.get(again.data.url.split("/").pop()).customer, "cus_" + sid, "resubscribe reuses the Stripe customer");
  await webhook(subEvent("evt_2", "customer.subscription.updated", "sub_" + sid, "active"));
  assert.equal((await buyer("/api/me")).status, 200, "access restored");
  // invited clients have no Stripe portal
  assert.equal((await bram("/api/billing/portal", "POST", {})).status, 400);
});

test("stripe webhook: signature and idempotency", async () => {
  assert.equal((await webhook(subEvent("evt_3", "customer.subscription.updated", "sub_x", "active"), "t=1,v1=deadbeef")).status, 400);
  const r1 = await (await webhook(subEvent("evt_4", "customer.subscription.updated", "sub_x", "active"))).json();
  const r2 = await (await webhook(subEvent("evt_4", "customer.subscription.updated", "sub_x", "active"))).json();
  assert.equal(r1.ok, true); assert.equal(r2.dubbel, true);
});

test("platform: coach signup → payment → isolated dashboard; owner overview", async () => {
  const k = client();
  assert.equal((await k("/api/coach/signup", "POST", { naam: "Coach Two", email: "two@t.nl", password: "short", akkoord: true })).status, 400);
  const su = await k("/api/coach/signup", "POST", { naam: "Coach Two", email: "two@t.nl", password: "coach-two-pass", akkoord: true });
  assert.equal(su.status, 201);
  assert.equal(sessions.get(su.data.url.split("/").pop()).price, "price_coach");
  const me = (await k("/api/coach/me")).data;
  assert.equal(me.status, "betaling"); assert.equal(me.isOwner, false);
  const locked = await k("/api/coach/clients");
  assert.equal(locked.status, 402); assert.equal(locked.data.code, "abonnement");
  const sid = pay(su.data.url);
  assert.equal((await k(`/api/coach/checkout?session_id=${sid}`)).data.coachStatus, "actief");
  assert.deepEqual((await k("/api/coach/clients")).data, [], "a new coach sees none of the owner's clients");
  const inv = await k("/api/coach/clients", "POST", { naam: "Pim", email: "pim@t.nl" });
  assert.match(inv.data.link, /\/app\/\?invite=/);
  assert.equal((await coach(`/api/coach/clients/${inv.data.id}`)).status, 404, "owner cannot open another coach's client");
  assert.equal((await k("/api/coach/admin/coaches")).status, 403);
  const all = (await coach("/api/coach/admin/coaches")).data;
  assert.equal(all.find((x) => x.email === "two@t.nl").clienten, 1);
  assert.equal(all.find((x) => x.is_owner).email, "coach@t.nl");
  // platform subscription ends → dashboard locked, billing portal still available
  await webhook(subEvent("evt_5", "customer.subscription.deleted", "sub_" + sid, "canceled"));
  assert.equal((await k("/api/coach/clients")).status, 402);
  assert.match((await k("/api/coach/billing/portal", "POST", {})).data.url, /billing/);
});

test("root: old invite links and logged-in clients go to /app/", async () => {
  const r1 = await fetch(`${BASE}/?invite=abc123`, { redirect: "manual" });
  assert.equal(r1.status, 302); assert.equal(new URL(r1.headers.get("location")).pathname + new URL(r1.headers.get("location")).search, "/app/?invite=abc123");
  const r2 = await fetch(`${BASE}/`, { redirect: "manual", headers: { cookie: "vc=something" } });
  assert.equal(r2.status, 302);
  const r3 = await fetch(`${BASE}/`, { redirect: "manual" });
  assert.equal(r3.status, 200); assert.match(await r3.text(), /Start uw coaching/);
});
