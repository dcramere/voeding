// DCRAMERE Voeding — API (/api/*) + static assets (public/)

const DAY = 86400;
const SESSION_TTL = 30 * DAY;
const INVITE_TTL = 14 * DAY;
const PBKDF2_ITER = 100000; // Workers' WebCrypto maximum
const COOKIE = { client: "vc", coach: "vk" };
const MAX_BODY = 20000;
const MAX_FOTO = 5 * 1024 * 1024; // client resizes to ~1600 px, typically 150–400 KB
const POSES = ["voor", "achter", "zijkant"];
// training programs the coach can assign (definitions live in public/training.js)
const PROGRAMMAS = { ppl12: { weken: 12, dagen: ["pushA", "pullA", "legsA", "pushB", "pullB", "legsB"] } };
// exercise library ids from public/training.js (a test keeps this list in sync)
const BASE_EX = new Set(["incline_db_press", "flat_db_press", "smith_incline_press", "incline_bb_press", "db_barrel_press", "incline_db_lateral", "cable_lateral_single", "seated_db_lateral", "machine_lateral", "seated_db_press_hammer", "standing_bb_ohp", "straight_bar_ext", "rope_ext", "skull_crushers", "incline_skull", "wide_pulldown", "vbar_pulldown", "bb_pullover", "seated_row_vbar", "seated_lat_row", "seated_row_high_elbow", "bent_bb_row", "tbar_row", "meadows_row", "incline_db_high_elbow_row", "incline_db_rear_delt", "cable_rear_delt_close", "rear_delt_btb", "cable_rear_delt_partials", "cable_straight_curl", "ez_curl", "db_preacher_curl", "incline_cable_curl", "leg_ext", "seated_leg_curl", "he_smith_squat", "he_highbar_squat", "hack_squat", "leg_press_low", "glute_rdl", "smith_stiff_leg", "sumo_deads", "walking_lunges", "db_split_squat", "seated_calf_partials", "smith_calf_raise"]);
const EQUIP = ["Dumbbell", "Barbell", "Kabel", "Machine", "Smith", "Lichaamsgewicht", "Kettlebell", "Band", "Overig"];
const MUSCLES = ["chest", "fdelt", "sdelt", "rdelt", "triceps", "biceps", "forearms", "lats", "upperback", "traps", "lowerback", "abs", "quads", "hams", "glutes", "calves", "adductors"];
const DAYTYPES = ["push", "pull", "legs", "upper", "lower", "full", "other"];

const ACTIVITEIT = [1.35, 1.45, 1.55, 1.7, 1.85];
const DOEL = [-0.2, -0.1, 0, 0.1];
const MOMENT = ["ochtend", "middag", "avond"];

const BACKUP_TTL = 60 * DAY; // weekly snapshots, ~8 kept
const BACKUP_EVERY = 7 * DAY;

let schedulerChecked = false;
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!schedulerChecked && env.SCHEDULER) {
      schedulerChecked = true;
      ctx.waitUntil(env.SCHEDULER.get(env.SCHEDULER.idFromName("main")).fetch("https://scheduler/ensure").catch((e) => console.error("scheduler", e)));
    }
    if (url.pathname === "/") {
      // the app moved to /app/: keep old invite links working (the landing page stays reachable for everyone)
      if (url.searchParams.has("invite")) return Response.redirect(`${url.origin}/app/?invite=${encodeURIComponent(url.searchParams.get("invite"))}`, 302);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
      console.error(e);
      return json({ error: "Er ging iets mis op de server. Probeer het later opnieuw." }, 500);
    }
  },

  // optional cron entry point (the free plan's 5 cron slots are taken, so backups are normally
  // triggered by backupIfDue when the coach opens the dashboard)
  async scheduled(event, env) {
    await runHourly(env, Math.floor(Date.now() / 1000), true);
  },
};

// Hourly alarm without a cron slot (the account's free cron triggers are all in use): a single Durable Object
// re-arms its own alarm every hour and runs the reminders (at 12:00 UTC = 09:00 Suriname) and the backup check.
export class Scheduler {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch() {
    if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 60_000);
    return new Response("ok");
  }
  async alarm() {
    try { await runHourly(this.env, Math.floor(Date.now() / 1000), false); }
    catch (e) { console.error("hourly run failed", e); }
    const next = new Date(); next.setUTCMinutes(0, 0, 0); next.setUTCHours(next.getUTCHours() + 1);
    await this.state.storage.setAlarm(next.getTime());
  }
}

async function runHourly(env, now, force) {
  await backupIfDue(env, now);
  const hour = new Date(now * 1000).getUTCHours();
  if (force || env.HERINNERING_UUR === "altijd" || hour === Number(env.HERINNERING_UUR || 12)) await sendReminders(env, now);
}

// full snapshot of all data into KV, independent of D1's own 30-day Time Travel
async function writeBackup(env) {
  const { results: coaches } = await env.DB.prepare("SELECT id, naam, email, created_at FROM coaches").all();
  const snapshot = { gemaakt: new Date().toISOString(), coaches: [] };
  for (const c of coaches) snapshot.coaches.push({ ...c, ...(await exportData(env, c.id)) });
  const key = `backup/${snapshot.gemaakt.slice(0, 10)}.json`;
  await env.BACKUPS.put(key, JSON.stringify(snapshot), { expirationTtl: BACKUP_TTL });
  await env.BACKUPS.put("meta:laatste", String(Math.floor(Date.now() / 1000)));
  console.log(`backup written: ${key}`);
}

async function backupIfDue(env, now) {
  try {
    const last = Number(await env.BACKUPS.get("meta:laatste")) || 0;
    if (now - last >= BACKUP_EVERY) await writeBackup(env);
  } catch (e) {
    console.error("backup failed", e);
  }
}

// ---------- http helpers ----------
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const fail = (status, msg, code) => { throw new HttpError(status, msg, code); };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function readJson(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) fail(415, "Verwacht JSON.");
  const text = await req.text();
  if (text.length > MAX_BODY) fail(413, "Verzoek is te groot.");
  try { return text ? JSON.parse(text) : {}; } catch { fail(400, "Ongeldige JSON."); }
}

function getCookie(req, name) {
  const h = req.headers.get("cookie") || "";
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

const cookie = (name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// ---------- crypto ----------
const enc = new TextEncoder();

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => b64url(await crypto.subtle.digest("SHA-256", enc.encode(s)));

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64url(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${await pbkdf2(password, salt, PBKDF2_ITER)}`;
}
async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split("$");
  if (alg !== "pbkdf2") return false;
  return safeEqual(await pbkdf2(password, unb64url(salt), +iter), hash);
}

// ---------- validation ----------
function str(v, max, field) {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) fail(400, `${field} is te lang.`);
  return s;
}
function email(v) {
  const s = str(v, 200, "E-mailadres").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, "Vul een geldig e-mailadres in.");
  return s;
}
function newPassword(v) {
  const s = typeof v === "string" ? v : "";
  if (s.length < 8) fail(400, "Kies een wachtwoord van minimaal 8 tekens.");
  if (s.length > 200) fail(400, "Wachtwoord is te lang.");
  return s;
}
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

function num(v, min, max, field, required = false) {
  if (v === null || v === undefined || v === "") {
    if (required) fail(400, `${field} ontbreekt.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `${field} moet tussen ${min} en ${max} liggen.`);
  return Math.round(n * 10) / 10;
}

function cleanProfiel(p) {
  if (!p || typeof p !== "object") fail(400, "Profiel ontbreekt.");
  if (p.geslacht !== "m" && p.geslacht !== "v") fail(400, "Kies een geslacht.");
  if (!isDate(p.geboorte) || p.geboorte < "1900-01-01" || p.geboorte > new Date().toISOString().slice(0, 10))
    fail(400, "Vul een geldige geboortedatum in.");
  const maaltijden = [3, 4, 5].includes(+p.maaltijden) ? +p.maaltijden : 3;
  const activiteit = ACTIVITEIT.includes(+p.activiteit) ? +p.activiteit : 1.55;
  const doel = DOEL.includes(+p.doel) ? +p.doel : 0;
  const excl = Array.isArray(p.excl) ? p.excl.filter((k) => typeof k === "string" && /^[a-z]{1,30}$/.test(k)).slice(0, 60) : [];
  const trainingsdagen = Array.isArray(p.trainingsdagen)
    ? [...new Set(p.trainingsdagen.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  const trainingsmoment = MOMENT.includes(p.trainingsmoment) ? p.trainingsmoment : "middag";
  return {
    geslacht: p.geslacht, geboorte: p.geboorte, lengte: num(p.lengte, 120, 230, "Lengte", true),
    maaltijden, activiteit, doel,
    geenRood: !!p.geenRood, geenVis: !!p.geenVis, vega: !!p.vega, geenZuivel: !!p.geenZuivel, excl,
    trainingsdagen, trainingsmoment,
  };
}

function cleanMeting(b) {
  if (!isDate(b.datum)) fail(400, "Vul een geldige datum in.");
  const m = {
    datum: b.datum,
    gewicht: num(b.gewicht, 30, 300, "Gewicht", true),
    taille: num(b.taille, 30, 250, "Taille"),
    heup: num(b.heup, 30, 250, "Heupomvang"),
    p1: num(b.p1, 1, 80, "Huidplooi biceps"),
    p2: num(b.p2, 1, 80, "Huidplooi triceps"),
    p3: num(b.p3, 1, 80, "Huidplooi schouderblad"),
    p4: num(b.p4, 1, 80, "Huidplooi heupbeen"),
  };
  const pl = [m.p1, m.p2, m.p3, m.p4].filter((x) => x !== null).length;
  if (pl > 0 && pl < 4) fail(400, "Vul alle vier huidplooien in, of geen.");
  return m;
}

const INTAKE_KEUZES = {
  werk: ["zittend", "staand", "fysiek", "ploegen"],
  ervaring: ["geen", "beginner", "gevorderd", "ervaren"],
  alcohol: ["nooit", "soms", "wekelijks", "dagelijks"],
};
function cleanIntake(b) {
  if (!b || typeof b !== "object") fail(400, "Intake ontbreekt.");
  const keuze = (k) => (INTAKE_KEUZES[k].includes(b[k]) ? b[k] : "");
  const intake = {
    doel: str(b.doel, 1000, "Doel"),
    streefgewicht: num(b.streefgewicht, 30, 300, "Streefgewicht"),
    medisch: str(b.medisch, 1000, "Medische informatie"),
    blessures: str(b.blessures, 1000, "Blessures"),
    allergieen: str(b.allergieen, 500, "Allergieën"),
    werk: keuze("werk"),
    slaap: num(b.slaap, 3, 12, "Slaap"),
    ervaring: keuze("ervaring"),
    sport: str(b.sport, 500, "Sport"),
    lastig: str(b.lastig, 1000, "Lastigste punt"),
    alcohol: keuze("alcohol"),
  };
  if (!intake.doel) fail(400, "Beschrijf kort wat u wilt bereiken.");
  return intake;
}

function cleanCheckin(b) {
  if (!isDate(b.datum)) fail(400, "Vul een geldige datum in.");
  const score = (k, label) => {
    const v = Number(b[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) fail(400, `Kies een score voor ${label}.`);
    return v;
  };
  const training = b.training === null || b.training === undefined || b.training === "" ? null : Number(b.training);
  if (training !== null && (!Number.isInteger(training) || training < 0 || training > 14)) fail(400, "Aantal trainingen klopt niet.");
  return {
    datum: b.datum, energie: score("energie", "energie"), honger: score("honger", "honger"), slaap: score("slaap", "slaap"),
    stress: score("stress", "stress"), naleving: score("naleving", "het volgen van het plan"), training,
    opmerking: str(b.opmerking, 2000, "Opmerking"),
  };
}

function cleanMenu(b) {
  const seed = Number.isInteger(b.seed) ? Math.max(0, Math.min(b.seed, 1e6)) : 0;
  const offs = (a) => (Array.isArray(a) ? a.slice(0, 6).map((x) => (Number.isInteger(x) ? Math.max(0, Math.min(x, 1e6)) : 0)) : []);
  return { seed, off: offs(b.off), offT: offs(b.offT) };
}

// ---------- sessions & throttling ----------
async function startSession(c, role, id) {
  const token = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (token_hash, role, subject_id, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(token), role, id, c.now + SESSION_TTL),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(c.now),
  ]);
  return cookie(COOKIE[role], token, SESSION_TTL);
}

async function sessionSubject(c, role) {
  const token = getCookie(c.req, COOKIE[role]);
  if (!token) return null;
  const row = await c.env.DB.prepare("SELECT subject_id, expires_at FROM sessions WHERE token_hash = ? AND role = ?")
    .bind(await sha256(token), role).first();
  return row && row.expires_at > c.now ? row.subject_id : null;
}

const clientIp = (c) => c.req.headers.get("cf-connecting-ip") || "local";

async function throttle(c, keys) {
  for (const k of keys) {
    const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND ts > ?").bind(k, c.now - 900).first();
    if (r.n >= 8) fail(429, "Te veel pogingen. Probeer het over 15 minuten opnieuw.");
  }
}
async function recordFailure(c, keys) {
  await c.env.DB.batch([
    ...keys.map((k) => c.env.DB.prepare("INSERT INTO login_attempts (k, ts) VALUES (?, ?)").bind(k, c.now)),
    c.env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(c.now - DAY),
  ]);
}

// Subscriptions: clients who signed up via Stripe (abo_status set) and coaches other than the owner
// need an active subscription. opts.billing lets the billing endpoints through regardless.
const ACTIVE_SUB = ["active", "trialing", "past_due"];
const withClient = (fn, opts = {}) => async (c) => {
  const id = await sessionSubject(c, "client");
  if (!id) fail(401, "Log opnieuw in.");
  const client = await c.env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  if (!client || !client.actief) fail(401, "Uw account is niet actief. Neem contact op met uw coach.");
  if (!opts.billing && client.abo_status && !ACTIVE_SUB.includes(client.abo_status))
    fail(402, "Uw abonnement is niet actief. Hervat het om verder te gaan; uw gegevens zijn bewaard.", "abonnement");
  return fn({ ...c, client });
};
const withCoach = (fn, opts = {}) => async (c) => {
  const id = await sessionSubject(c, "coach");
  if (!id) fail(401, "Log opnieuw in.");
  const coach = await c.env.DB.prepare("SELECT id, naam, email, is_owner, status, stripe_customer, abo_status, abo_einde FROM coaches WHERE id = ?").bind(id).first();
  if (!coach) fail(401, "Log opnieuw in.");
  if (!opts.billing && !coach.is_owner && coach.status !== "actief")
    fail(402, "Uw platformabonnement is niet actief.", "abonnement");
  return fn({ ...c, coach });
};

// ---------- router ----------
const RAW = true;
const ROUTES = [
  // client
  ["POST", "/login", clientLogin],
  ["POST", "/logout", logout("client")],
  ["GET", "/invite", inviteInfo],
  ["POST", "/invite", inviteAccept],
  ["GET", "/me", withClient(clientMe)],
  ["PUT", "/profiel", withClient(clientPutProfiel)],
  ["PUT", "/menu", withClient(clientPutMenu)],
  ["POST", "/metingen", withClient(clientAddMeting)],
  ["DELETE", /^\/metingen\/(\d+)$/, withClient(clientDelMeting)],
  ["PUT", "/intake", withClient(clientPutIntake)],
  ["POST", "/privacy", withClient(clientAcceptPrivacy)],
  ["POST", "/fotos", withClient((c) => storeFoto(c, c.client.id, "client")), RAW],
  ["PUT", "/workouts", withClient(clientPutWorkout)],
  ["GET", "/berichten", withClient(clientGetBerichten)],
  ["GET", "/berichten/ongelezen", withClient(async (c) => json({ n: (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM berichten WHERE client_id = ? AND van = 'coach' AND gelezen IS NULL").bind(c.client.id).first()).n }))],
  ["POST", "/berichten", withClient(clientPostBericht)],
  ["POST", "/berichten/foto", withClient((c) => postBerichtFoto(c, c.client, "client")), RAW],
  ["GET", /^\/berichten\/foto\/(\d+)$/, withClient((c) => serveBerichtFoto(c, c.client.id))],
  ["GET", "/push/key", (c) => json({ key: c.env.VAPID_PUBLIC || null })],
  ["POST", "/push/subscribe", pushSubscribe],
  ["POST", "/push/unsubscribe", pushUnsubscribe],
  ["GET", "/push/pending", pushPending],
  ["POST", "/producten", withClient(clientAddProduct)],
  ["PUT", /^\/producten\/(\d+)$/, withClient(clientPutProduct)],
  ["DELETE", /^\/producten\/(\d+)$/, withClient(clientDelProduct)],
  ["GET", /^\/barcode\/(\d{8,14})$/, withClient(barcodeLookup)],
  ["POST", "/etiket", withClient(labelScan), RAW],
  ["GET", "/dagboek", withClient(clientGetDagboek)],
  ["POST", "/dagboek", withClient(clientAddDagboek)],
  ["PUT", /^\/dagboek\/(\d+)$/, withClient(clientPutDagboek)],
  ["DELETE", /^\/dagboek\/(\d+)$/, withClient(clientDelDagboek)],
  ["GET", /^\/fotos\/(\d+)$/, withClient(clientGetFoto)],
  ["DELETE", /^\/fotos\/(\d+)$/, withClient(clientDelFoto)],
  ["POST", "/checkins", withClient(clientAddCheckin)],
  ["POST", "/wachtwoord", withClient(clientChangePassword)],
  // coach
  ["GET", "/coach/status", coachStatus],
  ["POST", "/coach/setup", coachSetup],
  ["POST", "/coach/login", coachLogin],
  ["POST", "/coach/logout", logout("coach")],
  ["GET", "/coach/me", withCoach(coachMeInfo, { billing: true })],
  ["POST", "/coach/signup", coachSignup],
  ["POST", "/coach/checkout", withCoach(coachCheckout, { billing: true })],
  ["GET", "/coach/checkout", withCoach(coachCheckoutStatus, { billing: true })],
  ["POST", "/coach/billing/portal", withCoach(coachPortal, { billing: true })],
  ["GET", "/coach/admin/coaches", withCoach(ownerCoaches)],
  ["GET", "/prijzen", prijzen],
  ["POST", "/checkout/client", clientCheckout],
  ["GET", "/checkout/client", clientCheckoutStatus],
  ["POST", "/billing/portal", withClient(clientPortal, { billing: true })],
  ["POST", "/billing/checkout", withClient(clientResubscribe, { billing: true })],
  ["POST", "/stripe/webhook", stripeWebhook, RAW],
  ["GET", "/coach/clients", withCoach(listClients)],
  ["GET", "/coach/export", withCoach(coachExport)],
  ["POST", "/coach/clients", withCoach(createClient)],
  ["GET", /^\/coach\/clients\/(\d+)$/, withCoach(getClient)],
  ["PUT", /^\/coach\/clients\/(\d+)$/, withCoach(updateClient)],
  ["DELETE", /^\/coach\/clients\/(\d+)$/, withCoach(deleteClient)],
  ["POST", /^\/coach\/clients\/(\d+)\/uitnodiging$/, withCoach(newInvite)],
  ["POST", /^\/coach\/clients\/(\d+)\/metingen$/, withCoach(coachAddMeting)],
  ["DELETE", /^\/coach\/clients\/(\d+)\/metingen\/(\d+)$/, withCoach(coachDelMeting)],
  ["POST", /^\/coach\/clients\/(\d+)\/fotos$/, withCoach(coachAddFoto), RAW],
  ["GET", /^\/coach\/fotos\/(\d+)$/, withCoach(coachGetFoto)],
  ["DELETE", /^\/coach\/clients\/(\d+)\/fotos\/(\d+)$/, withCoach(coachDelFoto)],
  ["GET", /^\/coach\/clients\/(\d+)\/dagboek$/, withCoach(coachGetDagboek)],
  ["GET", /^\/coach\/clients\/(\d+)\/berichten$/, withCoach(coachGetBerichten)],
  ["GET", "/coach/programmas", withCoach(listProgrammas)],
  ["POST", "/coach/programmas", withCoach(createProgramma)],
  ["GET", /^\/coach\/programmas\/(\d+)$/, withCoach(getProgramma)],
  ["PUT", /^\/coach\/programmas\/(\d+)$/, withCoach(updateProgramma)],
  ["DELETE", /^\/coach\/programmas\/(\d+)$/, withCoach(deleteProgramma)],
  ["POST", /^\/coach\/clients\/(\d+)\/berichten$/, withCoach(coachPostBericht)],
  ["POST", /^\/coach\/clients\/(\d+)\/berichten\/foto$/, withCoach(async (c) => postBerichtFoto(c, await ownClient(c, c.params[0]), "coach")), RAW],
  ["GET", /^\/coach\/berichten\/foto\/(\d+)$/, withCoach(coachBerichtFoto)],
];

async function route(req, env, url, ctx) {
  const method = req.method;
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) fail(403, "Ongeldige herkomst.");
  }
  const path = url.pathname.slice(4);
  for (const [m, pattern, handler, raw] of ROUTES) {
    if (m !== method) continue;
    let params = [];
    if (typeof pattern === "string") { if (pattern !== path) continue; }
    else { const hit = path.match(pattern); if (!hit) continue; params = hit.slice(1).map(Number); }
    const body = !raw && (method === "POST" || method === "PUT") ? await readJson(req) : {};
    return handler({ req, env, url, ctx, body, params, now: Math.floor(Date.now() / 1000) });
  }
  fail(404, "Niet gevonden.");
}

// ---------- shared ----------
function logout(role) {
  return async (c) => {
    const token = getCookie(c.req, COOKIE[role]);
    if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie(COOKIE[role], "", 0) });
  };
}

async function metingenOf(env, clientId) {
  const { results } = await env.DB.prepare(
    "SELECT id, datum, gewicht, taille, heup, p1, p2, p3, p4, door FROM metingen WHERE client_id = ? ORDER BY datum",
  ).bind(clientId).all();
  return results;
}

async function checkinsOf(env, clientId, limit = 52) {
  const { results } = await env.DB.prepare(
    `SELECT id, datum, energie, honger, slaap, stress, naleving, training, opmerking
     FROM checkins WHERE client_id = ? ORDER BY datum DESC LIMIT ?`,
  ).bind(clientId, limit).all();
  return results;
}

async function exportData(env, coachId) {
  const { results: clients } = await env.DB.prepare(
    `SELECT id, naam, email, actief, profiel, intake, programma, notities, privacy_akkoord, created_at, last_seen
     FROM clients WHERE coach_id = ? ORDER BY id`,
  ).bind(coachId).all();
  for (const cl of clients) {
    cl.profiel = cl.profiel ? JSON.parse(cl.profiel) : null;
    cl.intake = cl.intake ? JSON.parse(cl.intake) : null;
    cl.metingen = await metingenOf(env, cl.id);
    cl.checkins = await checkinsOf(env, cl.id, 10000);
    const { results: wo } = await env.DB.prepare("SELECT programma, week, dag, datum, sets, notitie, afgerond FROM workouts WHERE client_id = ?").bind(cl.id).all();
    cl.workouts = wo.map((w) => ({ ...w, sets: JSON.parse(w.sets) }));
    cl.producten = await productenOf(env, cl.id);
    cl.dagboek = (await env.DB.prepare("SELECT datum, maaltijd, naam, bron, gram, kcal, eiwit, koolh, vet FROM dagboek WHERE client_id = ? ORDER BY datum, id").bind(cl.id).all()).results;
  }
  return { clients };
}

async function upsertMeting(c, clientId, door) {
  const m = cleanMeting(c.body);
  await c.env.DB.prepare(
    `INSERT INTO metingen (client_id, datum, gewicht, taille, heup, p1, p2, p3, p4, door, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id, datum) DO UPDATE SET
       gewicht = excluded.gewicht, taille = excluded.taille, heup = excluded.heup,
       p1 = excluded.p1, p2 = excluded.p2, p3 = excluded.p3, p4 = excluded.p4, door = excluded.door`,
  ).bind(clientId, m.datum, m.gewicht, m.taille, m.heup, m.p1, m.p2, m.p3, m.p4, door, c.now).run();
  return json({ metingen: await metingenOf(c.env, clientId) });
}

async function login(c, role, table) {
  const addr = email(c.body.email);
  const password = typeof c.body.password === "string" ? c.body.password : "";
  const keys = [`ip:${clientIp(c)}`, `${role}:${addr}`];
  await throttle(c, keys);
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE email = ?`).bind(addr).first();
  let ok = false;
  if (row && row.pw_hash) ok = await verifyPassword(password, row.pw_hash);
  else await hashPassword(password); // equalise timing for unknown accounts
  if (!ok) {
    await recordFailure(c, keys);
    fail(401, "E-mailadres of wachtwoord klopt niet.");
  }
  if (role === "client" && !row.actief) fail(403, "Uw account is niet actief. Neem contact op met uw coach.");
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, role, row.id) });
}

// ---------- client handlers ----------
function clientLogin(c) { return login(c, "client", "clients"); }

async function inviteRow(c, token) {
  if (typeof token !== "string" || token.length < 20) fail(404, "Deze link is ongeldig.");
  const row = await c.env.DB.prepare("SELECT id, naam, email, actief, invite_expires FROM clients WHERE invite_hash = ?")
    .bind(await sha256(token)).first();
  if (!row || !row.actief || row.invite_expires < c.now)
    fail(404, "Deze link is ongeldig of verlopen. Vraag uw coach om een nieuwe link.");
  return row;
}

async function inviteInfo(c) {
  const row = await inviteRow(c, c.url.searchParams.get("token"));
  return json({ naam: row.naam, email: row.email });
}

async function inviteAccept(c) {
  const row = await inviteRow(c, c.body.token);
  if (c.body.privacy !== true) fail(400, "Ga akkoord met de privacyverklaring om verder te gaan.");
  const pw = await hashPassword(newPassword(c.body.password));
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE clients SET pw_hash = ?, invite_hash = NULL, invite_expires = NULL, privacy_akkoord = COALESCE(privacy_akkoord, ?) WHERE id = ?",
    ).bind(pw, c.now, row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(row.id),
  ]);
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, "client", row.id) });
}

async function clientMe(c) {
  const { client: cl, env } = c;
  const [coach, metingen, checkins, fotos, workouts, producten] = await Promise.all([
    env.DB.prepare("SELECT naam FROM coaches WHERE id = ?").bind(cl.coach_id).first(),
    metingenOf(env, cl.id),
    checkinsOf(env, cl.id, 12),
    fotosOf(env, cl.id),
    workoutsOf(env, cl),
    productenOf(env, cl.id),
    env.DB.prepare("UPDATE clients SET last_seen = ? WHERE id = ?").bind(c.now, cl.id).run(),
  ]);
  return json({
    naam: cl.naam, email: cl.email, coach: coach ? coach.naam : "",
    profiel: profielOut(cl), intake: cl.intake ? JSON.parse(cl.intake) : null,
    privacyAkkoord: cl.privacy_akkoord, menu: JSON.parse(cl.menu), metingen, checkins, fotos,
    programma: cl.programma ? JSON.parse(cl.programma) : null, workouts, producten,
    programmaDef: cl.programma ? await customDefOut(env, JSON.parse(cl.programma).id, cl.coach_id) : null,
    abonnement: cl.abo_status ? { status: cl.abo_status, einde: cl.abo_einde } : null,
    ongelezen: (await env.DB.prepare("SELECT COUNT(*) AS n FROM berichten WHERE client_id = ? AND van = 'coach' AND gelezen IS NULL").bind(cl.id).first()).n,
    // coach feedback on check-ins, for the progress screen (reading it here does not mark it read)
    feedback: (await env.DB.prepare(`SELECT ${BERICHT_COLS} FROM berichten WHERE client_id = ? AND van = 'coach' AND checkin_id IS NOT NULL ORDER BY id DESC LIMIT 5`).bind(cl.id).all()).results.reverse().map((b) => ({ ...b, foto: !!b.foto })),
  });
}

async function clientPutProfiel(c) {
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const profiel = cleanProfiel(c.body.profiel);
  await c.env.DB.prepare("UPDATE clients SET naam = ?, profiel = ? WHERE id = ?")
    .bind(naam, JSON.stringify(profiel), c.client.id).run();
  return json({ naam, profiel: profielOut({ profiel: JSON.stringify(profiel), doelen: c.client.doelen }) });
}

async function clientPutMenu(c) {
  const menu = cleanMenu(c.body);
  await c.env.DB.prepare("UPDATE clients SET menu = ? WHERE id = ?").bind(JSON.stringify(menu), c.client.id).run();
  return json(menu);
}

function clientAddMeting(c) { return upsertMeting(c, c.client.id, "client"); }

// for clients activated before consent was part of activation
async function clientAcceptPrivacy(c) {
  if (c.body.akkoord !== true) fail(400, "Ga akkoord met de privacyverklaring om verder te gaan.");
  await c.env.DB.prepare("UPDATE clients SET privacy_akkoord = COALESCE(privacy_akkoord, ?) WHERE id = ?").bind(c.now, c.client.id).run();
  return json({ privacyAkkoord: c.client.privacy_akkoord || c.now });
}

async function clientPutIntake(c) {
  const intake = cleanIntake(c.body);
  await c.env.DB.prepare("UPDATE clients SET intake = ? WHERE id = ?").bind(JSON.stringify(intake), c.client.id).run();
  return json(intake);
}

async function clientAddCheckin(c) {
  const k = cleanCheckin(c.body);
  await c.env.DB.prepare(
    `INSERT INTO checkins (client_id, datum, energie, honger, slaap, stress, naleving, training, opmerking, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id, datum) DO UPDATE SET
       energie = excluded.energie, honger = excluded.honger, slaap = excluded.slaap, stress = excluded.stress,
       naleving = excluded.naleving, training = excluded.training, opmerking = excluded.opmerking`,
  ).bind(c.client.id, k.datum, k.energie, k.honger, k.slaap, k.stress, k.naleving, k.training, k.opmerking, c.now).run();
  c.ctx?.waitUntil(notify(c.env, "coach", c.client.coach_id, { titel: `Check-in van ${c.client.naam}`,
    tekst: k.opmerking ? k.opmerking.slice(0, 120) : "Er staat een nieuwe weekcheck-in klaar.", url: `/coach/#/client/${c.client.id}/checkins` }, c.now));
  return json({ checkins: await checkinsOf(c.env, c.client.id, 12) });
}

async function clientDelMeting(c) {
  await c.env.DB.prepare("DELETE FROM metingen WHERE id = ? AND client_id = ?").bind(c.params[0], c.client.id).run();
  return json({ metingen: await metingenOf(c.env, c.client.id) });
}

async function clientChangePassword(c) {
  const keys = [`ip:${clientIp(c)}`, `client:${c.client.email}`];
  await throttle(c, keys);
  if (!(await verifyPassword(String(c.body.huidig || ""), c.client.pw_hash))) {
    await recordFailure(c, keys);
    fail(400, "Uw huidige wachtwoord klopt niet.");
  }
  const pw = await hashPassword(newPassword(c.body.nieuw));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE clients SET pw_hash = ? WHERE id = ?").bind(pw, c.client.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(c.client.id),
  ]);
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, "client", c.client.id) });
}

// ---------- coach handlers ----------
async function coachCount(env) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM coaches").first()).n;
}

async function coachStatus(c) {
  return json({ setupNodig: (await coachCount(c.env)) === 0 });
}

async function coachSetup(c) {
  const keys = [`ip:${clientIp(c)}`];
  await throttle(c, keys);
  if ((await coachCount(c.env)) > 0) fail(403, "Er is al een coach-account. Log in.");
  if (!c.env.SETUP_CODE || !safeEqual(String(c.body.code || "").trim(), c.env.SETUP_CODE)) {
    await recordFailure(c, keys);
    fail(403, "De setupcode klopt niet.");
  }
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const addr = email(c.body.email);
  const pw = c.body.password;
  if (typeof pw !== "string" || pw.length < 10) fail(400, "Kies een wachtwoord van minimaal 10 tekens.");
  const { meta } = await c.env.DB.prepare("INSERT INTO coaches (email, naam, pw_hash, created_at, is_owner, status) VALUES (?, ?, ?, ?, 1, 'actief')")
    .bind(addr, naam, await hashPassword(pw), c.now).run();
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, "coach", meta.last_row_id) });
}

function coachLogin(c) { return login(c, "coach", "coaches"); }

async function ownClient(c, id) {
  const row = await c.env.DB.prepare("SELECT * FROM clients WHERE id = ? AND coach_id = ?").bind(id, c.coach.id).first();
  if (!row) fail(404, "Cliënt niet gevonden.");
  return row;
}

// the coach's manual targets travel inside the profile as profiel.override (clients cannot write them)
const profielOut = (r) => (r.profiel ? { ...JSON.parse(r.profiel), ...(r.doelen ? { override: JSON.parse(r.doelen) } : {}) } : null);
function cleanDoelen(b) {
  if (b === null) return null;
  if (!b || typeof b !== "object") fail(400, "Ongeldige doelen.");
  const d = { kcal: num(b.kcal, 800, 6000, "Calorieën", true), prot: num(b.prot, 30, 400, "Eiwit"), fat: num(b.fat, 20, 300, "Vet") };
  if ((d.prot || 0) * 4 + (d.fat || 0) * 9 > d.kcal) fail(400, "Eiwit en vet leveren samen meer calorieën dan het dagdoel.");
  return d;
}
function publicClient(r) {
  return {
    id: r.id, naam: r.naam, email: r.email, actief: !!r.actief, geactiveerd: !!r.pw_hash,
    uitnodigingVerloopt: r.invite_expires, notities: r.notities, privacyAkkoord: r.privacy_akkoord,
    profiel: profielOut(r), doelen: r.doelen ? JSON.parse(r.doelen) : null, intake: r.intake ? JSON.parse(r.intake) : null,
    programma: r.programma ? JSON.parse(r.programma) : null, menu: JSON.parse(r.menu),
    aangemaakt: r.created_at, laatstGezien: r.last_seen,
  };
}

async function listClients(c) {
  // opening the dashboard doubles as the weekly backup trigger (runs after the response)
  c.ctx?.waitUntil(backupIfDue(c.env, c.now));
  const { results } = await c.env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM metingen m WHERE m.client_id = c.id) AS aantal,
       (SELECT json_object('datum', datum, 'gewicht', gewicht)
          FROM metingen m WHERE m.client_id = c.id ORDER BY datum ASC LIMIT 1) AS eerste,
       (SELECT json_object('datum', datum, 'gewicht', gewicht, 'taille', taille, 'heup', heup,
                           'p1', p1, 'p2', p2, 'p3', p3, 'p4', p4)
          FROM metingen m WHERE m.client_id = c.id ORDER BY datum DESC LIMIT 1) AS laatste,
       (SELECT json_object('datum', datum, 'energie', energie, 'honger', honger, 'slaap', slaap,
                           'stress', stress, 'naleving', naleving)
          FROM checkins k WHERE k.client_id = c.id ORDER BY datum DESC LIMIT 1) AS checkin,
       (SELECT MAX(datum) FROM fotos f WHERE f.client_id = c.id) AS laatste_foto,
       (SELECT MAX(datum) FROM workouts w WHERE w.client_id = c.id AND w.afgerond IS NOT NULL) AS laatste_training,
       (SELECT COUNT(*) FROM berichten b WHERE b.client_id = c.id AND b.van = 'client' AND b.gelezen IS NULL) AS ongelezen
     FROM clients c WHERE c.coach_id = ? ORDER BY c.naam COLLATE NOCASE`,
  ).bind(c.coach.id).all();
  return json(results.map((r) => ({
    ...publicClient(r), aantal: r.aantal, checkin: r.checkin ? JSON.parse(r.checkin) : null, laatsteFoto: r.laatste_foto, laatsteTraining: r.laatste_training, ongelezen: r.ongelezen,
    eerste: r.eerste ? JSON.parse(r.eerste) : null, laatste: r.laatste ? JSON.parse(r.laatste) : null,
  })));
}

async function issueInviteToken(env, id, now) {
  const token = randomToken();
  await env.DB.prepare("UPDATE clients SET invite_hash = ?, invite_expires = ? WHERE id = ?")
    .bind(await sha256(token), now + INVITE_TTL, id).run();
  return token;
}
async function issueInvite(c, id) {
  return `${c.url.origin}/app/?invite=${await issueInviteToken(c.env, id, c.now)}`;
}

async function createClient(c) {
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul een naam in.");
  const addr = email(c.body.email);
  if (await c.env.DB.prepare("SELECT 1 FROM clients WHERE email = ?").bind(addr).first())
    fail(409, "Er bestaat al een cliënt met dit e-mailadres.");
  const { meta } = await c.env.DB.prepare("INSERT INTO clients (coach_id, naam, email, created_at) VALUES (?, ?, ?, ?)")
    .bind(c.coach.id, naam, addr, c.now).run();
  const id = meta.last_row_id;
  return json({ id, link: await issueInvite(c, id) }, 201);
}

async function getClient(c) {
  const row = await ownClient(c, c.params[0]);
  const [metingen, checkins, fotos, workouts, producten] = await Promise.all([
    metingenOf(c.env, row.id), checkinsOf(c.env, row.id), fotosOf(c.env, row.id), workoutsOf(c.env, row), productenOf(c.env, row.id)]);
  const ongelezen = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM berichten WHERE client_id = ? AND van = 'client' AND gelezen IS NULL").bind(row.id).first()).n;
  const feedback = (await c.env.DB.prepare("SELECT id, tekst, checkin_id, created_at FROM berichten WHERE client_id = ? AND van = 'coach' AND checkin_id IS NOT NULL ORDER BY id").bind(row.id).all()).results;
  const programmaDef = row.programma ? await customDefOut(c.env, JSON.parse(row.programma).id, row.coach_id) : null;
  return json({ ...publicClient(row), metingen, checkins, fotos, workouts, producten, ongelezen, feedback, programmaDef });
}

async function coachExport(c) {
  const data = { gemaakt: new Date().toISOString(), coach: c.coach, ...(await exportData(c.env, c.coach.id)) };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
      "content-disposition": `attachment; filename="dcramere-voeding-backup-${data.gemaakt.slice(0, 10)}.json"`,
    },
  });
}

async function updateClient(c) {
  const row = await ownClient(c, c.params[0]);
  const b = c.body, sets = [], vals = [], extra = [];
  if ("naam" in b) {
    const naam = str(b.naam, 100, "Naam");
    if (!naam) fail(400, "Vul een naam in.");
    sets.push("naam = ?"); vals.push(naam);
  }
  if ("email" in b) {
    const addr = email(b.email);
    if (addr !== row.email.toLowerCase() &&
        await c.env.DB.prepare("SELECT 1 FROM clients WHERE email = ? AND id != ?").bind(addr, row.id).first())
      fail(409, "Er bestaat al een cliënt met dit e-mailadres.");
    sets.push("email = ?"); vals.push(addr);
  }
  if ("notities" in b) { sets.push("notities = ?"); vals.push(str(b.notities, 10000, "Notities")); }
  if ("profiel" in b) { sets.push("profiel = ?"); vals.push(JSON.stringify(cleanProfiel(b.profiel))); }
  if ("doelen" in b) { const d = cleanDoelen(b.doelen); sets.push("doelen = ?"); vals.push(d ? JSON.stringify(d) : null); }
  if ("programma" in b) {
    const p = b.programma === null ? null : cleanProgramma(b.programma);
    if (p && !(await programDef(c.env, p.id, c.coach.id))) fail(404, "Programma niet gevonden.");
    sets.push("programma = ?"); vals.push(p ? JSON.stringify(p) : null);
  }
  if ("actief" in b) {
    sets.push("actief = ?"); vals.push(b.actief ? 1 : 0);
    if (!b.actief) extra.push(c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(row.id));
  }
  if (!sets.length) fail(400, "Niets om bij te werken.");
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, row.id),
    ...extra,
  ]);
  return getClient(c);
}

async function deleteClient(c) {
  const row = await ownClient(c, c.params[0]);
  await deleteAllFotos(c.env, row.id);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM fotos WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM workouts WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM producten WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM dagboek WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM berichten WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM push_subs WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM notificaties WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM metingen WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM checkins WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(row.id),
  ]);
  return json({ ok: true });
}

async function newInvite(c) {
  const row = await ownClient(c, c.params[0]);
  if (!row.actief) fail(400, "Activeer de cliënt eerst.");
  return json({ link: await issueInvite(c, row.id) });
}

async function coachAddMeting(c) {
  const row = await ownClient(c, c.params[0]);
  return upsertMeting(c, row.id, "coach");
}

async function coachDelMeting(c) {
  const row = await ownClient(c, c.params[0]);
  await c.env.DB.prepare("DELETE FROM metingen WHERE id = ? AND client_id = ?").bind(c.params[1], row.id).run();
  return json({ metingen: await metingenOf(c.env, row.id) });
}

// ---------- progress photos ----------
async function fotosOf(env, clientId) {
  const { results } = await env.DB.prepare(
    "SELECT id, datum, pose, door FROM fotos WHERE client_id = ? ORDER BY datum, pose",
  ).bind(clientId).all();
  return results;
}

// JPEG: FF D8 FF · WebP: "RIFF" .... "WEBP"
function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

async function storeFoto(c, clientId, door) {
  const datum = c.url.searchParams.get("datum"), pose = c.url.searchParams.get("pose");
  if (!isDate(datum)) fail(400, "Ongeldige datum.");
  if (!POSES.includes(pose)) fail(400, "Kies voor, achter of zijkant.");
  if (Number(c.req.headers.get("content-length")) > MAX_FOTO) fail(413, "De foto is te groot (max. 5 MB).");
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > MAX_FOTO) fail(413, "De foto is te groot (max. 5 MB).");
  const type = buf.length > 12 ? imageType(buf) : null;
  if (!type) fail(415, "Upload een JPEG- of WebP-foto.");
  const old = await c.env.DB.prepare("SELECT id, r2_key FROM fotos WHERE client_id = ? AND datum = ? AND pose = ?")
    .bind(clientId, datum, pose).first();
  const key = `c/${clientId}/${datum}-${pose}-${randomToken(9)}`;
  await c.env.FOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  // a replaced photo gets a new id, so browsers never show a cached older version
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM fotos WHERE client_id = ? AND datum = ? AND pose = ?").bind(clientId, datum, pose),
    c.env.DB.prepare("INSERT INTO fotos (client_id, datum, pose, r2_key, type, bytes, door, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(clientId, datum, pose, key, type, buf.length, door, c.now),
  ]);
  if (old) await c.env.FOTOS.delete(old.r2_key);
  return json({ fotos: await fotosOf(c.env, clientId) }, 201);
}

async function serveFoto(env, row) {
  const obj = row && await env.FOTOS.get(row.r2_key);
  if (!obj) fail(404, "Foto niet gevonden.");
  return new Response(obj.body, {
    headers: {
      "content-type": row.type, "content-length": String(row.bytes),
      "cache-control": "private, max-age=3600", "content-disposition": "inline",
    },
  });
}

async function removeFoto(c, clientId, fotoId) {
  const row = await c.env.DB.prepare("SELECT r2_key FROM fotos WHERE id = ? AND client_id = ?").bind(fotoId, clientId).first();
  if (row) {
    await c.env.DB.prepare("DELETE FROM fotos WHERE id = ?").bind(fotoId).run();
    await c.env.FOTOS.delete(row.r2_key);
  }
  return json({ fotos: await fotosOf(c.env, clientId) });
}

async function deleteAllFotos(env, clientId) {
  for (const prefix of [`c/${clientId}/`, `m/${clientId}/`]) await deletePrefix(env, prefix);
}
async function deletePrefix(env, prefix) {
  let cursor;
  do {
    const list = await env.FOTOS.list({ prefix, cursor });
    if (list.objects.length) await env.FOTOS.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

async function clientGetFoto(c) {
  const row = await c.env.DB.prepare("SELECT r2_key, type, bytes FROM fotos WHERE id = ? AND client_id = ?")
    .bind(c.params[0], c.client.id).first();
  return serveFoto(c.env, row);
}
function clientDelFoto(c) { return removeFoto(c, c.client.id, c.params[0]); }

async function coachAddFoto(c) {
  const row = await ownClient(c, c.params[0]);
  return storeFoto(c, row.id, "coach");
}
async function coachGetFoto(c) {
  const row = await c.env.DB.prepare(
    "SELECT f.r2_key, f.type, f.bytes FROM fotos f JOIN clients cl ON cl.id = f.client_id WHERE f.id = ? AND cl.coach_id = ?",
  ).bind(c.params[0], c.coach.id).first();
  return serveFoto(c.env, row);
}
async function coachDelFoto(c) {
  const row = await ownClient(c, c.params[0]);
  return removeFoto(c, row.id, c.params[1]);
}

// ---------- training ----------
function cleanProgramma(p) {
  if (!p || typeof p !== "object" || !(PROGRAMMAS[p.id] || /^c\d{1,9}$/.test(p.id))) fail(400, "Onbekend trainingsprogramma.");
  if (!isDate(p.start)) fail(400, "Kies een geldige startdatum.");
  return { id: p.id, start: p.start };
}
// program definition (built-in or a coach's own); null when the id is unknown
async function programDef(env, id, coachId) {
  if (PROGRAMMAS[id]) return { ...PROGRAMMAS[id], custom: false };
  const m = /^c(\d+)$/.exec(id || "");
  if (!m) return null;
  const r = await env.DB.prepare("SELECT id, coach_id, naam, data FROM programmas WHERE id = ?").bind(Number(m[1])).first();
  if (!r || (coachId && r.coach_id !== coachId)) return null;
  const data = JSON.parse(r.data);
  return { id, naam: r.naam, custom: true, weken: data.weken, dagen: data.dagen.map((d) => d.key), data };
}
function cleanProgramDef(b) {
  const naam = str(b && b.naam, 60, "Naam");
  if (!naam) fail(400, "Geef het programma een naam.");
  const d = b.data || {};
  const weken = Number(d.weken);
  if (!Number.isInteger(weken) || weken < 1 || weken > 16) fail(400, "Kies 1 tot 16 weken.");
  const oefeningen = {};
  for (const [k, e] of Object.entries(d.oefeningen || {})) {
    if (!/^c_[a-z0-9]{4,20}$/.test(k)) fail(400, "Ongeldige eigen oefening.");
    if (Object.keys(oefeningen).length >= 60) fail(400, "Maximaal 60 eigen oefeningen per programma.");
    const n = str(e && e.n, 60, "Naam oefening");
    if (!n) fail(400, "Geef elke eigen oefening een naam.");
    const m = (Array.isArray(e.m) ? e.m : []).filter((x) => MUSCLES.includes(x)).slice(0, 3);
    if (!m.length) fail(400, `Kies de spiergroep van "${n}".`);
    oefeningen[k] = { n, eq: EQUIP.includes(e.eq) ? e.eq : "Overig", m, s: (Array.isArray(e.s) ? e.s : []).filter((x) => MUSCLES.includes(x) && !m.includes(x)).slice(0, 3),
      rust: Math.min(300, Math.max(30, Math.round(Number(e.rust) || 90))), cue: str(e.cue, 300, "Uitleg") || "Voer de oefening gecontroleerd uit over de volledige bewegingsbaan." };
  }
  const dagenIn = Array.isArray(d.dagen) ? d.dagen : [];
  if (!dagenIn.length || dagenIn.length > 7) fail(400, "Een programma heeft 1 tot 7 trainingsdagen.");
  const dagen = dagenIn.map((day, i) => {
    const dn = str(day && day.naam, 40, "Naam dag") || `Dag ${i + 1}`;
    const ex = (Array.isArray(day.ex) ? day.ex : []).map((x) => {
      const id = String(x && x.id || "");
      if (!BASE_EX.has(id) && !oefeningen[id]) fail(400, `Onbekende oefening op ${dn}.`);
      const reps = (Array.isArray(x.reps) ? x.reps : []).map(Number);
      if (!reps.length || reps.length > 10 || reps.some((r) => !Number.isInteger(r) || r < 1 || r > 100)) fail(400, `Controleer de herhalingen op ${dn} (1 tot 10 sets van 1–100).`);
      return { id, reps };
    });
    if (!ex.length || ex.length > 15) fail(400, `${dn} heeft 1 tot 15 oefeningen nodig.`);
    return { key: `d${i + 1}`, naam: dn, focus: str(day.focus, 80, "Focus"), type: DAYTYPES.includes(day.type) ? day.type : "other", ex };
  });
  return { naam, data: { weken, deload: !!d.deload && weken > 1, dagen, oefeningen } };
}

// sets: {exerciseId: [{kg, reps, ok}]} — shape and ranges only; exercise ids are defined client-side
function cleanSets(sets) {
  if (!sets || typeof sets !== "object" || Array.isArray(sets)) fail(400, "Ongeldige sets.");
  const keys = Object.keys(sets);
  if (keys.length > 15) fail(400, "Te veel oefeningen.");
  const out = {};
  for (const k of keys) {
    if (!/^[a-z0-9_]{1,40}$/.test(k) || !Array.isArray(sets[k]) || sets[k].length > 10) fail(400, "Ongeldige sets.");
    out[k] = sets[k].map((s) => ({
      kg: s && s.kg !== null && s.kg !== undefined && s.kg !== "" ? num(s.kg, 0, 1000, "Gewicht") : null,
      reps: s && s.reps !== null && s.reps !== undefined && s.reps !== "" ? Math.round(num(s.reps, 0, 500, "Herhalingen")) : null,
      ok: !!(s && s.ok),
    }));
  }
  return out;
}

async function workoutsOf(env, client) {
  if (!client.programma) return [];
  const p = JSON.parse(client.programma);
  const { results } = await env.DB.prepare(
    "SELECT week, dag, datum, sets, notitie, afgerond, updated_at FROM workouts WHERE client_id = ? AND programma = ? ORDER BY week, dag",
  ).bind(client.id, p.id).all();
  return results.map((w) => ({ ...w, sets: JSON.parse(w.sets) }));
}

async function clientPutWorkout(c) {
  const cl = c.client;
  if (!cl.programma) fail(400, "Er is geen trainingsprogramma toegewezen.");
  const p = JSON.parse(cl.programma), def = await programDef(c.env, p.id, cl.coach_id), b = c.body;
  if (!def) fail(409, "Uw trainingsprogramma bestaat niet meer. Neem contact op met uw coach.");
  if (b.programma !== p.id) fail(409, "Uw trainingsprogramma is gewijzigd. Vernieuw de pagina.");
  const week = Number(b.week);
  if (!Number.isInteger(week) || week < 1 || week > def.weken) fail(400, "Ongeldige week.");
  if (!def.dagen.includes(b.dag)) fail(400, "Ongeldige trainingsdag.");
  if (!isDate(b.datum)) fail(400, "Ongeldige datum.");
  const sets = JSON.stringify(cleanSets(b.sets));
  const notitie = str(b.notitie, 1000, "Notitie");
  await c.env.DB.prepare(
    `INSERT INTO workouts (client_id, programma, week, dag, datum, sets, notitie, afgerond, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id, programma, week, dag) DO UPDATE SET
       datum = excluded.datum, sets = excluded.sets, notitie = excluded.notitie,
       afgerond = CASE WHEN excluded.afgerond IS NULL THEN NULL ELSE COALESCE(workouts.afgerond, excluded.afgerond) END,
       updated_at = excluded.updated_at`,
  ).bind(cl.id, p.id, week, b.dag, b.datum, sets, notitie, b.afgerond ? c.now : null, c.now).run();
  return json({ workouts: await workoutsOf(c.env, cl) });
}

// ---------- own products ----------
const ROLLEN = ["eiwit", "koolh", "vet", "fruit"];
const MENU_MAALTIJDEN = ["ontbijt", "hoofd", "snack"];
const MAALTIJDEN = ["ontbijt", "lunch", "avond", "snack"];

async function productenOf(env, clientId) {
  const { results } = await env.DB.prepare(
    `SELECT id, naam, merk, barcode, kcal, eiwit, koolh, vet, vezels, portie_naam, portie_g, in_menu, rol, maaltijden, bron
     FROM producten WHERE client_id = ? ORDER BY naam COLLATE NOCASE`,
  ).bind(clientId).all();
  return results.map((p) => ({ ...p, in_menu: !!p.in_menu, maaltijden: JSON.parse(p.maaltijden) }));
}

function cleanProduct(b) {
  const naam = str(b.naam, 80, "Naam");
  if (!naam) fail(400, "Geef het product een naam.");
  const barcode = b.barcode ? String(b.barcode).trim() : null;
  if (barcode && !/^\d{8,14}$/.test(barcode)) fail(400, "Een barcode bestaat uit 8 tot 14 cijfers.");
  const p = {
    naam, merk: str(b.merk, 60, "Merk"), barcode,
    kcal: num(b.kcal, 0, 900, "Calorieën per 100 g", true),
    eiwit: num(b.eiwit, 0, 100, "Eiwit per 100 g", true),
    koolh: num(b.koolh, 0, 100, "Koolhydraten per 100 g", true),
    vet: num(b.vet, 0, 100, "Vet per 100 g", true),
    vezels: num(b.vezels, 0, 100, "Vezels per 100 g") || 0,
    portie_naam: str(b.portie_naam, 20, "Portienaam") || null,
    portie_g: num(b.portie_g, 1, 2000, "Portiegewicht"),
  };
  if (p.eiwit + p.koolh + p.vet + p.vezels > 101) fail(400, "Eiwit, koolhydraten, vet en vezels samen kunnen niet meer dan 100 g per 100 g zijn.");
  if (p.portie_g && !p.portie_naam) p.portie_naam = "portie";
  if (!p.portie_g) p.portie_naam = null;
  p.in_menu = !!b.in_menu;
  p.rol = p.in_menu ? (ROLLEN.includes(b.rol) ? b.rol : fail(400, "Kies de rol van het product in uw menu.")) : null;
  p.maaltijden = p.in_menu ? [...new Set((Array.isArray(b.maaltijden) ? b.maaltijden : []).filter((m) => MENU_MAALTIJDEN.includes(m)))] : [];
  if (p.in_menu && !p.maaltijden.length) fail(400, "Kies bij welke maaltijden het product mag voorkomen.");
  p.bron = ["handmatig", "barcode", "foto"].includes(b.bron) ? b.bron : "handmatig";
  return p;
}

async function clientAddProduct(c) {
  const p = cleanProduct(c.body);
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM producten WHERE client_id = ?").bind(c.client.id).first();
  if (n.n >= 500) fail(400, "U heeft het maximum van 500 producten bereikt.");
  if (p.barcode && await c.env.DB.prepare("SELECT 1 FROM producten WHERE client_id = ? AND barcode = ?").bind(c.client.id, p.barcode).first())
    fail(409, "U heeft al een product met deze barcode.");
  const { meta } = await c.env.DB.prepare(
    `INSERT INTO producten (client_id, naam, merk, barcode, kcal, eiwit, koolh, vet, vezels, portie_naam, portie_g, in_menu, rol, maaltijden, bron, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(c.client.id, p.naam, p.merk, p.barcode, p.kcal, p.eiwit, p.koolh, p.vet, p.vezels, p.portie_naam, p.portie_g,
    p.in_menu ? 1 : 0, p.rol, JSON.stringify(p.maaltijden), p.bron, c.now, c.now).run();
  return json({ id: meta.last_row_id, producten: await productenOf(c.env, c.client.id) }, 201);
}

async function clientPutProduct(c) {
  const p = cleanProduct(c.body);
  if (p.barcode && await c.env.DB.prepare("SELECT 1 FROM producten WHERE client_id = ? AND barcode = ? AND id != ?").bind(c.client.id, p.barcode, c.params[0]).first())
    fail(409, "U heeft al een product met deze barcode.");
  const r = await c.env.DB.prepare(
    `UPDATE producten SET naam = ?, merk = ?, barcode = ?, kcal = ?, eiwit = ?, koolh = ?, vet = ?, vezels = ?, portie_naam = ?, portie_g = ?,
       in_menu = ?, rol = ?, maaltijden = ?, updated_at = ? WHERE id = ? AND client_id = ?`,
  ).bind(p.naam, p.merk, p.barcode, p.kcal, p.eiwit, p.koolh, p.vet, p.vezels, p.portie_naam, p.portie_g,
    p.in_menu ? 1 : 0, p.rol, JSON.stringify(p.maaltijden), c.now, c.params[0], c.client.id).run();
  if (!r.meta.changes) fail(404, "Product niet gevonden.");
  return json({ producten: await productenOf(c.env, c.client.id) });
}

async function clientDelProduct(c) {
  await c.env.DB.prepare("DELETE FROM producten WHERE id = ? AND client_id = ?").bind(c.params[0], c.client.id).run();
  return json({ producten: await productenOf(c.env, c.client.id) });
}

// Open Food Facts lookup, proxied so the client only talks to us (and OFF only sees our server)
async function barcodeLookup(c) {
  const code = String(c.params[0]);
  const own = await c.env.DB.prepare("SELECT id FROM producten WHERE client_id = ? AND barcode = ?").bind(c.client.id, code).first();
  if (own) return json({ bron: "eigen", id: own.id });
  let data;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_nl,brands,nutriments,serving_size,serving_quantity`, {
      headers: { "user-agent": "DCRAMERE-Coaching/1.0 (+https://dcramere-voeding.dcramere.workers.dev)" },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (r.status === 404) return json({ bron: null });
    if (!r.ok) fail(502, "De productdatabase is nu niet bereikbaar. Vul de waarden handmatig in.");
    data = await r.json();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(502, "De productdatabase is nu niet bereikbaar. Vul de waarden handmatig in.");
  }
  if (!data || data.status !== 1 || !data.product) return json({ bron: null });
  const p = data.product, n = p.nutriments || {};
  const v = (k) => (Number.isFinite(+n[k]) ? Math.round(+n[k] * 10) / 10 : null);
  let kcal = v("energy-kcal_100g");
  if (kcal == null && v("energy_100g") != null) kcal = Math.round(v("energy_100g") / 4.184);
  return json({
    bron: "openfoodfacts",
    product: {
      naam: (p.product_name_nl || p.product_name || "").trim().slice(0, 80), merk: (p.brands || "").split(",")[0].trim().slice(0, 60),
      barcode: code, kcal, eiwit: v("proteins_100g"), koolh: v("carbohydrates_100g"), vet: v("fat_100g"), vezels: v("fiber_100g"),
      portie_g: Number.isFinite(+p.serving_quantity) && +p.serving_quantity > 0 ? Math.round(+p.serving_quantity) : null,
    },
  });
}

// AI label reader: the photo is only sent to Workers AI for this request and never stored
const LABEL_PROMPT = `You read nutrition facts labels. Return ONLY a JSON object, no other text:
{"naam": product name if visible else "", "per": "100g" or "portie", "portie_g": serving size in grams or null,
 "kcal": energy in kcal, "kj": energy in kJ or null, "eiwit": protein g, "koolh": total carbohydrates g, "vezels": fibre g or null,
 "vet": total fat g, "label": "EU" if carbohydrates exclude fibre (European style table) or "US" if it is a US "Nutrition Facts" table}
Use the per-100 g column when the label has one; otherwise use the per-serving values and set "per":"portie".
Use numbers with a dot as decimal separator. If the image is not a nutrition label return {"fout": "geen etiket"}.`;

async function labelScan(c) {
  if (!c.env.AI) fail(503, "Etiket scannen is hier niet beschikbaar. Vul de waarden handmatig in.");
  const key = `ai:${c.client.id}`;
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND ts > ?").bind(key, c.now - DAY).first();
  if (used.n >= 25) fail(429, "U heeft vandaag al 25 etiketten gescand. Probeer het morgen opnieuw of vul de waarden handmatig in.");
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > MAX_FOTO) fail(413, "De foto is te groot (max. 5 MB).");
  const type = buf.length > 12 ? imageType(buf) : null;
  if (!type) fail(415, "Upload een JPEG- of WebP-foto.");
  await c.env.DB.prepare("INSERT INTO login_attempts (k, ts) VALUES (?, ?)").bind(key, c.now).run();
  let b64 = ""; for (let i = 0; i < buf.length; i += 0x8000) b64 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  let out;
  try {
    const res = await c.env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [{ role: "user", content: [
        { type: "text", text: LABEL_PROMPT },
        { type: "image_url", image_url: { url: `data:${type};base64,${btoa(b64)}` } },
      ] }],
      max_tokens: 300, temperature: 0,
    });
    const text = typeof res.response === "string" ? res.response : JSON.stringify(res.response);
    out = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
  } catch (e) {
    console.error("label scan failed", e);
    fail(502, "Het etiket kon niet worden gelezen. Probeer een scherpere foto of vul de waarden handmatig in.");
  }
  if (out.fout) fail(422, "Op deze foto is geen voedingswaardetabel te herkennen.");
  const f = (x) => (x === null || x === undefined || x === "" || !Number.isFinite(+x) ? null : +x);
  let kcal = f(out.kcal), eiwit = f(out.eiwit), koolh = f(out.koolh), vet = f(out.vet), vezels = f(out.vezels);
  if (kcal == null && f(out.kj) != null) kcal = f(out.kj) / 4.184;
  if (out.label === "US" && koolh != null && vezels != null) koolh = Math.max(0, koolh - vezels); // our carbs exclude fibre
  const portie = f(out.portie_g);
  if (out.per === "portie") {
    if (!portie) fail(422, "Het etiket geeft alleen waarden per portie zonder gewicht. Vul de waarden per 100 g handmatig in.");
    const k = 100 / portie; [kcal, eiwit, koolh, vet, vezels] = [kcal, eiwit, koolh, vet, vezels].map((x) => (x == null ? null : x * k));
  }
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return json({ product: { naam: String(out.naam || "").slice(0, 80), kcal: kcal == null ? null : Math.round(kcal), eiwit: r1(eiwit), koolh: r1(koolh), vet: r1(vet), vezels: r1(vezels), portie_g: portie ? Math.round(portie) : null } });
}

// ---------- food diary ----------
async function dagboekOf(env, clientId, van, tot) {
  const { results } = await env.DB.prepare(
    "SELECT id, datum, maaltijd, naam, bron, ref, gram, kcal, eiwit, koolh, vet FROM dagboek WHERE client_id = ? AND datum BETWEEN ? AND ? ORDER BY datum, id",
  ).bind(clientId, van, tot).all();
  return results;
}
async function recentOf(env, clientId) {
  const { results } = await env.DB.prepare(
    `SELECT naam, bron, ref, gram FROM dagboek WHERE id IN (SELECT MAX(id) FROM dagboek WHERE client_id = ? AND bron != 'menu' GROUP BY naam)
     ORDER BY id DESC LIMIT 20`,
  ).bind(clientId).all();
  return results;
}
function cleanEntry(b) {
  const naam = str(b.naam, 120, "Naam");
  if (!naam) fail(400, "Onbekend product.");
  return {
    naam, bron: ["basis", "eigen", "menu"].includes(b.bron) ? b.bron : fail(400, "Ongeldige bron."),
    ref: str(b.ref, 80, "Referentie"),
    gram: num(b.gram, 0.1, 5000, "Hoeveelheid", true),
    kcal: num(b.kcal, 0, 10000, "Calorieën", true), eiwit: num(b.eiwit, 0, 1000, "Eiwit", true),
    koolh: num(b.koolh, 0, 1000, "Koolhydraten", true), vet: num(b.vet, 0, 1000, "Vet", true),
  };
}
async function clientGetDagboek(c) {
  const datum = c.url.searchParams.get("datum") || new Date().toISOString().slice(0, 10);
  if (!isDate(datum)) fail(400, "Ongeldige datum.");
  const [items, recent] = await Promise.all([dagboekOf(c.env, c.client.id, datum, datum), recentOf(c.env, c.client.id)]);
  return json({ datum, items, recent });
}
async function clientAddDagboek(c) {
  const b = c.body;
  if (!isDate(b.datum)) fail(400, "Ongeldige datum.");
  if (!MAALTIJDEN.includes(b.maaltijd)) fail(400, "Kies een maaltijd.");
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 20) fail(400, "Voeg 1 tot 20 producten tegelijk toe.");
  const clean = items.map(cleanEntry);
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM dagboek WHERE client_id = ? AND datum = ?").bind(c.client.id, b.datum).first();
  if (n.n + clean.length > 150) fail(400, "Maximaal 150 regels per dag.");
  await c.env.DB.batch(clean.map((e) => c.env.DB.prepare(
    "INSERT INTO dagboek (client_id, datum, maaltijd, naam, bron, ref, gram, kcal, eiwit, koolh, vet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(c.client.id, b.datum, b.maaltijd, e.naam, e.bron, e.ref, e.gram, e.kcal, e.eiwit, e.koolh, e.vet, c.now)));
  return json({ datum: b.datum, items: await dagboekOf(c.env, c.client.id, b.datum, b.datum), recent: await recentOf(c.env, c.client.id) }, 201);
}
async function clientPutDagboek(c) {
  const row = await c.env.DB.prepare("SELECT datum FROM dagboek WHERE id = ? AND client_id = ?").bind(c.params[0], c.client.id).first();
  if (!row) fail(404, "Regel niet gevonden.");
  const e = cleanEntry(c.body);
  const maaltijd = MAALTIJDEN.includes(c.body.maaltijd) ? c.body.maaltijd : null;
  await c.env.DB.prepare(
    "UPDATE dagboek SET gram = ?, kcal = ?, eiwit = ?, koolh = ?, vet = ?, maaltijd = COALESCE(?, maaltijd) WHERE id = ? AND client_id = ?",
  ).bind(e.gram, e.kcal, e.eiwit, e.koolh, e.vet, maaltijd, c.params[0], c.client.id).run();
  return json({ datum: row.datum, items: await dagboekOf(c.env, c.client.id, row.datum, row.datum) });
}
async function clientDelDagboek(c) {
  const row = await c.env.DB.prepare("SELECT datum FROM dagboek WHERE id = ? AND client_id = ?").bind(c.params[0], c.client.id).first();
  if (!row) fail(404, "Regel niet gevonden.");
  await c.env.DB.prepare("DELETE FROM dagboek WHERE id = ? AND client_id = ?").bind(c.params[0], c.client.id).run();
  return json({ datum: row.datum, items: await dagboekOf(c.env, c.client.id, row.datum, row.datum) });
}
async function coachGetDagboek(c) {
  const row = await ownClient(c, c.params[0]);
  const tot = c.url.searchParams.get("tot"), van = c.url.searchParams.get("van");
  if (!isDate(tot) || !isDate(van) || van > tot || (Date.parse(tot) - Date.parse(van)) / 864e5 > 62) fail(400, "Ongeldige periode (max. 62 dagen).");
  return json({ items: await dagboekOf(c.env, row.id, van, tot) });
}

// ---------- Stripe ----------
// Plain REST calls (no SDK). The API version is pinned so subscription.current_period_end stays top-level.
const STRIPE_VERSION = "2024-06-20";
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}
async function stripe(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) fail(503, "Betalingen zijn nog niet ingesteld.");
  const q = params ? formEncode(params) : "";
  const r = await fetch(`${env.STRIPE_API_BASE || "https://api.stripe.com"}/v1${path}${method === "GET" && q ? "?" + q : ""}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "stripe-version": STRIPE_VERSION,
      ...(method !== "GET" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: method !== "GET" ? q : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("stripe error", method, path, JSON.stringify(d)); fail(502, "De betaalprovider gaf een fout. Probeer het later opnieuw."); }
  return d;
}
const billingReady = (env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_CLIENT && env.STRIPE_PRICE_COACH);
const ownerCoach = (env) => env.DB.prepare("SELECT id FROM coaches WHERE is_owner = 1 ORDER BY id LIMIT 1").first();
const subFields = (sub) => ({ id: sub.id, status: sub.status, einde: sub.current_period_end || null, customer: typeof sub.customer === "string" ? sub.customer : sub.customer && sub.customer.id });

async function prijzen(c) {
  if (!billingReady(c.env)) {
    // not connected to Stripe yet: show the configured prices, sign-up stays closed
    const f = (v) => (Number(v) > 0 ? { bedrag: Number(v), valuta: c.env.VALUTA || "USD", interval: "month" } : null);
    return json({ beschikbaar: false, client: f(c.env.PRIJS_CLIENT), coach: f(c.env.PRIJS_COACH) });
  }
  const key = new Request(`${c.url.origin}/__prijzen/${c.env.STRIPE_PRICE_CLIENT}/${c.env.STRIPE_PRICE_COACH}`);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const [pc, pk] = await Promise.all([
    stripe(c.env, "GET", `/prices/${c.env.STRIPE_PRICE_CLIENT}`), stripe(c.env, "GET", `/prices/${c.env.STRIPE_PRICE_COACH}`)]);
  const f = (p) => ({ bedrag: p.unit_amount / 100, valuta: String(p.currency).toUpperCase(), interval: (p.recurring && p.recurring.interval) || "month" });
  const res = json({ beschikbaar: true, client: f(pc), coach: f(pk) }, 200, { "cache-control": "public, max-age=600" });
  c.ctx?.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

// --- clients: subscribe to the owner's coaching from the landing page
async function checkoutGuard(c) {
  if (!billingReady(c.env)) fail(503, "Betalingen zijn nog niet ingesteld. Probeer het later opnieuw.");
  const keys = [`co:${clientIp(c)}`];
  await throttle(c, keys);
  await recordFailure(c, keys); // counts attempts: max 8 checkouts per 15 min per IP
}
async function clientCheckout(c) {
  await checkoutGuard(c);
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const addr = email(c.body.email);
  if (c.body.akkoord !== true) fail(400, "Ga akkoord met de voorwaarden en de privacyverklaring.");
  const existing = await c.env.DB.prepare("SELECT abo_status FROM clients WHERE email = ?").bind(addr).first();
  if (existing && !existing.abo_status) fail(409, "Dit e-mailadres heeft al een account via een coach. Log in via de app.");
  if (existing && ACTIVE_SUB.includes(existing.abo_status)) fail(409, "Er is al een actief abonnement voor dit e-mailadres. Log in via de app.");
  const owner = await ownerCoach(c.env);
  if (!owner) fail(503, "Aanmelden is nog niet mogelijk.");
  const s = await stripe(c.env, "POST", "/checkout/sessions", {
    mode: "subscription", line_items: [{ price: c.env.STRIPE_PRICE_CLIENT, quantity: 1 }],
    customer_email: addr, locale: "nl", allow_promotion_codes: "true",
    metadata: { type: "client", naam, email: addr, coach_id: String(owner.id) },
    subscription_data: { metadata: { type: "client", email: addr } },
    success_url: `${c.url.origin}/app/?betaald={CHECKOUT_SESSION_ID}`, cancel_url: `${c.url.origin}/#prijzen`,
  });
  return json({ url: s.url });
}
async function provisionClient(env, s, now) {
  const addr = String((s.metadata && s.metadata.email) || (s.customer_details && s.customer_details.email) || s.customer_email || "").toLowerCase();
  if (!addr) fail(400, "Onbekend e-mailadres in de betaling.");
  const sub = subFields(typeof s.subscription === "object" && s.subscription ? s.subscription : await stripe(env, "GET", `/subscriptions/${s.subscription}`));
  const row = await env.DB.prepare("SELECT id FROM clients WHERE email = ?").bind(addr).first();
  if (row) {
    await env.DB.prepare("UPDATE clients SET stripe_customer = ?, stripe_subscription = ?, abo_status = ?, abo_einde = ?, actief = 1 WHERE id = ?")
      .bind(sub.customer, sub.id, sub.status, sub.einde, row.id).run();
    return row.id;
  }
  const coachId = Number(s.metadata && s.metadata.coach_id) || (await ownerCoach(env)).id;
  const naam = String((s.metadata && s.metadata.naam) || (s.customer_details && s.customer_details.name) || addr).slice(0, 100);
  const { meta } = await env.DB.prepare(
    "INSERT INTO clients (coach_id, naam, email, created_at, stripe_customer, stripe_subscription, abo_status, abo_einde) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(coachId, naam, addr, now, sub.customer, sub.id, sub.status, sub.einde).run();
  return meta.last_row_id;
}
// the success page calls this right after paying; it provisions idempotently (the webhook may still be on its way)
async function clientCheckoutStatus(c) {
  const sid = c.url.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]{8,}$/.test(sid)) fail(400, "Ongeldige betaling.");
  const s = await stripe(c.env, "GET", `/checkout/sessions/${sid}`, { expand: ["subscription"] });
  if (!s.metadata || s.metadata.type !== "client") fail(404, "Betaling niet gevonden.");
  if (s.status !== "complete") return json({ status: s.status });
  const id = await provisionClient(c.env, s, c.now);
  const row = await c.env.DB.prepare("SELECT naam, email, pw_hash FROM clients WHERE id = ?").bind(id).first();
  if (row.pw_hash) return json({ status: "complete", login: true, email: row.email });
  return json({ status: "complete", invite: await issueInviteToken(c.env, id, c.now), naam: row.naam, email: row.email });
}
async function clientPortal(c) {
  if (!c.client.stripe_customer) fail(400, "Uw abonnement loopt via uw coach. Neem contact op met uw coach.");
  const p = await stripe(c.env, "POST", "/billing_portal/sessions", { customer: c.client.stripe_customer, return_url: `${c.url.origin}/app/`, locale: "nl", configuration: c.env.STRIPE_PORTAL_CONFIG || undefined });
  return json({ url: p.url });
}
async function clientResubscribe(c) {
  if (!billingReady(c.env)) fail(503, "Betalingen zijn nog niet ingesteld.");
  if (c.client.abo_status && ACTIVE_SUB.includes(c.client.abo_status)) fail(409, "Uw abonnement is al actief.");
  if (!c.client.abo_status) fail(400, "Uw toegang loopt via uw coach.");
  const s = await stripe(c.env, "POST", "/checkout/sessions", {
    mode: "subscription", line_items: [{ price: c.env.STRIPE_PRICE_CLIENT, quantity: 1 }], locale: "nl",
    ...(c.client.stripe_customer ? { customer: c.client.stripe_customer } : { customer_email: c.client.email }),
    metadata: { type: "client", naam: c.client.naam, email: c.client.email, coach_id: String(c.client.coach_id) },
    subscription_data: { metadata: { type: "client", email: c.client.email } },
    success_url: `${c.url.origin}/app/?betaald={CHECKOUT_SESSION_ID}`, cancel_url: `${c.url.origin}/app/`,
  });
  return json({ url: s.url });
}

// --- coaches: platform subscription
async function coachMeInfo(c) {
  const k = c.coach;
  return json({ id: k.id, naam: k.naam, email: k.email, isOwner: !!k.is_owner, status: k.is_owner ? "actief" : k.status,
    aboStatus: k.abo_status, aboEinde: k.abo_einde, portaal: !!k.stripe_customer, betalingen: billingReady(c.env) });
}
async function coachSessionFor(c, coachId, customer, mail) {
  return stripe(c.env, "POST", "/checkout/sessions", {
    mode: "subscription", line_items: [{ price: c.env.STRIPE_PRICE_COACH, quantity: 1 }], locale: "nl", allow_promotion_codes: "true",
    ...(customer ? { customer } : { customer_email: mail }),
    client_reference_id: String(coachId),
    metadata: { type: "coach", coach_id: String(coachId) }, subscription_data: { metadata: { type: "coach", coach_id: String(coachId) } },
    success_url: `${c.url.origin}/coach/?betaald={CHECKOUT_SESSION_ID}`, cancel_url: `${c.url.origin}/coach/`,
  });
}
async function coachSignup(c) {
  await checkoutGuard(c);
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const addr = email(c.body.email);
  const pw = c.body.password;
  if (typeof pw !== "string" || pw.length < 10) fail(400, "Kies een wachtwoord van minimaal 10 tekens.");
  if (c.body.akkoord !== true) fail(400, "Ga akkoord met de voorwaarden en de privacyverklaring.");
  if (await c.env.DB.prepare("SELECT 1 FROM coaches WHERE email = ?").bind(addr).first()) fail(409, "Er bestaat al een coach-account met dit e-mailadres. Log in.");
  const { meta } = await c.env.DB.prepare("INSERT INTO coaches (email, naam, pw_hash, created_at, is_owner, status) VALUES (?, ?, ?, ?, 0, 'betaling')")
    .bind(addr, naam, await hashPassword(pw), c.now).run();
  const s = await coachSessionFor(c, meta.last_row_id, null, addr);
  return json({ url: s.url }, 201, { "set-cookie": await startSession(c, "coach", meta.last_row_id) });
}
async function coachCheckout(c) {
  if (c.coach.is_owner) fail(400, "Het eigenaarsaccount heeft geen abonnement nodig.");
  if (!billingReady(c.env)) fail(503, "Betalingen zijn nog niet ingesteld.");
  if (c.coach.status === "actief") fail(409, "Uw abonnement is al actief.");
  return json({ url: (await coachSessionFor(c, c.coach.id, c.coach.stripe_customer, c.coach.email)).url });
}
async function provisionCoach(env, s) {
  const coachId = Number(s.metadata && s.metadata.coach_id);
  if (!coachId) return;
  const sub = subFields(typeof s.subscription === "object" && s.subscription ? s.subscription : await stripe(env, "GET", `/subscriptions/${s.subscription}`));
  await env.DB.prepare(
    "UPDATE coaches SET stripe_customer = ?, stripe_subscription = ?, abo_status = ?, abo_einde = ?, status = ? WHERE id = ? AND is_owner = 0",
  ).bind(sub.customer, sub.id, sub.status, sub.einde, ACTIVE_SUB.includes(sub.status) ? "actief" : "verlopen", coachId).run();
}
async function coachCheckoutStatus(c) {
  const sid = c.url.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]{8,}$/.test(sid)) fail(400, "Ongeldige betaling.");
  const s = await stripe(c.env, "GET", `/checkout/sessions/${sid}`, { expand: ["subscription"] });
  if (!s.metadata || s.metadata.type !== "coach" || Number(s.metadata.coach_id) !== c.coach.id) fail(404, "Betaling niet gevonden.");
  if (s.status === "complete") await provisionCoach(c.env, s);
  const k = await c.env.DB.prepare("SELECT status FROM coaches WHERE id = ?").bind(c.coach.id).first();
  return json({ status: s.status, coachStatus: k.status });
}
async function coachPortal(c) {
  if (!c.coach.stripe_customer) fail(400, "Er is nog geen abonnement om te beheren.");
  const p = await stripe(c.env, "POST", "/billing_portal/sessions", { customer: c.coach.stripe_customer, return_url: `${c.url.origin}/coach/`, locale: "nl", configuration: c.env.STRIPE_PORTAL_CONFIG || undefined });
  return json({ url: p.url });
}
async function ownerCoaches(c) {
  if (!c.coach.is_owner) fail(403, "Alleen voor de eigenaar van het platform.");
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.naam, k.email, k.is_owner, k.status, k.abo_status, k.abo_einde, k.created_at,
       (SELECT COUNT(*) FROM clients c WHERE c.coach_id = k.id) AS clienten,
       (SELECT COUNT(*) FROM clients c WHERE c.coach_id = k.id AND c.abo_status IN ('active','trialing','past_due')) AS betalend
     FROM coaches k ORDER BY k.is_owner DESC, k.created_at DESC`,
  ).all();
  return json(results);
}

// --- webhook: signature check (HMAC-SHA256 over "t.payload"), idempotent per event id
async function verifyStripeSignature(env, header, payload, now) {
  if (!env.STRIPE_WEBHOOK_SECRET) fail(503, "Webhook niet ingesteld.");
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] === "t"));
  const sigs = String(header || "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(now - t) > 300) fail(400, "Ongeldige handtekening.");
  const key = await crypto.subtle.importKey("raw", enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!sigs.some((s) => safeEqual(s, hex))) fail(400, "Ongeldige handtekening.");
}
async function stripeWebhook(c) {
  const payload = await c.req.text();
  if (payload.length > 200000) fail(413, "Te groot.");
  await verifyStripeSignature(c.env, c.req.headers.get("stripe-signature"), payload, c.now);
  const ev = JSON.parse(payload);
  const ins = await c.env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)").bind(ev.id, ev.type, c.now).run();
  if (!ins.meta.changes) return json({ ok: true, dubbel: true });
  const o = ev.data && ev.data.object;
  try {
    if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
      if (o.metadata && o.metadata.type === "client") await provisionClient(c.env, o, c.now);
      else if (o.metadata && o.metadata.type === "coach") await provisionCoach(c.env, o);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(ev.type)) {
      const sub = subFields(o);
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE clients SET abo_status = ?, abo_einde = ? WHERE stripe_subscription = ?").bind(sub.status, sub.einde, sub.id),
        c.env.DB.prepare("UPDATE coaches SET abo_status = ?, abo_einde = ?, status = ? WHERE stripe_subscription = ? AND is_owner = 0")
          .bind(sub.status, sub.einde, ACTIVE_SUB.includes(sub.status) ? "actief" : "verlopen", sub.id),
      ]);
    }
  } catch (e) {
    // let Stripe retry: forget the event id
    await c.env.DB.prepare("DELETE FROM stripe_events WHERE id = ?").bind(ev.id).run();
    throw e;
  }
  return json({ ok: true });
}

// ---------- messages (coach ↔ client) ----------
const BERICHT_COLS = "id, van, tekst, foto_key IS NOT NULL AS foto, checkin_id, gelezen, created_at";
async function berichtenOf(env, clientId, na) {
  const { results } = await env.DB.prepare(
    `SELECT ${BERICHT_COLS} FROM berichten WHERE client_id = ? AND id > ? ORDER BY id DESC LIMIT 200`,
  ).bind(clientId, na || 0).all();
  return results.reverse().map((b) => ({ ...b, foto: !!b.foto }));
}
function cleanTekst(t) {
  const tekst = str(t, 4000, "Bericht");
  if (!tekst) fail(400, "Typ een bericht.");
  return tekst;
}
async function addBericht(c, clientId, van, tekst, extra = {}) {
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO berichten (client_id, van, tekst, foto_key, foto_type, checkin_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(clientId, van, tekst, extra.foto_key || null, extra.foto_type || null, extra.checkin_id || null, c.now).run();
  const cl = await c.env.DB.prepare("SELECT id, naam, coach_id FROM clients WHERE id = ?").bind(clientId).first();
  const preview = tekst ? tekst.slice(0, 120) : "📷 Foto";
  const n = van === "coach"
    ? ["client", cl.id, { titel: extra.checkin_id ? "Uw coach reageerde op uw check-in" : "Nieuw bericht van uw coach", tekst: preview, url: "/app/?v=coach" }]
    : ["coach", cl.coach_id, { titel: `Bericht van ${cl.naam}`, tekst: preview, url: `/coach/#/client/${cl.id}/berichten` }];
  c.ctx?.waitUntil(notify(c.env, n[0], n[1], n[2], c.now));
  return meta.last_row_id;
}
async function clientGetBerichten(c) {
  await c.env.DB.prepare("UPDATE berichten SET gelezen = ? WHERE client_id = ? AND van = 'coach' AND gelezen IS NULL").bind(c.now, c.client.id).run();
  return json({ berichten: await berichtenOf(c.env, c.client.id, Number(c.url.searchParams.get("na")) || 0) });
}
async function clientPostBericht(c) {
  await addBericht(c, c.client.id, "client", cleanTekst(c.body.tekst));
  return json({ berichten: await berichtenOf(c.env, c.client.id) }, 201);
}
async function coachGetBerichten(c) {
  const row = await ownClient(c, c.params[0]);
  await c.env.DB.prepare("UPDATE berichten SET gelezen = ? WHERE client_id = ? AND van = 'client' AND gelezen IS NULL").bind(c.now, row.id).run();
  return json({ berichten: await berichtenOf(c.env, row.id, Number(c.url.searchParams.get("na")) || 0) });
}
async function coachPostBericht(c) {
  const row = await ownClient(c, c.params[0]);
  let checkin = null;
  if (c.body.checkin_id != null) {
    checkin = await c.env.DB.prepare("SELECT id FROM checkins WHERE id = ? AND client_id = ?").bind(Number(c.body.checkin_id), row.id).first();
    if (!checkin) fail(404, "Check-in niet gevonden.");
  }
  await addBericht(c, row.id, "coach", cleanTekst(c.body.tekst), { checkin_id: checkin && checkin.id });
  return json({ berichten: await berichtenOf(c.env, row.id) }, 201);
}
async function postBerichtFoto(c, client, van) {
  if (Number(c.req.headers.get("content-length")) > MAX_FOTO) fail(413, "De foto is te groot (max. 5 MB).");
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > MAX_FOTO) fail(413, "De foto is te groot (max. 5 MB).");
  const type = buf.length > 12 ? imageType(buf) : null;
  if (!type) fail(415, "Upload een JPEG- of WebP-foto.");
  const tekst = str(c.url.searchParams.get("tekst") || "", 4000, "Bericht");
  const key = `m/${client.id}/${randomToken(12)}`;
  await c.env.FOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  await addBericht(c, client.id, van, tekst, { foto_key: key, foto_type: type });
  return json({ berichten: await berichtenOf(c.env, client.id) }, 201);
}
async function serveBerichtFoto(c, clientId) {
  const b = await c.env.DB.prepare("SELECT foto_key, foto_type FROM berichten WHERE id = ? AND client_id = ? AND foto_key IS NOT NULL").bind(c.params[0], clientId).first();
  const obj = b && await c.env.FOTOS.get(b.foto_key);
  if (!obj) fail(404, "Foto niet gevonden.");
  return new Response(obj.body, { headers: { "content-type": b.foto_type, "cache-control": "private, max-age=86400" } });
}
async function coachBerichtFoto(c) {
  const b = await c.env.DB.prepare(
    "SELECT b.client_id FROM berichten b JOIN clients cl ON cl.id = b.client_id WHERE b.id = ? AND cl.coach_id = ?",
  ).bind(c.params[0], c.coach.id).first();
  if (!b) fail(404, "Foto niet gevonden.");
  return serveBerichtFoto(c, b.client_id);
}

// ---------- web push (VAPID, payload-less) ----------
// The push itself is empty; the service worker then calls /api/push/pending with the user's cookie to get
// the text. That avoids the RFC 8291 payload encryption while keeping message content off third-party servers.
let vapidKey = null;
async function vapidJwt(env, endpoint, now) {
  if (!vapidKey) vapidKey = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE_JWK), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const b64 = (o) => b64url(enc.encode(JSON.stringify(o)));
  const unsigned = `${b64({ typ: "JWT", alg: "ES256" })}.${b64({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub: env.VAPID_SUBJECT || "https://dcramere-voeding.dcramere.workers.dev" })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidKey, enc.encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}
async function sendPush(env, endpoint, now) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `vapid t=${await vapidJwt(env, endpoint, now)}, k=${env.VAPID_PUBLIC}`, ttl: "86400", urgency: "normal", "content-length": "0" },
  });
  if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run();
  else if (!r.ok) console.error("push failed", r.status, await r.text().catch(() => ""));
}
async function notify(env, role, subjectId, n, now) {
  try {
    await env.DB.prepare("INSERT INTO notificaties (role, subject_id, titel, tekst, url, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(role, subjectId, n.titel, n.tekst, n.url, now).run();
    if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
    const { results } = await env.DB.prepare("SELECT endpoint FROM push_subs WHERE role = ? AND subject_id = ?").bind(role, subjectId).all();
    await Promise.all(results.map((s) => sendPush(env, s.endpoint, now).catch((e) => console.error("push", e))));
  } catch (e) { console.error("notify failed", e); }
}
async function sessionRoles(c) {
  const out = [];
  for (const role of ["client", "coach"]) { const id = await sessionSubject(c, role); if (id) out.push([role, id]); }
  return out;
}
async function pushSubscribe(c) {
  const roles = await sessionRoles(c);
  const role = roles.find((r) => r[0] === c.body.role) || (roles.length === 1 && roles[0]);
  if (!role) fail(401, "Log opnieuw in.");
  const ep = String(c.body.endpoint || "");
  if (!/^https:\/\/[^\s]{10,1000}$/.test(ep) && !(c.env.PUSH_TEST_ORIGIN && ep.startsWith(c.env.PUSH_TEST_ORIGIN))) fail(400, "Ongeldig push-adres.");
  await c.env.DB.prepare("INSERT INTO push_subs (role, subject_id, endpoint, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET role = excluded.role, subject_id = excluded.subject_id")
    .bind(role[0], role[1], ep, c.now).run();
  return json({ ok: true });
}
async function pushUnsubscribe(c) {
  const roles = await sessionRoles(c);
  if (!roles.length) fail(401, "Log opnieuw in.");
  await c.env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(String(c.body.endpoint || "")).run();
  return json({ ok: true });
}
async function pushPending(c) {
  const out = [];
  for (const [role, id] of await sessionRoles(c)) {
    const { results } = await c.env.DB.prepare(
      "SELECT id, titel, tekst, url FROM notificaties WHERE role = ? AND subject_id = ? AND bezorgd IS NULL AND created_at > ? ORDER BY id LIMIT 5",
    ).bind(role, id, c.now - 3 * DAY).all();
    if (results.length) await c.env.DB.prepare(`UPDATE notificaties SET bezorgd = ? WHERE id IN (${results.map(() => "?").join(",")})`).bind(c.now, ...results.map((r) => r.id)).run();
    out.push(...results);
  }
  return json({ notificaties: out });
}

// ---------- reminders ----------
const CHECKIN_ELKE = 7 * DAY, FOTO_ELKE = 28 * DAY;
async function remindOnce(env, clientId, soort, every, now, n) {
  const r = await env.DB.prepare("SELECT laatst FROM herinneringen WHERE client_id = ? AND soort = ?").bind(clientId, soort).first();
  if (r && now - r.laatst < every) return false;
  await env.DB.prepare("INSERT INTO herinneringen (client_id, soort, laatst) VALUES (?, ?, ?) ON CONFLICT (client_id, soort) DO UPDATE SET laatst = excluded.laatst").bind(clientId, soort, now).run();
  await notify(env, "client", clientId, n, now);
  return true;
}
async function sendReminders(env, now) {
  // only clients who enabled push, have started (a measurement) and have access
  const { results } = await env.DB.prepare(
    `SELECT c.id,
       (SELECT MAX(datum) FROM checkins k WHERE k.client_id = c.id) AS checkin,
       (SELECT MAX(datum) FROM fotos f WHERE f.client_id = c.id) AS foto,
       (SELECT MIN(datum) FROM metingen m WHERE m.client_id = c.id) AS start
     FROM clients c
     WHERE c.actief = 1 AND (c.abo_status IS NULL OR c.abo_status IN ('active','trialing','past_due'))
       AND EXISTS (SELECT 1 FROM push_subs p WHERE p.role = 'client' AND p.subject_id = c.id)
       AND EXISTS (SELECT 1 FROM metingen m WHERE m.client_id = c.id)`,
  ).all();
  const age = (d) => (d ? now - Date.parse(d + "T12:00:00Z") / 1000 : Infinity);
  let sent = 0;
  for (const c of results) {
    if (age(c.checkin) >= CHECKIN_ELKE - DAY / 2 && age(c.start) >= CHECKIN_ELKE - DAY / 2)
      sent += await remindOnce(env, c.id, "checkin", 3 * DAY, now, { titel: "Tijd voor uw wekelijkse check-in", tekst: "Weeg uzelf en laat uw coach weten hoe uw week ging.", url: "/app/?v=checkin" });
    else if (age(c.foto) >= FOTO_ELKE)
      sent += await remindOnce(env, c.id, "foto", 7 * DAY, now, { titel: "Tijd voor nieuwe progressiefoto's", tekst: "Maak een nieuwe set: voorkant, achterkant en zijkant.", url: "/app/?v=checkin" });
  }
  if (sent) console.log(`reminders sent: ${sent}`);
}

// ---------- coach-built training programs ----------
async function customDefOut(env, id, coachId) {
  const def = await programDef(env, id, coachId);
  return def && def.custom ? { id, naam: def.naam, ...def.data } : null;
}
async function listProgrammas(c) {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.naam, p.data, p.updated_at,
       (SELECT COUNT(*) FROM clients cl WHERE cl.coach_id = p.coach_id AND json_extract(cl.programma, '$.id') = 'c' || p.id) AS clienten
     FROM programmas p WHERE p.coach_id = ? ORDER BY p.updated_at DESC`,
  ).bind(c.coach.id).all();
  return json(results.map((r) => { const d = JSON.parse(r.data); return { id: `c${r.id}`, naam: r.naam, weken: d.weken, dagen: d.dagen.length, clienten: r.clienten, updated: r.updated_at }; }));
}
async function ownProgramma(c) {
  const r = await c.env.DB.prepare("SELECT * FROM programmas WHERE id = ? AND coach_id = ?").bind(c.params[0], c.coach.id).first();
  if (!r) fail(404, "Programma niet gevonden.");
  return r;
}
async function createProgramma(c) {
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM programmas WHERE coach_id = ?").bind(c.coach.id).first();
  if (n.n >= 100) fail(400, "Maximaal 100 programma's.");
  const p = cleanProgramDef(c.body);
  const { meta } = await c.env.DB.prepare("INSERT INTO programmas (coach_id, naam, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(c.coach.id, p.naam, JSON.stringify(p.data), c.now, c.now).run();
  return json({ id: `c${meta.last_row_id}`, naam: p.naam, ...p.data }, 201);
}
async function getProgramma(c) {
  const r = await ownProgramma(c);
  return json({ id: `c${r.id}`, naam: r.naam, ...JSON.parse(r.data) });
}
async function updateProgramma(c) {
  const r = await ownProgramma(c);
  const p = cleanProgramDef(c.body);
  const old = JSON.parse(r.data);
  // clients already on this program keep their logs: days and weeks may only grow, never disappear
  const inUse = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM workouts w JOIN clients cl ON cl.id = w.client_id WHERE cl.coach_id = ? AND w.programma = ?").bind(c.coach.id, `c${r.id}`).first();
  if (inUse.n && (p.data.dagen.length < old.dagen.length || p.data.weken < old.weken))
    fail(409, "Cliënten hebben al trainingen gelogd in dit programma. U kunt dagen en weken toevoegen, maar niet verwijderen. Maak anders een kopie.");
  await c.env.DB.prepare("UPDATE programmas SET naam = ?, data = ?, updated_at = ? WHERE id = ?").bind(p.naam, JSON.stringify(p.data), c.now, r.id).run();
  return json({ id: `c${r.id}`, naam: p.naam, ...p.data });
}
async function deleteProgramma(c) {
  const r = await ownProgramma(c);
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM clients WHERE coach_id = ? AND json_extract(programma, '$.id') = ?").bind(c.coach.id, `c${r.id}`).first();
  if (used.n) fail(409, `Dit programma is toegewezen aan ${used.n} cliënt(en). Wijs eerst een ander programma toe.`);
  await c.env.DB.prepare("DELETE FROM programmas WHERE id = ?").bind(r.id).run();
  return json({ ok: true });
}
