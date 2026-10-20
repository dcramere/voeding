// DCRAMERE Voeding — API (/api/*) + static assets (public/)
import { tr, pickLang, valid as validLang } from "./i18n.js";
import { DC, TR } from "./core.js";
import { matchMarker, parseRef, beoordeel, urgent, ALGEMEEN } from "./bloed.js";

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
    if (url.pathname.startsWith("/c/") && req.method === "GET") {
      try { return await storefrontPage(env, url, pickLang(req, url)); }
      catch (e) { console.error(e); ctx.waitUntil(logFout(env, url.pathname, e)); return new Response(tr(pickLang(req, url), "Er ging iets mis."), { status: 500 }); }
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url, ctx);
    } catch (e) {
      const lang = pickLang(req, url);
      if (e instanceof HttpError) return json({ error: tr(lang, e.message, e.vars), ...(e.code ? { code: e.code } : {}) }, e.status);
      console.error(e);
      ctx.waitUntil(logFout(env, url.pathname, e));
      return json({ error: tr(lang, "Er ging iets mis op de server. Probeer het later opnieuw.") }, 500);
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
  await autoCheckinInhalen(env, now);
  const hour = new Date(now * 1000).getUTCHours();
  if (force || env.HERINNERING_UUR === "altijd" || hour === Number(env.HERINNERING_UUR || 12)) {
    await sendReminders(env, now);
    await adaptiefRun(env, now);
  }
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
const stripeLocale = (c) => ({ nl: "nl", en: "en", pt: "pt-BR", es: "es" }[pickLang(c.req, c.url)]);
// messages are Dutch source text; {placeholders} are filled from vars after translation (see src/i18n.js)
class HttpError extends Error {
  constructor(status, message, code, vars) { super(message); this.status = status; this.code = code; this.vars = vars; }
}
const fail = (status, msg, code, vars) => { throw new HttpError(status, msg, code, vars); };

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
  if (s.length > max) fail(400, "{f} is te lang.", undefined, { f: field });
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
    if (required) fail(400, "{f} ontbreekt.", undefined, { f: field });
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, "{f} moet tussen {a} en {b} liggen.", undefined, { f: field, a: min, b: max });
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
  koken: ["dagelijks", "avond", "prep", "weinig"],
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
    eten: str(b.eten, 2000, "Eetgewoonten"),
    koken: keuze("koken"),
    producten: (Array.isArray(b.producten) ? b.producten : []).filter((k) => typeof k === "string" && DC.FOODS[k] && !DC.FOODS[k].custom).slice(0, 60),
  };
  if (!intake.doel) fail(400, "Beschrijf kort wat u wilt bereiken.");
  return intake;
}

function cleanCheckin(b) {
  if (!isDate(b.datum)) fail(400, "Vul een geldige datum in.");
  const score = (k, label) => {
    const v = Number(b[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) fail(400, "Kies een score voor {x}.", undefined, { x: label });
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
  const coach = await c.env.DB.prepare("SELECT id, naam, email, taal, is_owner, status, stripe_customer, abo_status, abo_einde, merk, slug, avatar_key, avatar_v, connect_account, connect_status, connect_land, client_prijs, client_valuta, client_product, client_price FROM coaches WHERE id = ?").bind(id).first();
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
  ["PUT", "/taal", withClient(async (c) => { await setTaal(c, "clients", c.client.id); return json({ ok: true }); }, { billing: true })],
  ["PUT", "/profiel", withClient(clientPutProfiel)],
  ["PUT", "/menu", withClient(clientPutMenu)],
  ["POST", "/metingen", withClient(clientAddMeting)],
  ["DELETE", /^\/metingen\/(\d+)$/, withClient(clientDelMeting)],
  ["PUT", "/intake", withClient(clientPutIntake)],
  ["POST", "/privacy", withClient(clientAcceptPrivacy)],
  ["POST", "/fotos", withClient((c) => storeFoto(c, c.client.id, "client")), RAW],
  ["PUT", "/workouts", withClient(clientPutWorkout)],
  ["GET", "/account/export", withClient(clientExport, { billing: true })],
  ["POST", "/account/verwijderen", withClient(clientDeleteAccount, { billing: true })],
  ["GET", "/health", health],
  ["POST", "/avatar", withClient((c) => putAvatar(c, "client", c.client.id), { billing: true }), RAW],
  ["DELETE", "/avatar", withClient((c) => delAvatar(c, "client", c.client.id), { billing: true })],
  ["GET", /^\/avatar\/client\/(\d+)$/, getClientAvatar],
  ["GET", /^\/avatar\/coach\/(\d+)$/, getCoachAvatar],
  ["GET", "/winkels", listWinkels],
  ["POST", /^\/winkel\/([a-z0-9-]{3,30})\/aanvraag$/, postAanvraag],
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
  ["POST", "/bloed/akkoord", withClient(bloedAkkoord)],
  ["POST", "/bloed/upload", withClient((c) => bloedUpload(c, c.client, "client")), RAW],
  ["POST", "/bloed", withClient((c) => bloedNieuw(c, c.client, "client"))],
  ["PUT", /^\/bloed\/(\d+)$/, withClient((c) => bloedWijzig(c, c.client, "client", c.params[0]))],
  ["DELETE", /^\/bloed\/(\d+)$/, withClient((c) => bloedVerwijder(c, c.client, "client", c.params[0]))],
  ["GET", /^\/bloed\/(\d+)\/bestand\/(\d+)$/, withClient((c) => bloedBestand(c, c.client.id, c.params[0], c.params[1]))],
  ["POST", "/wachtwoord", withClient(clientChangePassword)],
  // coach
  ["GET", "/coach/status", coachStatus],
  ["POST", "/coach/setup", coachSetup],
  ["POST", "/coach/login", coachLogin],
  ["POST", "/coach/logout", logout("coach")],
  ["GET", "/coach/me", withCoach(coachMeInfo, { billing: true })],
  ["PUT", "/coach/instellingen", withCoach(async (c) => {
    if ("autoCheckin" in c.body) await c.env.DB.prepare("UPDATE coaches SET auto_checkin = ? WHERE id = ?").bind(c.body.autoCheckin ? 1 : 0, c.coach.id).run();
    for (const [k, col] of [["autoTraining", "auto_training"], ["autoPlan", "auto_plan"], ["emailAan", "email_aan"], ["emailBerichten", "email_berichten"]])
      if (k in c.body) await c.env.DB.prepare(`UPDATE coaches SET ${col} = ? WHERE id = ?`).bind(c.body[k] ? 1 : 0, c.coach.id).run();
    return json(await coachInstellingen(c.env, c.coach.id));
  })],
  ["POST", /^\/coach\/clients\/(\d+)\/checkins\/(\d+)\/antwoord$/, withCoach(async (c) => {
    // the coach asks for the automatic reply right now (same engine as after a check-in)
    const row = await ownClient(c, c.params[0]);
    const k = await c.env.DB.prepare("SELECT datum FROM checkins WHERE id = ? AND client_id = ?").bind(c.params[1], row.id).first();
    if (!k) fail(404, "Check-in niet gevonden.");
    await autoCheckinReply(c.env, row.id, k.datum, c.now);
    return getClient(c);
  })],
  ["PUT", "/coach/taal", withCoach(async (c) => { await setTaal(c, "coaches", c.coach.id); return json({ ok: true }); }, { billing: true })],
  ["POST", "/coach/signup", coachSignup],
  ["POST", "/coach/checkout", withCoach(coachCheckout, { billing: true })],
  ["GET", "/coach/checkout", withCoach(coachCheckoutStatus, { billing: true })],
  ["POST", "/coach/billing/portal", withCoach(coachPortal, { billing: true })],
  ["GET", "/coach/admin/coaches", withCoach(ownerCoaches)],
  ["GET", "/coach/admin/systeem", withCoach(ownerSysteem)],
  ["GET", "/prijzen", prijzen],
  ["POST", "/checkout/client", clientCheckout],
  ["GET", "/checkout/client", clientCheckoutStatus],
  ["POST", "/billing/portal", withClient(clientPortal, { billing: true })],
  ["POST", "/billing/checkout", withClient(clientResubscribe, { billing: true })],
  ["POST", "/stripe/webhook", stripeWebhook, RAW],
  ["GET", "/billing/info", withClient(clientBillingInfo, { billing: true })],
  ["POST", /^\/winkel\/([a-z0-9-]{3,30})\/checkout$/, storefrontCheckout],
  ["GET", "/coach/connect", withCoach(connectStatus)],
  ["POST", "/coach/connect", withCoach(connectStart)],
  ["PUT", "/coach/connect/prijs", withCoach(connectSetPrice)],
  ["POST", "/coach/connect/dashboard", withCoach(connectDashboard)],
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
  ["POST", /^\/coach\/clients\/(\d+)\/bloed\/upload$/, withCoach(async (c) => bloedUpload(c, await ownClient(c, c.params[0]), "coach")), RAW],
  ["POST", /^\/coach\/clients\/(\d+)\/bloed$/, withCoach(async (c) => bloedNieuw(c, await ownClient(c, c.params[0]), "coach"))],
  ["PUT", /^\/coach\/clients\/(\d+)\/bloed\/(\d+)$/, withCoach(async (c) => bloedWijzig(c, await ownClient(c, c.params[0]), "coach", c.params[1]))],
  ["DELETE", /^\/coach\/clients\/(\d+)\/bloed\/(\d+)$/, withCoach(async (c) => bloedVerwijder(c, await ownClient(c, c.params[0]), "coach", c.params[1]))],
  ["GET", /^\/coach\/clients\/(\d+)\/bloed\/(\d+)\/bestand\/(\d+)$/, withCoach(async (c) => bloedBestand(c, (await ownClient(c, c.params[0])).id, c.params[1], c.params[2]))],
  ["GET", /^\/coach\/clients\/(\d+)\/berichten$/, withCoach(coachGetBerichten)],
  ["GET", "/coach/programmas", withCoach(listProgrammas)],
  ["PUT", "/coach/merk", withCoach(putMerk)],
  ["POST", "/coach/avatar", withCoach((c) => putAvatar(c, "coach", c.coach.id), { billing: true }), RAW],
  ["DELETE", "/coach/avatar", withCoach((c) => delAvatar(c, "coach", c.coach.id), { billing: true })],
  ["GET", "/coach/winkel", withCoach(getWinkel)],
  ["PUT", "/coach/winkel", withCoach(putWinkel)],
  ["GET", "/coach/aanvragen", withCoach(listAanvragen)],
  ["PUT", /^\/coach\/aanvragen\/(\d+)$/, withCoach(putAanvraag)],
  ["POST", /^\/coach\/aanvragen\/(\d+)\/uitnodigen$/, withCoach(inviteAanvraag)],
  ["POST", "/coach/merk/logo", withCoach(putMerkLogo), RAW],
  ["DELETE", "/coach/merk/logo", withCoach(delMerkLogo)],
  ["GET", /^\/merk\/(\d+)\/logo$/, getMerkLogo],
  ["POST", "/coach/demo", withCoach(createDemo)],
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
    else { const hit = path.match(pattern); if (!hit) continue; params = hit.slice(1).map((x) => (/^\d+$/.test(x) ? Number(x) : x)); }
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
    cl.bloedonderzoek = (await env.DB.prepare("SELECT datum, lab, waarden, door, created_at FROM bloedonderzoek WHERE client_id = ? ORDER BY datum").bind(cl.id).all()).results.map((b) => ({ ...b, waarden: JSON.parse(b.waarden) }));
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
  const plan = await planUitIntake(c.env, clientId, c.now);
  return json({ metingen: await metingenOf(c.env, clientId), ...(plan ? { maaltijdplan: plan } : {}) });
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

async function setTaal(c, table, id) {
  const l = validLang(c.body.taal);
  if (!l) fail(400, "Onbekende taal.");
  await c.env.DB.prepare(`UPDATE ${table} SET taal = ? WHERE id = ?`).bind(l, id).run();
}
async function clientMe(c) {
  const { client: cl, env } = c;
  const [coach, metingen, checkins, fotos, workouts, producten] = await Promise.all([
    env.DB.prepare("SELECT id, naam, merk, avatar_key, avatar_v, auto_training FROM coaches WHERE id = ?").bind(cl.coach_id).first(),
    metingenOf(env, cl.id),
    checkinsOf(env, cl.id, 12),
    fotosOf(env, cl.id),
    workoutsOf(env, cl),
    productenOf(env, cl.id),
    env.DB.prepare("UPDATE clients SET last_seen = ? WHERE id = ?").bind(c.now, cl.id).run(),
  ]);
  return json({
    naam: cl.naam, email: cl.email, taal: cl.taal || null, autoTraining: !coach || !!coach.auto_training, coach: coach ? coach.naam : "", merk: coach ? merkOut(coach) : null,
    avatar: avatarUrl("client", cl), coachAvatar: coach ? avatarUrl("coach", coach) : null,
    profiel: profielOut(cl), intake: cl.intake ? JSON.parse(cl.intake) : null,
    privacyAkkoord: cl.privacy_akkoord, menu: JSON.parse(cl.menu), metingen, checkins, fotos,
    bloedAkkoord: cl.bloed_akkoord || null, bloed: await bloedLijst(env, cl.id, pickLang(c.req, c.url), "client"),
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
  const plan = await planUitIntake(c.env, c.client.id, c.now);
  return json({ naam, profiel: profielOut({ profiel: JSON.stringify(profiel), doelen: c.client.doelen, adaptief: c.client.adaptief, maaltijdplan: plan ? JSON.stringify(plan) : c.client.maaltijdplan }) });
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
  await planUitIntake(c.env, c.client.id, c.now);
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
  const coach = await c.env.DB.prepare("SELECT id, naam, auto_checkin FROM coaches WHERE id = ?").bind(c.client.coach_id).first();
  if (coach && coach.auto_checkin) c.ctx?.waitUntil(autoCheckinReply(c.env, c.client.id, k.datum, c.now));
  else c.ctx?.waitUntil(notify(c.env, "coach", c.client.coach_id, { titel: "Check-in van {naam}", v: { naam: c.client.naam },
    tekst: k.opmerking ? k.opmerking.slice(0, 120) : "Er staat een nieuwe weekcheck-in klaar.", raw: !!k.opmerking, url: `/coach/#/client/${c.client.id}/checkins` }, c.now));
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
const adaptiefOf = (r) => ({ kcal: 0, uit: false, laatst: 0, gewijzigd: 0, historie: [], ...(r && r.adaptief ? JSON.parse(r.adaptief) : {}) });
const profielOut = (r) => {
  if (!r.profiel) return null;
  const a = adaptiefOf(r);
  return { ...JSON.parse(r.profiel), ...(r.doelen ? { override: JSON.parse(r.doelen) } : {}), ...(a.kcal && !a.uit ? { bijstelling: a.kcal } : {}),
    ...(r.maaltijdplan ? { maaltijdplan: JSON.parse(r.maaltijdplan) } : {}) };
};
// ---------- meal plan from the intake ----------
// Once intake (eating habits), profile and a weigh-in exist, build a coach meal plan from the foods the client
// already eats: the ones ticked in the intake plus those Workers AI finds in their description. The automatic
// menu generator does the portions; the result is stored as an ordinary coach plan the coach can edit.
// Runs once per client (plan_intake), never over a plan the coach made, and only when the coach has it switched on.
async function etenUitTekst(env, tekst) {
  if (!env.AI || !tekst) return [];
  const lijst = Object.entries(DC.FOODS).filter(([, f]) => !f.custom).map(([k, f]) => `${k}: ${f.n}`).join("\n");
  try {
    const res = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: [
      { role: "system", content: "You map a person's description of their daily food (any language) to a fixed list of food ids. Answer with a JSON array of ids only, e.g. [\"kip\",\"rijst\"]. Only use ids from the list. Match generously: chicken breast or chicken → kip, brown or white rice → rijst, whole wheat bread → brood, kidney beans or red beans → kidneybonen, dal/daal/split peas → dhal, duck → eend, vegetables → groente, peanut butter → pindakaas." },
      { role: "user", content: `Food list (id: name):\n${lijst}\n\nDescription:\n${String(tekst).slice(0, 1500)}` },
    ], max_tokens: 200, temperature: 0 });
    const txt = String(typeof res.response === "string" ? res.response : JSON.stringify(res.response));
    const arr = JSON.parse((txt.match(/\[[\s\S]*?\]/) || ["[]"])[0]);
    return arr.filter((k) => typeof k === "string" && DC.FOODS[k] && !DC.FOODS[k].custom);
  } catch (e) { console.error("intake food extraction failed", e); return []; }
}
async function planUitIntake(env, clientId, now) {
  try {
    const cl = await env.DB.prepare("SELECT c.*, k.auto_plan FROM clients c JOIN coaches k ON k.id = c.coach_id WHERE c.id = ?").bind(clientId).first();
    if (!cl || cl.plan_intake || cl.maaltijdplan || !cl.auto_plan || !cl.intake || !cl.profiel || cl.doelen) return null;
    const intake = JSON.parse(cl.intake);
    if (!(intake.producten && intake.producten.length) && !intake.eten) return null;
    const metingen = await metingenOf(env, clientId);
    if (!metingen.length) return null;
    const P0 = JSON.parse(cl.profiel);
    const eten = new Set([...(intake.producten || []), ...(await etenUitTekst(env, intake.eten))].filter((k) => !(P0.excl || []).includes(k)));
    if (eten.size < 3) return null; // too little to build a plan from: keep the automatic menu
    // the main meals need a protein and a carbohydrate source; add a neutral one only when none was named
    if (!["kip", "witvis", "kvv", "zalm", "tofu", "ei", "tonijn", "tempeh", "gehakt"].some((k) => eten.has(k))) eten.add("kip");
    if (!["rijst", "zoeteaardappel", "peul", "aardappel", "cassave", "pasta", "bakbanaan"].some((k) => eten.has(k))) eten.add("rijst");
    eten.add("groente");
    const P = { ...P0, excl: Object.keys(DC.FOODS).filter((k) => !DC.FOODS[k].custom && !eten.has(k)) };
    const m = metingen[metingen.length - 1], A = DC.analyse(P, m), D = DC.dagTargets(P, A);
    const lang = cl.taal || "nl", vast = (k) => k === "groente" || !!DC.FOODS[k].oil;
    const naarPlan = (ml, train) => ({ naam: tr(lang, ml.name), dagboek: DC.diaryMeal(ml), train, notitie: "",
      items: ml.items.map((i) => ({ key: i.key, g: i.g, vast: vast(i.key) })) });
    const maaltijden = DC.menuFor(P, { seed: 0 }, D ? { ...A, ...D.rust } : A, D ? "rust" : null).map((ml) => naarPlan(ml, false));
    if (D) {
      const extra = DC.menuFor(P, { seed: 0 }, { ...A, ...D.train }, "train").find((ml) => ml.type === "training");
      if (extra) maaltijden.splice(maaltijden.length - 1, 0, naarPlan(extra, true));
    }
    // cooks the night before for the whole day: lunch and dinner come from the same pot
    if (intake.koken === "avond") {
      const lunch = maaltijden.find((x) => x.dagboek === "lunch"), avond = maaltijden.find((x) => x.dagboek === "avond");
      if (lunch && avond) { avond.items = lunch.items.map((i) => ({ ...i })); avond.notitie = tr(lang, "Uit dezelfde pan als de lunch, de avond ervoor gekookt."); }
    }
    const plan = { maaltijden, bron: "intake" };
    await env.DB.prepare("UPDATE clients SET maaltijdplan = ?, plan_intake = 1 WHERE id = ?").bind(JSON.stringify(plan), clientId).run();
    await notify(env, "coach", cl.coach_id, { titel: "Voedingsplan voor {naam} samengesteld", v: { naam: cl.naam },
      tekst: "Op basis van de producten die {naam} in de intake noemt. Bekijk en pas het aan onder Plan → Eigen voedingsplan.", url: `/coach/#/client/${clientId}/plan` }, now);
    return plan;
  } catch (e) { console.error("plan from intake failed", e); return null; }
}

// coach-built meal plan: base foods from public/core.js or the client's own products (p<id>)
async function cleanMaaltijdplan(env, b, clientId) {
  if (!b || typeof b !== "object" || !Array.isArray(b.maaltijden)) fail(400, "Ongeldig voedingsplan.");
  if (!b.maaltijden.length || b.maaltijden.length > 8) fail(400, "Een voedingsplan heeft 1 tot 8 maaltijden.");
  const eigen = new Set((await env.DB.prepare("SELECT id FROM producten WHERE client_id = ?").bind(clientId).all()).results.map((p) => `p${p.id}`));
  const maaltijden = b.maaltijden.map((m) => {
    const naam = str(m && m.naam, 40, "Naam maaltijd");
    if (!naam) fail(400, "Geef elke maaltijd een naam.");
    const items = (Array.isArray(m.items) ? m.items : []).map((i) => {
      const key = String(i && i.key || "");
      if (!(DC.FOODS[key] && !DC.FOODS[key].custom) && !eigen.has(key)) fail(400, "Onbekend product in {x}.", undefined, { x: naam });
      const g = num(i.g, 1, 2000, "Gram", true);
      return { key, g, vast: !!i.vast };
    });
    if (!items.length || items.length > 12) fail(400, "{x} heeft 1 tot 12 producten nodig.", undefined, { x: naam });
    return { naam, dagboek: ["ontbijt", "lunch", "avond", "snack"].includes(m.dagboek) ? m.dagboek : "snack", train: !!m.train, notitie: str(m.notitie, 500, "Bereiding"), items };
  });
  if (!maaltijden.some((m) => !m.train)) fail(400, "Zet minstens één maaltijd op elke dag (niet alleen op trainingsdagen).");
  return { maaltijden };
}
function cleanDoelen(b) {
  if (b === null) return null;
  if (!b || typeof b !== "object") fail(400, "Ongeldige doelen.");
  const d = { kcal: num(b.kcal, 800, 6000, "Calorieën", true), prot: num(b.prot, 30, 400, "Eiwit"), fat: num(b.fat, 20, 300, "Vet") };
  if ((d.prot || 0) * 4 + (d.fat || 0) * 9 > d.kcal) fail(400, "Eiwit en vet leveren samen meer calorieën dan het dagdoel.");
  return d;
}
function publicClient(r) {
  return {
    id: r.id, naam: r.naam, email: r.email, actief: !!r.actief, geactiveerd: !!r.pw_hash, avatar: avatarUrl("client", r),
    uitnodigingVerloopt: r.invite_expires, notities: r.notities, privacyAkkoord: r.privacy_akkoord,
    profiel: profielOut(r), doelen: r.doelen ? JSON.parse(r.doelen) : null, intake: r.intake ? JSON.parse(r.intake) : null,
    programma: r.programma ? JSON.parse(r.programma) : null, menu: JSON.parse(r.menu),
    aangemaakt: r.created_at, laatstGezien: r.last_seen,
    abonnement: r.abo_status ? { status: r.abo_status, einde: r.abo_einde } : null,
    adaptief: (({ kcal, uit, gewijzigd, historie }) => ({ kcal, uit, gewijzigd, historie: historie.slice(-10) }))(adaptiefOf(r)),
    maaltijdplan: r.maaltijdplan ? JSON.parse(r.maaltijdplan) : null,
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
    ...publicClient(r), demo: !!r.demo, aantal: r.aantal, checkin: r.checkin ? JSON.parse(r.checkin) : null, laatsteFoto: r.laatste_foto, laatsteTraining: r.laatste_training, ongelezen: r.ongelezen,
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
  if (c.body.betaalt) payPlan(c.env, c.coach); // fails with a clear message when payments aren't set up
  const { meta } = await c.env.DB.prepare("INSERT INTO clients (coach_id, naam, email, created_at, abo_status) VALUES (?, ?, ?, ?, ?)")
    .bind(c.coach.id, naam, addr, c.now, c.body.betaalt ? "nodig" : null).run();
  const id = meta.last_row_id;
  return json({ id, link: await issueInvite(c, id) }, 201);
}

async function getClient(c) {
  const row = await ownClient(c, c.params[0]);
  const [metingen, checkins, fotos, workouts, producten] = await Promise.all([
    metingenOf(c.env, row.id), checkinsOf(c.env, row.id), fotosOf(c.env, row.id), workoutsOf(c.env, row), productenOf(c.env, row.id)]);
  const ongelezen = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM berichten WHERE client_id = ? AND van = 'client' AND gelezen IS NULL").bind(row.id).first()).n;
  const feedback = (await c.env.DB.prepare("SELECT id, tekst, checkin_id, created_at, auto FROM berichten WHERE client_id = ? AND van = 'coach' AND checkin_id IS NOT NULL ORDER BY id").bind(row.id).all()).results;
  const programmaDef = row.programma ? await customDefOut(c.env, JSON.parse(row.programma).id, row.coach_id) : null;
  const bloed = await bloedLijst(c.env, row.id, pickLang(c.req, c.url), "coach");
  return json({ ...publicClient(row), metingen, checkins, fotos, workouts, producten, ongelezen, feedback, programmaDef, bloed, bloedAkkoord: row.bloed_akkoord || null });
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
  if ("maaltijdplan" in b) {
    const plan = b.maaltijdplan === null ? null : await cleanMaaltijdplan(c.env, b.maaltijdplan, row.id);
    sets.push("maaltijdplan = ?"); vals.push(plan ? JSON.stringify(plan) : null);
  }
  if ("adaptief" in b) {
    // automatic adjustment on/off, or back to the plain formula
    const a = adaptiefOf(row);
    if (b.adaptief && typeof b.adaptief === "object" && "uit" in b.adaptief) a.uit = !!b.adaptief.uit;
    if (b.adaptief && b.adaptief.reset && a.kcal) { a.historie.push({ t: c.now, delta: -a.kcal, reden: "teruggezet door coach" }); a.kcal = 0; a.gewijzigd = c.now; }
    sets.push("adaptief = ?"); vals.push(JSON.stringify(a));
  }
  if ("betaalt" in b) {
    // the coach decides whether this client pays via the app; a running subscription is only stopped by the client
    if (b.betaalt) {
      payPlan(c.env, c.coach);
      if (!row.abo_status || !ACTIVE_SUB.includes(row.abo_status) && row.abo_status !== "nodig") { sets.push("abo_status = ?"); vals.push("nodig"); }
    } else {
      if (row.abo_status && ACTIVE_SUB.includes(row.abo_status)) fail(409, "Deze cliënt heeft een lopend abonnement. De cliënt zegt dat zelf op via het profiel.");
      sets.push("abo_status = ?"); vals.push(null);
    }
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
  await deleteClientData(c.env, row.id);
  return json({ ok: true });
}
async function deleteClientData(env, id) {
  const c = { env };
  const row = { id };
  await deleteAllFotos(c.env, row.id);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM fotos WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM bloedonderzoek WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM workouts WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM producten WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM dagboek WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM berichten WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM push_subs WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM notificaties WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM metingen WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM checkins WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM herinneringen WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("UPDATE aanvragen SET client_id = NULL WHERE client_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(row.id),
  ]);
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
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
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
  for (const prefix of [`c/${clientId}/`, `m/${clientId}/`, `b/${clientId}/`, `avatar/client/${clientId}/`]) await deletePrefix(env, prefix);
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

// ---------- blood tests ----------
// The client (or the coach, with the client's consent) uploads a lab report as PDF or photo. Workers AI reads the values;
// they are judged against the lab's own reference range (src/bloed.js) and an automatic, non-diagnostic summary is written
// for the client (their language) and a practical one for the coach. Files stay private in R2 under b/<client>/.
const MAX_BLOED = 10 * 1024 * 1024;
const BLOED_PER_DAG = 20; // AI runs (uploads + re-analyses) per client per day
const isPdf = (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const bloedRij = (r) => ({ ...r, bestanden: JSON.parse(r.bestanden || "[]"), waarden: JSON.parse(r.waarden || "[]"), samenvatting: r.samenvatting ? JSON.parse(r.samenvatting) : null });
const vandaag = (now) => new Date(now * 1000).toISOString().slice(0, 10);

function cleanWaarden(list) {
  if (!Array.isArray(list)) fail(400, "Ongeldige waarden.");
  if (list.length > 120) fail(400, "Te veel waarden (max. 120).");
  const n = (x) => { if (x === null || x === undefined || x === "") return null; const v = +String(x).trim().replace(",", "."); return Number.isFinite(v) ? v : null; };
  const out = [];
  for (const w of list) {
    if (!w || typeof w !== "object") continue;
    const naam = String(w.naam || "").trim().slice(0, 80);
    if (!naam) continue;
    const waarde = n(w.waarde), tekst = waarde == null ? String(w.tekst || w.waarde || "").trim().slice(0, 40) : "";
    if (waarde == null && !tekst) continue;
    out.push({ naam, waarde, tekst, eenheid: String(w.eenheid || "").trim().slice(0, 20), ref_min: n(w.ref_min), ref_max: n(w.ref_max),
      ref_tekst: String(w.ref_tekst || "").trim().slice(0, 40), vlag: String(w.vlag || "").trim().slice(0, 4) });
  }
  return out;
}

// assessment per value, the explanation in the reader's language and the same marker in an earlier report
function bloedAnalyse(rij, eerder, lang) {
  const unit = (u) => String(u || "").toLowerCase().replace(/\s/g, "").replace(/[µμ]/g, "u"), sameUnit = (a, b) => unit(a) === unit(b);
  const waarden = rij.waarden.map((w) => {
    const m = matchMarker(w.naam), status = beoordeel(w), uit = status === "laag" || status === "hoog";
    let vorige = null;
    if (m && w.waarde != null) for (let i = eerder.length - 1; i >= 0 && !vorige; i--) {
      const v = eerder[i].waarden.find((x) => x.waarde != null && sameUnit(x.eenheid, w.eenheid) && matchMarker(x.naam)?.code === m.code);
      if (v) vorige = { waarde: v.waarde, datum: eerder[i].datum };
    }
    const ref = parseRef(w);
    return { ...w, ref_min: ref.min, ref_max: ref.max, code: m ? m.code : null, status, urgent: m ? urgent(m.code, w.waarde, w.eenheid) : false,
      uitleg: uit ? tr(lang, m ? m[status] : ALGEMEEN) : null, vorige };
  });
  return { waarden, totaal: waarden.length, beoordeeld: waarden.filter((w) => w.status !== "onbekend").length,
    buiten: waarden.filter((w) => w.status === "laag" || w.status === "hoog").length, urgent: waarden.some((w) => w.urgent) };
}

async function bloedLijst(env, clientId, lang, rol) {
  const { results } = await env.DB.prepare("SELECT * FROM bloedonderzoek WHERE client_id = ? ORDER BY datum, id").bind(clientId).all();
  const rijen = results.map(bloedRij);
  return rijen.map((r, i) => {
    const s = r.samenvatting || {};
    return { id: r.id, datum: r.datum, lab: r.lab || "", door: r.door, created_at: r.created_at,
      bestanden: r.bestanden.map((b, n) => ({ n, naam: b.naam || "", type: b.type })), ...bloedAnalyse(r, rijen.slice(0, i), lang),
      samenvatting: (s.client && s.client.tekst) || null, ...(rol === "coach" ? { coachNotitie: (s.coach && s.coach.tekst) || null } : {}) };
  }).reverse();
}

const BLOED_PROMPT = `You read laboratory blood test reports. Return ONLY a JSON object, no other text:
{"datum": date the blood was drawn as "YYYY-MM-DD" or null, "lab": laboratory name or "",
 "waarden": [{"naam": test name exactly as printed, "waarde": the result as a number with a dot as decimal separator, or as text when it is not a plain number (e.g. "<0.5", "negative"),
   "eenheid": unit as printed or "", "ref": reference range exactly as printed or "", "vlag": "H" or "L" when the report marks the result as high or low, else ""}]}
Include every test result in the report, in the order printed. Leave out the patient's name, address, ID numbers and the doctor's name.
If this is not a laboratory report return {"fout": "geen labrapport"}.`;

async function aiBloed(env, buf, type) {
  let messages;
  if (type === "application/pdf") {
    let tekst = "";
    try {
      const [doc] = await env.AI.toMarkdown([{ name: "rapport.pdf", blob: new Blob([buf], { type }) }]);
      tekst = doc && doc.format !== "error" ? String(doc.data || "") : "";
    } catch (e) { console.error("blood pdf failed", e); }
    if (tekst.replace(/\s/g, "").length < 40) fail(422, "Deze PDF bevat geen leesbare tekst (bijvoorbeeld een scan). Upload in plaats daarvan foto's van de pagina's.");
    messages = [{ role: "system", content: BLOED_PROMPT }, { role: "user", content: tekst.slice(0, 40000) }];
  } else {
    let b64 = ""; for (let i = 0; i < buf.length; i += 0x8000) b64 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    messages = [{ role: "user", content: [{ type: "text", text: BLOED_PROMPT }, { type: "image_url", image_url: { url: `data:${type};base64,${btoa(b64)}` } }] }];
  }
  let out;
  try {
    const res = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages, max_tokens: 4000, temperature: 0 });
    out = typeof res.response === "object" && res.response ? res.response : JSON.parse(String(res.response).match(/\{[\s\S]*\}/)[0]);
  } catch (e) {
    console.error("blood read failed", e);
    fail(502, "Het rapport kon niet worden gelezen. Probeer een scherpere foto of vul de waarden handmatig in.");
  }
  if (out.fout) fail(422, "In dit bestand is geen laboratoriumrapport te herkennen.");
  return out;
}

async function bloedLimiet(c, clientId) {
  const key = `bloed:${clientId}`;
  const used = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE k = ? AND ts > ?").bind(key, c.now - DAY).first();
  if (used.n >= BLOED_PER_DAG) fail(429, "Het maximum aantal analyses voor vandaag is bereikt. Probeer het morgen opnieuw.");
  await c.env.DB.prepare("INSERT INTO login_attempts (k, ts) VALUES (?, ?)").bind(key, c.now).run();
}

const BLOED_STATUS = { laag: "LOW", hoog: "HIGH", normaal: "within range", onbekend: "no reference range" };
// automatic summaries: AI when available, otherwise a plain template; both are stored with their language
async function bloedSamenvatting(env, clientId, id, hint) {
  const cl = await env.DB.prepare("SELECT id, naam, taal, profiel, coach_id FROM clients WHERE id = ?").bind(clientId).first();
  const coach = await env.DB.prepare("SELECT naam, taal FROM coaches WHERE id = ?").bind(cl.coach_id).first();
  const { results } = await env.DB.prepare("SELECT * FROM bloedonderzoek WHERE client_id = ? ORDER BY datum, id").bind(clientId).all();
  const rijen = results.map(bloedRij), i = rijen.findIndex((r) => r.id === id);
  if (i < 0) return;
  const rij = rijen[i], a = bloedAnalyse(rij, rijen.slice(0, i), "en");
  const P = cl.profiel ? JSON.parse(cl.profiel) : null;
  const leeftijd = P && P.geboorte ? Math.floor((Date.parse(rij.datum) - Date.parse(P.geboorte)) / (365.25 * 864e5)) : null;
  const doel = P ? { "-0.2": "lose fat", "-0.1": "lose weight gradually", "0": "maintain weight", "0.1": "build muscle" }[String(P.doel)] : null;
  const regel = (w) => `- ${w.naam}: ${w.waarde ?? w.tekst} ${w.eenheid}`.trimEnd() + `, lab reference ${w.ref_tekst || [w.ref_min, w.ref_max].filter((x) => x != null).join("-") || "not given"}, ${w.urgent ? "URGENT, " : ""}${BLOED_STATUS[w.status]}`
    + (w.vorige ? `, previous test ${w.vorige.datum}: ${w.vorige.waarde}` : "");
  const buiten = a.waarden.filter((w) => w.status === "laag" || w.status === "hoog");
  const feiten = [
    `Client: ${cl.naam.split(" ")[0]}${P ? `, ${P.geslacht === "v" ? "female" : "male"}` : ""}${leeftijd ? `, ${leeftijd} years` : ""}${doel ? `, goal: ${doel}` : ""}.`,
    `Blood test of ${rij.datum}${rij.lab ? ` (${rij.lab})` : ""}: ${a.totaal} values, ${a.beoordeeld} with a reference range, ${a.buiten} outside the lab's reference range.`,
    buiten.length ? `Outside the range:\n${buiten.map(regel).join("\n")}` : "All values with a reference range are within it.",
    `Other values:\n${a.waarden.filter((w) => !buiten.includes(w)).slice(0, 40).map(regel).join("\n")}`,
    a.waarden.some((w) => w.vorige) ? "Previous values are given where an earlier test had the same marker." : "There is no earlier test to compare with: do not mention changes or a previous test.",
  ].join("\n");
  const lijst = (lang) => buiten.map((w) => `${w.naam} ${w.waarde ?? w.tekst}${w.eenheid ? " " + w.eenheid : ""} (${w.status === "laag" ? tr(lang, "laag") : tr(lang, "hoog")})`).join(", ");
  const sjabloon = (lang, rol) => {
    const t = (s, v) => tr(lang, s, v), zin = [];
    if (rol === "coach") zin.push(t("{naam}: {b} van de {n} beoordeelde waarden vallen buiten het referentiebereik van het laboratorium.", { naam: cl.naam, b: a.buiten, n: a.beoordeeld }));
    else zin.push(t("{g} van de {n} beoordeelde waarden vallen binnen het referentiebereik van het laboratorium.", { g: a.beoordeeld - a.buiten, n: a.beoordeeld }));
    if (buiten.length) zin.push(t("Buiten het bereik: {lijst}.", { lijst: lijst(lang) }), t("Hieronder staat per waarde wat dit kan betekenen. Bespreek afwijkende waarden altijd met de arts."));
    else zin.push(t("Er zijn geen waarden buiten het bereik gevonden."));
    return zin.join(" ");
  };
  const ai = async (lang, rol) => {
    if (!env.AI) return null;
    const system = rol === "client"
      ? `You write a short, clear summary of a blood test report for a coaching client. It is shown in their nutrition and training app.
Write in ${lang === "nl" ? "Dutch (formal 'u')" : TAAL_NAAM[lang] || "English"}. 80-160 words, plain language, short paragraphs, plain text: no headings, no markdown, no emoji.
Start directly with the overall picture (how many values are within the lab's reference range), without an introduction such as "Here is a summary". Then explain the values outside the range in simple words and what they commonly relate to in nutrition, lifestyle or training, with one or two practical food or lifestyle tips where they fit. Mention clear changes compared with the previous test.
Rules: you are not a doctor. Never diagnose a disease or condition, never say what the client "has" (write "can point to" or "is often linked to"), never recommend medication or supplement doses. Only use the values given and state them exactly; call a value low or high only when it is marked LOW or HIGH. End by advising them to discuss values outside the range with their doctor.${a.urgent ? " Some values are marked URGENT: start by saying they should contact their doctor today about these values." : ""}`
      : `You write a short brief for a nutrition and training coach (${coach.naam}) about their client's blood test.
Write in ${TAAL_NAAM[lang] || "English"}. 70-150 words, plain text; you may use short lines starting with "- ". No headings, no markdown bold.
Cover: the values outside the range and what they mean for the client's nutrition and training (for example iron-rich food, energy intake, recovery, training load, hydration), what to keep an eye on, and whether the client should see a doctor.
Start directly with the findings: no greeting, no "Dear", no sign-off. Refer to the client by first name.
Rules: no diagnoses (write "can point to", not "indicates deficiency"), no medication or supplement doses. Only use the values given and state them exactly; call a value low or high only when it is marked LOW or HIGH.${a.urgent ? " Some values are marked URGENT: start by saying the client should contact their doctor today." : ""}`;
    try {
      const res = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: [{ role: "system", content: system }, { role: "user", content: feiten }], max_tokens: 500, temperature: 0.3 });
      const txt = String(typeof res.response === "string" ? res.response : "").replace(/\*\*|^#+\s*/gm, "").trim();
      return txt.length >= 60 ? txt.slice(0, 2000) : null;
    } catch (e) { console.error("blood summary AI failed", e); return null; }
  };
  const lc = cl.taal || hint || "nl", lk = (coach && coach.taal) || "nl";
  const [tc, tk] = await Promise.all([ai(lc, "client"), ai(lk, "coach")]);
  const samenvatting = { client: { taal: lc, tekst: tc || sjabloon(lc, "client"), ai: !!tc }, coach: { taal: lk, tekst: tk || sjabloon(lk, "coach"), ai: !!tk } };
  await env.DB.prepare("UPDATE bloedonderzoek SET samenvatting = ? WHERE id = ?").bind(JSON.stringify(samenvatting), id).run();
  return a;
}

// the other side hears about a new report; urgent values are flagged to the coach
async function bloedMelden(c, cl, door, a) {
  if (!a) return;
  if (door === "client") await notify(c.env, "coach", cl.coach_id, a.urgent
    ? { titel: "Let op: bloedonderzoek van {naam}", v: { naam: cl.naam }, tekst: "Eén of meer waarden zijn sterk afwijkend. De cliënt krijgt het advies vandaag contact op te nemen met de arts.", url: `/coach/#/client/${cl.id}/bloed` }
    : { titel: "{naam} heeft een bloedonderzoek geüpload", v: { naam: cl.naam, b: a.buiten, n: a.beoordeeld }, tekst: "{b} van de {n} beoordeelde waarden vallen buiten het referentiebereik. Het rapport staat klaar.", url: `/coach/#/client/${cl.id}/bloed` }, c.now);
  else await notify(c.env, "client", cl.id, { titel: "Uw bloedonderzoek is geanalyseerd", tekst: "Uw coach heeft uw bloedonderzoek toegevoegd. De samenvatting staat onder Voortgang.", url: "/app/?v=voortgang" }, c.now);
}

async function bloedUpload(c, cl, door) {
  if (door === "client" && !cl.bloed_akkoord) fail(403, "Geef eerst toestemming voor het verwerken van uw bloedonderzoek.");
  if (door === "coach" && c.url.searchParams.get("akkoord") !== "1") fail(400, "Bevestig dat de cliënt toestemming heeft gegeven.");
  if (!c.env.AI) fail(503, "Automatisch uitlezen is hier niet beschikbaar. Vul de waarden handmatig in.");
  if (Number(c.req.headers.get("content-length")) > MAX_BLOED) fail(413, "Het bestand is te groot (max. 10 MB).");
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > MAX_BLOED) fail(413, "Het bestand is te groot (max. 10 MB).");
  const type = buf.length > 12 ? (isPdf(buf) ? "application/pdf" : imageType(buf)) : null;
  if (!type) fail(415, "Upload een PDF of een foto (JPEG, PNG of WebP).");
  const bij = Number(c.url.searchParams.get("bij")) || 0;
  const oud = bij ? await c.env.DB.prepare("SELECT * FROM bloedonderzoek WHERE id = ? AND client_id = ?").bind(bij, cl.id).first() : null;
  if (bij && !oud) fail(404, "Bloedonderzoek niet gevonden.");
  await bloedLimiet(c, cl.id);
  const uit = await aiBloed(c.env, buf, type);
  const waarden = cleanWaarden((Array.isArray(uit.waarden) ? uit.waarden : []).slice(0, 120)
    .map((w) => ({ naam: w && w.naam, waarde: w && w.waarde, eenheid: w && w.eenheid, ref_tekst: w && w.ref, vlag: w && w.vlag })));
  if (!waarden.length) fail(422, "Er zijn geen bloedwaarden in dit bestand gevonden. Probeer een scherpere foto of vul de waarden handmatig in.");
  const key = `b/${cl.id}/${randomToken(12)}`;
  await c.env.FOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  const bestand = { key, type, bytes: buf.length, naam: String(c.url.searchParams.get("naam") || "").slice(0, 100) };
  let id = bij;
  if (oud) {
    const r = bloedRij(oud), namen = new Set(r.waarden.map((w) => w.naam.toLowerCase()));
    const alle = [...r.waarden, ...waarden.filter((w) => !namen.has(w.naam.toLowerCase()))].slice(0, 120);
    await c.env.DB.prepare("UPDATE bloedonderzoek SET bestanden = ?, waarden = ?, lab = COALESCE(NULLIF(lab, ''), ?), updated_at = ? WHERE id = ?")
      .bind(JSON.stringify([...r.bestanden, bestand].slice(0, 10)), JSON.stringify(alle), String(uit.lab || "").slice(0, 100), c.now, id).run();
  } else {
    const d = vandaag(c.now), datum = isDate(uit.datum) && uit.datum <= d && uit.datum >= "2000-01-01" ? uit.datum : d;
    id = (await c.env.DB.prepare("INSERT INTO bloedonderzoek (client_id, datum, lab, bestanden, waarden, door, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(cl.id, datum, String(uit.lab || "").slice(0, 100), JSON.stringify([bestand]), JSON.stringify(waarden), door, c.now, c.now).first()).id;
  }
  const a = await bloedSamenvatting(c.env, cl.id, id, door === "client" ? pickLang(c.req, c.url) : null);
  if (!oud) await bloedMelden(c, cl, door, a);
  return json({ id, bloed: await bloedLijst(c.env, cl.id, pickLang(c.req, c.url), door) }, 201);
}

// manual entry, or a correction of the values the AI read; the summary is written again
function bloedVelden(c, oud) {
  const datum = c.body.datum === undefined && oud ? oud.datum : c.body.datum;
  if (!isDate(datum) || datum > vandaag(c.now + DAY)) fail(400, "Kies een geldige datum.");
  const waarden = cleanWaarden(c.body.waarden);
  if (!waarden.length) fail(400, "Vul minimaal één waarde in.");
  return { datum, lab: c.body.lab === undefined && oud ? oud.lab || "" : str(c.body.lab, 100, "Laboratorium"), waarden };
}
async function bloedNieuw(c, cl, door) {
  if (door === "client" && !cl.bloed_akkoord) fail(403, "Geef eerst toestemming voor het verwerken van uw bloedonderzoek.");
  const v = bloedVelden(c, null);
  await bloedLimiet(c, cl.id);
  const { id } = await c.env.DB.prepare("INSERT INTO bloedonderzoek (client_id, datum, lab, waarden, door, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(cl.id, v.datum, v.lab, JSON.stringify(v.waarden), door, c.now, c.now).first();
  await bloedMelden(c, cl, door, await bloedSamenvatting(c.env, cl.id, id, door === "client" ? pickLang(c.req, c.url) : null));
  return json({ id, bloed: await bloedLijst(c.env, cl.id, pickLang(c.req, c.url), door) }, 201);
}
async function bloedWijzig(c, cl, door, id) {
  const oud = await c.env.DB.prepare("SELECT * FROM bloedonderzoek WHERE id = ? AND client_id = ?").bind(id, cl.id).first();
  if (!oud) fail(404, "Bloedonderzoek niet gevonden.");
  const v = bloedVelden(c, oud);
  await bloedLimiet(c, cl.id);
  await c.env.DB.prepare("UPDATE bloedonderzoek SET datum = ?, lab = ?, waarden = ?, updated_at = ? WHERE id = ?").bind(v.datum, v.lab, JSON.stringify(v.waarden), c.now, id).run();
  await bloedSamenvatting(c.env, cl.id, id, door === "client" ? pickLang(c.req, c.url) : null);
  return json({ bloed: await bloedLijst(c.env, cl.id, pickLang(c.req, c.url), door) });
}
async function bloedVerwijder(c, cl, door, id) {
  const oud = await c.env.DB.prepare("SELECT bestanden FROM bloedonderzoek WHERE id = ? AND client_id = ?").bind(id, cl.id).first();
  if (oud) {
    await c.env.DB.prepare("DELETE FROM bloedonderzoek WHERE id = ?").bind(id).run();
    const keys = JSON.parse(oud.bestanden || "[]").map((b) => b.key);
    if (keys.length) await c.env.FOTOS.delete(keys);
  }
  return json({ bloed: await bloedLijst(c.env, cl.id, pickLang(c.req, c.url), door) });
}
async function bloedBestand(c, clientId, id, n) {
  const row = await c.env.DB.prepare("SELECT bestanden FROM bloedonderzoek WHERE id = ? AND client_id = ?").bind(id, clientId).first();
  const b = row && JSON.parse(row.bestanden || "[]")[n];
  const obj = b && await c.env.FOTOS.get(b.key);
  if (!obj) fail(404, "Bestand niet gevonden.");
  return new Response(obj.body, { headers: { "content-type": b.type, "content-length": String(b.bytes), "cache-control": "private, max-age=3600", "content-disposition": "inline", "x-content-type-options": "nosniff" } });
}
async function bloedAkkoord(c) {
  if (c.body.akkoord !== true) fail(400, "Geef toestemming om verder te gaan.");
  await c.env.DB.prepare("UPDATE clients SET bloed_akkoord = COALESCE(bloed_akkoord, ?) WHERE id = ?").bind(c.now, c.client.id).run();
  return json({ bloedAkkoord: c.client.bloed_akkoord || c.now });
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
    if (!m.length) fail(400, 'Kies de spiergroep van "{x}".', undefined, { x: n });
    oefeningen[k] = { n, eq: EQUIP.includes(e.eq) ? e.eq : "Overig", m, s: (Array.isArray(e.s) ? e.s : []).filter((x) => MUSCLES.includes(x) && !m.includes(x)).slice(0, 3),
      rust: Math.min(300, Math.max(30, Math.round(Number(e.rust) || 90))), cue: str(e.cue, 300, "Uitleg") || "Voer de oefening gecontroleerd uit over de volledige bewegingsbaan." };
  }
  const dagenIn = Array.isArray(d.dagen) ? d.dagen : [];
  if (!dagenIn.length || dagenIn.length > 7) fail(400, "Een programma heeft 1 tot 7 trainingsdagen.");
  const dagen = dagenIn.map((day, i) => {
    const dn = str(day && day.naam, 40, "Naam dag") || `Dag ${i + 1}`;
    const ex = (Array.isArray(day.ex) ? day.ex : []).map((x) => {
      const id = String(x && x.id || "");
      if (!BASE_EX.has(id) && !oefeningen[id]) fail(400, "Onbekende oefening op {x}.", undefined, { x: dn });
      const reps = (Array.isArray(x.reps) ? x.reps : []).map(Number);
      if (!reps.length || reps.length > 10 || reps.some((r) => !Number.isInteger(r) || r < 1 || r > 100)) fail(400, "Controleer de herhalingen op {x} (1 tot 10 sets van 1–100).", undefined, { x: dn });
      return { id, reps };
    });
    if (!ex.length || ex.length > 15) fail(400, "{x} heeft 1 tot 15 oefeningen nodig.", undefined, { x: dn });
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
    customer_email: addr, locale: stripeLocale(c), allow_promotion_codes: "true",
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
  const p = await stripe(c.env, "POST", "/billing_portal/sessions", { customer: c.client.stripe_customer, return_url: `${c.url.origin}/app/`, locale: stripeLocale(c), configuration: c.env.STRIPE_PORTAL_CONFIG || undefined });
  return json({ url: p.url });
}
async function clientResubscribe(c) {
  if (!billingReady(c.env)) fail(503, "Betalingen zijn nog niet ingesteld.");
  if (c.client.abo_status && ACTIVE_SUB.includes(c.client.abo_status)) fail(409, "Uw abonnement is al actief.");
  if (!c.client.abo_status) fail(400, "Uw toegang loopt via uw coach.");
  const coach = await c.env.DB.prepare("SELECT * FROM coaches WHERE id = ?").bind(c.client.coach_id).first();
  const s = await stripe(c.env, "POST", "/checkout/sessions", checkoutParams(c, payPlan(c.env, coach), {
    ...(c.client.stripe_customer ? { customer: c.client.stripe_customer } : { customer_email: c.client.email }),
    naam: c.client.naam, email: c.client.email, coachId: coach.id, cancel: `${c.url.origin}/app/`,
  }));
  return json({ url: s.url });
}
async function clientBillingInfo(c) {
  const coach = await c.env.DB.prepare("SELECT * FROM coaches WHERE id = ?").bind(c.client.coach_id).first();
  let prijs = null;
  try { const p = payPlan(c.env, coach); prijs = p.bedrag != null ? { bedrag: p.bedrag, valuta: p.valuta } : null; } catch (e) { /* not payable right now */ }
  if (!prijs && coach.is_owner && Number(c.env.PRIJS_CLIENT) > 0) prijs = { bedrag: Number(c.env.PRIJS_CLIENT), valuta: c.env.VALUTA || "USD" };
  return json({ status: c.client.abo_status, coach: coach.naam, prijs, portaal: !!c.client.stripe_customer, betalingen: billingReady(c.env) });
}

// ---------- Stripe Connect: coaches get paid by their own clients ----------
// Destination charges: the subscription lives on the platform account, each payment is transferred to the
// coach's Express account (minus CONNECT_FEE_PERCENT for the platform). Works for coaches in other countries
// than the platform (cross-border payouts, "recipient" service agreement).
const CONNECT_LANDEN = ["US", "CA", "MX", "BR", "GB", "IE", "NL", "BE", "LU", "DE", "AT", "CH", "FR", "ES", "PT", "IT",
  "DK", "SE", "NO", "FI", "PL", "CZ", "AU", "NZ", "SG", "HK", "JP", "AE"];
const connectFee = (env) => Math.min(50, Math.max(0, Number(env.CONNECT_FEE_PERCENT) || 0));
// what a client of this coach pays, and where the money goes
function payPlan(env, coach) {
  if (!billingReady(env)) fail(503, "Betalingen zijn nog niet ingesteld.");
  if (coach.is_owner) return { price: env.STRIPE_PRICE_CLIENT, bedrag: null };
  if (!coach.connect_account || coach.connect_status !== "actief") fail(409, "Online betalen is voor deze coach nog niet ingesteld.");
  if (!coach.client_price) fail(409, "Stel eerst uw maandprijs voor cliënten in.");
  return { price: coach.client_price, destination: coach.connect_account, fee: connectFee(env), bedrag: coach.client_prijs / 100, valuta: coach.client_valuta || "USD" };
}
function checkoutParams(c, plan, o) {
  return {
    mode: "subscription", line_items: [{ price: plan.price, quantity: 1 }], locale: stripeLocale(c),
    ...(o.customer ? { customer: o.customer } : { customer_email: o.customer_email }),
    metadata: { type: "client", naam: o.naam, email: o.email, coach_id: String(o.coachId) },
    subscription_data: {
      metadata: { type: "client", email: o.email, coach_id: String(o.coachId) },
      ...(plan.destination ? { transfer_data: { destination: plan.destination }, ...(plan.fee ? { application_fee_percent: plan.fee } : {}) } : {}),
    },
    success_url: `${c.url.origin}/app/?betaald={CHECKOUT_SESSION_ID}`, cancel_url: o.cancel,
  };
}
// Stripe refuses Connect calls until Connect is activated on the platform account (dashboard → Connect)
async function connectCall(c, method, path, params) {
  try { return await stripe(c.env, method, path, params); }
  catch (e) { if (e instanceof HttpError && e.status === 502) fail(503, "Uitbetalen aan coaches is nog niet geactiveerd op het platform. Probeer het later opnieuw."); throw e; }
}
async function refreshConnect(c) {
  const k = c.coach;
  if (!k.connect_account) return k;
  const a = await connectCall(c, "GET", `/accounts/${k.connect_account}`);
  const transfers = a.capabilities && a.capabilities.transfers;
  const status = transfers === "active" && a.payouts_enabled ? "actief" : a.details_submitted ? "beperkt" : "onboarding";
  if (status !== k.connect_status) await c.env.DB.prepare("UPDATE coaches SET connect_status = ? WHERE id = ?").bind(status, k.id).run();
  return { ...k, connect_status: status };
}
function connectOut(env, k) {
  return { beschikbaar: billingReady(env) && !k.is_owner, eigenaar: !!k.is_owner, status: k.connect_account ? k.connect_status : null, land: k.connect_land,
    prijs: k.client_prijs ? { bedrag: k.client_prijs / 100, valuta: k.client_valuta || "USD" } : null, fee: connectFee(env), landen: CONNECT_LANDEN };
}
async function connectStatus(c) {
  const k = c.coach.connect_account && c.coach.connect_status !== "actief" ? await refreshConnect(c) : c.coach;
  return json(connectOut(c.env, k));
}
async function connectStart(c) {
  if (c.coach.is_owner) fail(400, "Betalingen van uw eigen cliënten lopen al via het platform.");
  if (!billingReady(c.env)) fail(503, "Betalingen zijn nog niet ingesteld.");
  let acct = c.coach.connect_account;
  if (!acct) {
    const land = String(c.body.land || "").toUpperCase();
    if (!CONNECT_LANDEN.includes(land)) fail(400, "Kies het land van uw bankrekening.");
    const platform = (c.env.CONNECT_PLATFORM_COUNTRY || "US").toUpperCase();
    const a = await connectCall(c, "POST", "/accounts", {
      type: "express", country: land, email: c.coach.email,
      capabilities: { transfers: { requested: "true" }, ...(land === platform ? { card_payments: { requested: "true" } } : {}) },
      ...(land !== platform ? { tos_acceptance: { service_agreement: "recipient" } } : {}),
      business_profile: { product_description: "Online nutrition and training coaching", mcc: "7997" },
      metadata: { coach_id: String(c.coach.id) },
    });
    acct = a.id;
    await c.env.DB.prepare("UPDATE coaches SET connect_account = ?, connect_status = 'onboarding', connect_land = ? WHERE id = ?").bind(acct, land, c.coach.id).run();
  }
  const link = await connectCall(c, "POST", "/account_links", {
    account: acct, type: "account_onboarding",
    refresh_url: `${c.url.origin}/coach/?connect=opnieuw#/instellingen`, return_url: `${c.url.origin}/coach/?connect=klaar#/instellingen`,
  });
  return json({ url: link.url });
}
async function connectSetPrice(c) {
  if (c.coach.is_owner) fail(400, "Betalingen van uw eigen cliënten lopen al via het platform.");
  if (!c.coach.connect_account) fail(409, "Koppel eerst uw Stripe-account.");
  const bedrag = Number(c.body.bedrag);
  if (!Number.isFinite(bedrag) || bedrag < 5 || bedrag > 5000) fail(400, "Kies een maandprijs tussen 5 en 5000.");
  const cents = Math.round(bedrag * 100), valuta = (c.env.VALUTA || "USD").toUpperCase();
  if (cents === c.coach.client_prijs && c.coach.client_price) return json(connectOut(c.env, c.coach));
  let product = c.coach.client_product;
  if (!product) product = (await connectCall(c, "POST", "/products", { name: `Coaching — ${c.coach.naam}`.slice(0, 200), metadata: { coach_id: String(c.coach.id) } })).id;
  const price = await connectCall(c, "POST", "/prices", { product, unit_amount: cents, currency: valuta.toLowerCase(), recurring: { interval: "month" }, metadata: { coach_id: String(c.coach.id) } });
  // new sign-ups get the new price; running subscriptions keep theirs
  if (c.coach.client_price) await connectCall(c, "POST", `/prices/${c.coach.client_price}`, { active: "false" }).catch(() => {});
  await c.env.DB.prepare("UPDATE coaches SET client_product = ?, client_price = ?, client_prijs = ?, client_valuta = ? WHERE id = ?").bind(product, price.id, cents, valuta, c.coach.id).run();
  return json(connectOut(c.env, { ...c.coach, client_product: product, client_price: price.id, client_prijs: cents, client_valuta: valuta }));
}
async function connectDashboard(c) {
  if (!c.coach.connect_account) fail(409, "Koppel eerst uw Stripe-account.");
  const k = await refreshConnect(c);
  if (k.connect_status === "onboarding") return connectStart(c);
  return json({ url: (await connectCall(c, "POST", `/accounts/${k.connect_account}/login_links`)).url });
}
// storefront "Start now": a prospect subscribes directly to this coach
async function storefrontCheckout(c) {
  await checkoutGuard(c);
  const k = await c.env.DB.prepare("SELECT * FROM coaches WHERE slug = ?").bind(c.params[0]).first();
  if (!winkelVisible(k)) fail(404, "Deze coach is niet gevonden.");
  const plan = payPlan(c.env, k);
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const addr = email(c.body.email);
  if (c.body.akkoord !== true) fail(400, "Ga akkoord met de voorwaarden en de privacyverklaring.");
  const existing = await c.env.DB.prepare("SELECT abo_status FROM clients WHERE email = ?").bind(addr).first();
  if (existing && !existing.abo_status) fail(409, "Dit e-mailadres heeft al een account via een coach. Log in via de app.");
  if (existing && ACTIVE_SUB.includes(existing.abo_status)) fail(409, "Er is al een actief abonnement voor dit e-mailadres. Log in via de app.");
  const s = await stripe(c.env, "POST", "/checkout/sessions", checkoutParams(c, plan, {
    customer_email: addr, naam, email: addr, coachId: k.id, cancel: `${c.url.origin}/c/${k.slug}`,
  }));
  return json({ url: s.url });
}

// --- coaches: platform subscription
async function coachInstellingen(env, id) {
  const r = await env.DB.prepare("SELECT auto_checkin, auto_training, auto_plan, email_aan, email_berichten FROM coaches WHERE id = ?").bind(id).first();
  return { autoCheckin: !!r.auto_checkin, autoTraining: !!r.auto_training, autoPlan: !!r.auto_plan, emailAan: !!r.email_aan, emailBerichten: !!r.email_berichten, emailBeschikbaar: !!env.RESEND_API_KEY };
}
async function coachMeInfo(c) {
  const k = c.coach;
  return json({ id: k.id, naam: k.naam, email: k.email, taal: k.taal || null, isOwner: !!k.is_owner, status: k.is_owner ? "actief" : k.status,
    aboStatus: k.abo_status, aboEinde: k.abo_einde, portaal: !!k.stripe_customer, betalingen: billingReady(c.env), merk: merkOut(k),
    avatar: avatarUrl("coach", k), slug: k.slug, connect: connectOut(c.env, k),
    ...(await coachInstellingen(c.env, k.id)),
    nieuweAanvragen: (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM aanvragen WHERE coach_id = ? AND status = 'nieuw'").bind(k.id).first()).n });
}
async function coachSessionFor(c, coachId, customer, mail) {
  return stripe(c.env, "POST", "/checkout/sessions", {
    mode: "subscription", line_items: [{ price: c.env.STRIPE_PRICE_COACH, quantity: 1 }], locale: stripeLocale(c), allow_promotion_codes: "true",
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
  const p = await stripe(c.env, "POST", "/billing_portal/sessions", { customer: c.coach.stripe_customer, return_url: `${c.url.origin}/coach/`, locale: stripeLocale(c), configuration: c.env.STRIPE_PORTAL_CONFIG || undefined });
  return json({ url: p.url });
}
async function ownerCoaches(c) {
  if (!c.coach.is_owner) fail(403, "Alleen voor de eigenaar van het platform.");
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.naam, k.email, k.is_owner, k.status, k.abo_status, k.abo_einde, k.created_at, k.connect_status, k.client_prijs,
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
const BERICHT_COLS = "id, van, tekst, foto_key IS NOT NULL AS foto, checkin_id, gelezen, created_at, auto";
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
    ? ["client", cl.id, { titel: extra.checkin_id ? "Uw coach reageerde op uw check-in" : "Nieuw bericht van uw coach", tekst: preview, raw: !!tekst, url: "/app/?v=coach" }]
    : ["coach", cl.coach_id, { titel: "Bericht van {naam}", v: { naam: cl.naam }, tekst: preview, raw: !!tekst, soort: "bericht", url: `/coach/#/client/${cl.id}/berichten` }];
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
// n.titel / n.tekst are Dutch source text with {placeholders} from n.v; n.raw = tekst is user content (not translated)
async function notify(env, role, subjectId, n, now) {
  try {
    const who = await env.DB.prepare(`SELECT taal FROM ${role === "coach" ? "coaches" : "clients"} WHERE id = ?`).bind(subjectId).first();
    const lang = (who && who.taal) || "nl";
    const titel = tr(lang, n.titel, n.v), tekst = n.raw ? n.tekst : tr(lang, n.tekst, n.v);
    await env.DB.prepare("INSERT INTO notificaties (role, subject_id, titel, tekst, url, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(role, subjectId, titel, tekst, n.url, now).run();
    if (role === "coach") await coachEmail(env, subjectId, lang, titel, tekst, n);
    if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC) return;
    const { results } = await env.DB.prepare("SELECT endpoint FROM push_subs WHERE role = ? AND subject_id = ?").bind(role, subjectId).all();
    await Promise.all(results.map((s) => sendPush(env, s.endpoint, now).catch((e) => console.error("push", e))));
  } catch (e) { console.error("notify failed", e); }
}
// Email copy of a coach notification via Resend (RESEND_API_KEY). Without an own domain Resend only delivers to the
// account owner's address; failures are logged and never block the notification itself.
async function coachEmail(env, coachId, lang, titel, tekst, n) {
  if (!env.RESEND_API_KEY) return;
  try {
    const k = await env.DB.prepare("SELECT email, email_aan, email_berichten FROM coaches WHERE id = ?").bind(coachId).first();
    if (!k || !k.email_aan || (n.soort === "bericht" && !k.email_berichten)) return;
    const h = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    const link = (env.APP_URL || "https://dcramere-voeding.dcramere.workers.dev") + (n.url || "/coach/");
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1d1b16">
      <p style="font-size:11px;letter-spacing:3px;color:#a37f00;font-weight:bold;margin:0 0 8px">DCRAMERE COACHING</p>
      <h2 style="font-size:20px;margin:0 0 12px">${h(titel)}</h2>
      <p style="font-size:15px;line-height:1.55;white-space:pre-wrap;margin:0 0 20px">${h(tekst)}</p>
      <a href="${h(link)}" style="display:inline-block;background:#f4d03f;color:#0a0a0a;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px">${h(tr(lang, "Openen in het dashboard"))}</a>
      <p style="font-size:12px;color:#888;margin-top:24px">${h(tr(lang, "U ontvangt deze e-mail omdat e-mailmeldingen aan staan. Zet ze uit onder Instellingen in het dashboard."))}</p></div>`;
    const r = await fetch(`${env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
      method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM || "DCRAMERE Coaching <onboarding@resend.dev>", to: [k.email], subject: titel, html, text: `${titel}\n\n${tekst}\n\n${link}` }),
    });
    if (!r.ok) console.error("email failed", r.status, await r.text().catch(() => ""));
  } catch (e) { console.error("email failed", e); }
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

// ---------- adaptive targets ----------
// Once a week per client: compare the actual weight trend (least squares over the last 21 days) with the
// rate the goal should produce, and move the daily target by 100 kcal when it's off. Uses the app's own
// formulas (public/core.js) so the client's plan, the safe minimum and this check always agree.
const ADAPT_STAP = 100, ADAPT_MAX = 500, ADAPT_WEEK = 7 * DAY, ADAPT_RUST = 14 * DAY, ADAPT_VENSTER = 21;
// % of body weight per week that counts as "on track", per goal
const ADAPT_TEMPO = { "-0.2": [-1.0, -0.5], "-0.1": [-0.75, -0.25], "0": [-0.25, 0.25], "0.1": [0.1, 0.5] };
// weight trend in % of body weight per week (least squares over the last 21 days); null with too few weigh-ins
function gewichtsTempo(metingen, now) {
  const sinds = new Date((now - ADAPT_VENSTER * DAY) * 1000).toISOString().slice(0, 10);
  const pts = metingen.filter((m) => m.datum >= sinds && m.gewicht > 0).map((m) => [Date.parse(m.datum + "T12:00:00Z") / 864e5, +m.gewicht]);
  if (pts.length < 4 || pts[pts.length - 1][0] - pts[0][0] < 14) return null;
  const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const slope = pts.reduce((t, p) => t + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((t, p) => t + (p[0] - mx) ** 2, 0); // kg per day
  return Math.round(slope * 7 / my * 1000) / 10;
}
function adaptiefBesluit(P, metingen, a, now) {
  const band = ADAPT_TEMPO[String(P.doel)];
  if (!band) return null;
  const tempo = gewichtsTempo(metingen, now);
  if (tempo == null) return { status: "te weinig metingen" };
  if (tempo >= band[0] && tempo <= band[1]) return { status: "op schema", tempo };
  if (now - a.gewijzigd < ADAPT_RUST) return { status: "wacht op effect", tempo };
  const delta = tempo > band[1] ? -ADAPT_STAP : ADAPT_STAP;
  const reden = P.doel < 0 ? (delta < 0 ? "gewicht daalt te langzaam" : "gewicht daalt te snel") : P.doel > 0 ? (delta < 0 ? "gewicht stijgt te snel" : "gewicht stijgt te langzaam") : (delta < 0 ? "gewicht stijgt" : "gewicht daalt");
  if (Math.abs(a.kcal + delta) > ADAPT_MAX) return { status: "maximum bereikt", tempo };
  const laatste = metingen[metingen.length - 1];
  const van = DC.analyse({ ...P, bijstelling: a.kcal }, laatste).kcal, naar = DC.analyse({ ...P, bijstelling: a.kcal + delta }, laatste).kcal;
  if (naar === van) return { status: "veilige ondergrens", tempo }; // already at the safe minimum
  return { status: "bijgesteld", tempo, delta, van, naar, reden };
}
async function adaptiefRun(env, now) {
  const { results } = await env.DB.prepare(
    `SELECT id, coach_id, naam, profiel, doelen, adaptief FROM clients
     WHERE actief = 1 AND demo = 0 AND profiel IS NOT NULL AND doelen IS NULL
       AND (abo_status IS NULL OR abo_status IN ('active','trialing','past_due'))`).all();
  let n = 0;
  for (const c of results) {
    try {
      const a = adaptiefOf(c);
      if (a.uit || now - a.laatst < ADAPT_WEEK - DAY / 2) continue;
      const P = JSON.parse(c.profiel), metingen = await metingenOf(env, c.id);
      const b = metingen.length ? adaptiefBesluit(P, metingen, a, now) : null;
      a.laatst = now;
      if (b && b.status === "bijgesteld") {
        a.kcal += b.delta; a.gewijzigd = now;
        a.historie = [...a.historie, { t: now, van: b.van, naar: b.naar, delta: b.delta, tempo: b.tempo, reden: b.reden }].slice(-20);
        n++;
      }
      await env.DB.prepare("UPDATE clients SET adaptief = ? WHERE id = ?").bind(JSON.stringify(a), c.id).run();
      if (b && b.status === "bijgesteld") {
        await notify(env, "coach", c.coach_id, { titel: "Dagdoel van {naam} automatisch bijgesteld", tekst: "{van} → {naar} kcal: {reden} ({tempo}% per week).",
          v: { naam: c.naam, van: b.van, naar: b.naar, reden: b.reden, tempo: b.tempo }, url: `/coach/#/client/${c.id}/profiel` }, now);
        await notify(env, "client", c.id, { titel: "Uw plan is bijgesteld", tekst: "Op basis van uw voortgang is uw dagdoel nu {naar} kcal. Uw menu is aangepast.",
          v: { naar: b.naar }, url: "/app/?v=plan" }, now);
      }
    } catch (e) { console.error("adaptief", c.id, e); }
  }
  if (n) console.log(`adaptive targets adjusted: ${n}`);
}

// ---------- automatic check-in replies ----------
// Right after a check-in: gather the client's context, let Workers AI write a short reply in the coach's voice and
// the client's language, and post it in the chat under that check-in (as the coach). Without AI, or when the
// model fails, a template reply built from the same data goes out, so the client always gets an answer.
// check-in questions: key, English name, meaning of a low score, of a high score, which end is bad
const CHECK_UITLEG = [["energie", "energy", "low energy", "high energy", "laag"], ["honger", "hunger", "little hunger", "very hungry", "hoog"],
  ["slaap", "sleep", "poor sleep", "good sleep", "laag"], ["stress", "stress", "little stress", "a lot of stress", "hoog"], ["naleving", "followed the plan", "barely followed the plan", "followed the plan well", "laag"]];
const TAAL_NAAM = { nl: "Dutch (informal 'je')", en: "English", pt: "Brazilian Portuguese (use 'você')", es: "Spanish (informal 'tú')" };
const RODE_VLAG = /pijn|blessure|geblesseerd|gevoelig|ziek|sore|ache|dokter|arts|opgeven|stoppen|pain|injur|hurt|sick|ill\b|doctor|quit|give up|\bdor\b|lesão|machuc|doente|médico|desistir|dolor|lesión|lesion|enferm|rendirme|dejarlo/i;
async function checkinContext(env, client, k, now) {
  const P = profielOut(client) || null, metingen = await metingenOf(env, client.id);
  const laatste = metingen[metingen.length - 1];
  const A = P && laatste ? DC.analyse(P, laatste) : null, D = A ? DC.dagTargets(P, A) : null;
  const iso = (d) => new Date((now - d * DAY) * 1000).toISOString().slice(0, 10);
  const dagen = (await env.DB.prepare("SELECT datum, SUM(kcal) AS kcal, SUM(eiwit) AS eiwit FROM dagboek WHERE client_id = ? AND datum >= ? GROUP BY datum").bind(client.id, iso(7)).all()).results;
  const trainingen = (await env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE client_id = ? AND datum >= ?").bind(client.id, iso(7)).first()).n;
  const vorige = (await env.DB.prepare("SELECT energie, honger, slaap, stress, naleving FROM checkins WHERE client_id = ? AND datum < ? ORDER BY datum DESC LIMIT 1").bind(client.id, k.datum).first());
  const intake = client.intake ? JSON.parse(client.intake) : null, a = adaptiefOf(client);
  const coach = await env.DB.prepare("SELECT auto_training FROM coaches WHERE id = ?").bind(client.coach_id).first();
  let training = null;
  if (client.programma) {
    const pr = JSON.parse(client.programma), def = await programDef(env, pr.id, client.coach_id);
    const today = new Date(now * 1000).toISOString().slice(0, 10);
    training = { naam: (def && def.naam) || "Push · Pull · Legs", dagen: def ? def.dagen.length : null, week: Math.max(1, Math.floor((Date.parse(today) - Date.parse(pr.start)) / (7 * 864e5)) + 1),
      licht: coach && coach.auto_training ? TR.bijsturing([{ ...k }], today) : null };
  }
  return { P, A, D, laatste, eerste: metingen[0], tempo: gewichtsTempo(metingen, now), dagen, trainingen, vorige, intake, a, training };
}
// which check-in answers need attention (same rule as the dashboard: low energy/sleep/adherence, high hunger/stress)
const checkinVlaggen = (k) => ["energie", "slaap", "naleving"].filter((x) => k[x] <= 2).concat(["honger", "stress"].filter((x) => k[x] >= 4));
function sjabloonAntwoord(lang, client, k, ctx, rood) {
  const t = (s, v) => tr(lang, s, v), zin = [t("Hoi {naam}, bedankt voor je check-in!", { naam: client.naam.split(" ")[0] })];
  if (ctx.tempo != null && ctx.P) {
    const goed = ctx.P.doel < 0 ? ctx.tempo < -0.2 : ctx.P.doel > 0 ? ctx.tempo > 0.05 : Math.abs(ctx.tempo) <= 0.25;
    zin.push(goed ? t("Je gewicht gaat de goede kant op ({x}% per week), ga zo door.", { x: ctx.tempo }) : t("Je gewicht beweegt de laatste weken nog niet genoeg; we sturen bij waar nodig."));
  }
  const tips = { energie: "Je energie is laag: probeer op tijd te slapen en eet je koolhydraten rond je training.",
    honger: "Veel honger? Eet meer groente bij je maaltijden, drink genoeg water en verdeel je eiwit over de dag.",
    slaap: "Je slaap kan beter: ga elke dag rond dezelfde tijd naar bed, zonder scherm het laatste halfuur.",
    stress: "Veel stress deze week. Een wandeling van 20 minuten per dag helpt echt, en wees niet te streng voor jezelf.",
    naleving: "Het plan volgen ging lastig. Kies één maaltijd die je deze week elke dag precies volgens het plan eet, en bouw vanaf daar op." };
  const v = checkinVlaggen(k);
  if (v.length) v.slice(0, 2).forEach((x) => zin.push(t(tips[x]))); else zin.push(t("Je scores zien er goed uit, mooi zo."));
  if (rood) zin.push(t("Je noemt iets wat ik persoonlijk wil bekijken. Ik kom er zo snel mogelijk bij je op terug; neem bij pijn rust en raadpleeg zo nodig een arts."));
  zin.push(t("Houd je metingen en dagboek bij, dan stuur ik waar nodig bij. 💪"));
  return zin.join(" ");
}
async function aiAntwoord(env, lang, client, coach, k, ctx, rood) {
  if (!env.AI) return null;
  const doel = { "-0.2": "burn fat", "-0.1": "lose weight gradually", "0": "maintain weight", "0.1": "build muscle" }[String(ctx.P && ctx.P.doel)] || "not set";
  const logged = ctx.dagen.length, gem = logged ? Math.round(ctx.dagen.reduce((t, d) => t + d.kcal, 0) / logged) : null;
  const feiten = [
    `Client: ${client.naam.split(" ")[0]}. Goal: ${doel}.${ctx.intake && ctx.intake.doel ? ` In their own words: "${String(ctx.intake.doel).slice(0, 300)}"` : ""}`,
    `This week's check-in, scored 1-5 and already interpreted: ${CHECK_UITLEG.map(([x, naam, laag, hoog, slecht]) => {
      const v = k[x], bad = slecht === "laag" ? v <= 2 : v >= 4, good = slecht === "laag" ? v >= 4 : v <= 2;
      return `${naam} ${v}/5 = ${v <= 2 ? laag : v >= 4 ? hoog : "average"} (${bad ? "NEEDS ATTENTION" : good ? "going well" : "okay"})`;
    }).join("; ")}. Workouts reported: ${k.training == null ? "not filled in" : k.training}.`,
    ctx.vorige ? `Previous check-in: energy ${ctx.vorige.energie}, hunger ${ctx.vorige.honger}, sleep ${ctx.vorige.slaap}, stress ${ctx.vorige.stress}, plan ${ctx.vorige.naleving}.` : "This is their first check-in.",
    k.opmerking ? `Their comment: "${k.opmerking.slice(0, 600)}"` : "No comment.",
    ctx.laatste ? (() => {
      const dagen = Math.max(0, Math.round((Date.parse(ctx.laatste.datum) - Date.parse(ctx.eerste.datum)) / 864e5)), diff = Math.round((ctx.laatste.gewicht - ctx.eerste.gewicht) * 10) / 10;
      return `Weight now ${ctx.laatste.gewicht} kg. Change since their first weigh-in ${dagen} days ago (${ctx.eerste.gewicht} kg): ${diff > 0 ? "+" : ""}${diff} kg in total${dagen >= 7 ? `, about ${Math.round(diff / dagen * 70) / 10} kg per week` : ""}. Trend last 3 weeks: ${ctx.tempo == null ? "not enough weigh-ins yet" : ctx.tempo + "% of body weight per week"}.`;
    })() : "No weigh-ins yet.",
    `Weight trend compared with the goal: ${ctx.tempo == null || !ADAPT_TEMPO[String(ctx.P && ctx.P.doel)] ? "not enough weigh-ins yet to judge" : (([lo, hi]) => ctx.tempo > hi ? (ctx.P.doel < 0 ? "SLOWER than the goal (weight is not dropping enough)" : "FASTER than the goal") : ctx.tempo < lo ? (ctx.P.doel > 0 ? "SLOWER than the goal (not gaining enough)" : "FASTER than the goal (losing too quickly)") : "ON TRACK")(ADAPT_TEMPO[String(ctx.P.doel)])}.`,
    ctx.A ? `Daily target: ${ctx.D ? `${ctx.D.train.kcal} kcal on training days, ${ctx.D.rust.kcal} kcal on rest days` : ctx.A.kcal + " kcal"}, protein ${ctx.A.prot} g.${ctx.a.kcal ? ` The app automatically ${ctx.a.kcal < 0 ? "lowered" : "raised"} the target by ${Math.abs(ctx.a.kcal)} kcal based on their progress.` : ""}` : "",
    `Food diary last 7 days: ${logged} day(s) logged${gem ? `, on average ${gem} kcal` : ""}. Workouts logged in the app last 7 days: ${ctx.trainingen}.`,
    ctx.training ? `Training program: "${ctx.training.naam}", week ${ctx.training.week}${ctx.training.dagen ? `, ${ctx.training.dagen} training days per week` : ""}.${ctx.training.licht ? ` Because of ${ { "spierpijn of pijn": "soreness or pain", "weinig energie en slechte slaap": "low energy and poor sleep", "veel stress en slechte slaap": "high stress and poor sleep" }[ctx.training.licht.reden] }, the app has automatically made this week lighter: about a third fewer sets per exercise and target weights about 10% lower, for the next 7 days. Mention this.` : ""}${ctx.trainingen === 0 ? " They have not logged any workouts in the app yet: ask them to log every set in the app so you can follow their progress." : ""}` : "No training program assigned.",
  ].filter(Boolean).join("\n");
  const system = `You are ${coach.naam}, a certified nutritionist and online coach, replying to your client's weekly check-in in the coaching app chat.
Write in ${TAAL_NAAM[lang] || "English"}. Style: warm, direct and motivating, like a WhatsApp message from a personal coach; at most 1-2 emoji.
Length: 50-110 words, one or two short paragraphs, no headings, no lists, no hashtags, no sign-off with your name.
Content: react to what stands out (good or bad), use the real numbers given, and give one or two concrete actions for the coming week. Follow the interpretations given (NEEDS ATTENTION, going well, ON TRACK, SLOWER, FASTER) exactly. Call app features by these names: ${{ nl: "dagboek, check-in, menu, training", en: "diary, check-in, menu, training", pt: "diário, check-in, cardápio, treino", es: "diario, check-in, menú, entrenamiento" }[lang] || "diary, check-in, menu, training"}.
Rules: only use the facts given and state numbers exactly as given (with their time span), never invent data. Do not praise low scores or bad sleep. Do not change calorie targets yourself (the app does that) and do not give medical diagnoses.${rood ? " The client mentions pain, injury, illness or wanting to quit: take it seriously, tell them to rest or see a doctor if needed, and say you will look at it personally." : ""}`;
  try {
    const res = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", { messages: [{ role: "system", content: system }, { role: "user", content: feiten }], max_tokens: 350, temperature: 0.6 });
    const txt = String(typeof res.response === "string" ? res.response : "").trim().replace(/^["']|["']$/g, "");
    return txt.length >= 40 ? txt.slice(0, 1500) : null;
  } catch (e) { console.error("auto reply AI failed", e); return null; }
}
// safety net: check-ins of the last 7 days without a coach reply (older ones, or a failed run) get their reply now
async function autoCheckinInhalen(env, now) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT k.client_id, k.datum FROM checkins k JOIN clients cl ON cl.id = k.client_id JOIN coaches co ON co.id = cl.coach_id
       WHERE co.auto_checkin = 1 AND cl.actief = 1 AND k.created_at > ? AND k.created_at < ?
         AND NOT EXISTS (SELECT 1 FROM berichten b WHERE b.checkin_id = k.id AND b.van = 'coach')
       ORDER BY k.created_at LIMIT 10`).bind(now - 7 * DAY, now - Number(env.AUTO_INHAAL_WACHT ?? 300)).all();
    for (const r of results) await autoCheckinReply(env, r.client_id, r.datum, now);
  } catch (e) { console.error("check-in catch-up", e); }
}
async function autoCheckinReply(env, clientId, datum, now) {
  try {
    const client = await env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(clientId).first();
    const k = await env.DB.prepare("SELECT * FROM checkins WHERE client_id = ? AND datum = ?").bind(clientId, datum).first();
    const coach = await env.DB.prepare("SELECT id, naam FROM coaches WHERE id = ?").bind(client.coach_id).first();
    if (!client || !k || !coach) return;
    if (await env.DB.prepare("SELECT 1 FROM berichten WHERE client_id = ? AND checkin_id = ? AND van = 'coach'").bind(clientId, k.id).first()) return; // already answered
    const lang = client.taal || "nl", rood = RODE_VLAG.test(k.opmerking || "") || k.energie === 1 || k.naleving === 1;
    const ctx = await checkinContext(env, client, k, now);
    const tekst = (await aiAntwoord(env, lang, client, coach, k, ctx, rood)) || sjabloonAntwoord(lang, client, k, ctx, rood);
    await env.DB.prepare("INSERT INTO berichten (client_id, van, tekst, checkin_id, created_at, auto) VALUES (?, 'coach', ?, ?, ?, 1)").bind(clientId, tekst, k.id, now).run();
    await notify(env, "client", clientId, { titel: "Uw coach reageerde op uw check-in", tekst: tekst.slice(0, 120), raw: true, url: "/app/?v=coach" }, now);
    await notify(env, "coach", coach.id, { titel: rood ? "Check-in van {naam}: aandacht nodig" : "Check-in van {naam} automatisch beantwoord", v: { naam: client.naam },
      tekst: tekst.slice(0, 120), raw: true, url: `/coach/#/client/${clientId}/checkins` }, now);
  } catch (e) {
    console.error("auto check-in reply failed", e);
    await notify(env, "coach", (await env.DB.prepare("SELECT coach_id FROM clients WHERE id = ?").bind(clientId).first() || {}).coach_id,
      { titel: "Check-in van {naam}", v: { naam: "" }, tekst: "Er staat een nieuwe weekcheck-in klaar.", url: `/coach/#/client/${clientId}/checkins` }, now).catch(() => {});
  }
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
  if (used.n) fail(409, "Dit programma is toegewezen aan {n} cliënt(en). Wijs eerst een ander programma toe.", undefined, { n: used.n });
  await c.env.DB.prepare("DELETE FROM programmas WHERE id = ?").bind(r.id).run();
  return json({ ok: true });
}

// ---------- coach branding ----------
// {naam, kleur, logo (url)} — null when the coach uses the DCRAMERE default
function merkOut(k) {
  if (!k || !k.merk) return null;
  const m = JSON.parse(k.merk);
  return { naam: m.naam || null, kleur: m.kleur || null, logo: m.logo_key ? `/api/merk/${k.id}/logo?v=${m.v || 0}` : null };
}
// WCAG relative luminance: the accent is used as text/buttons on #0a0a0a, so it must be light enough
function contrastOnBlack(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return (L + 0.05) / (0.0033 + 0.05);
}
async function merkOf(env, coachId) {
  const r = await env.DB.prepare("SELECT merk FROM coaches WHERE id = ?").bind(coachId).first();
  return r && r.merk ? JSON.parse(r.merk) : {};
}
async function saveMerk(env, coachId, m) {
  const empty = !m.naam && !m.kleur && !m.logo_key;
  await env.DB.prepare("UPDATE coaches SET merk = ? WHERE id = ?").bind(empty ? null : JSON.stringify(m), coachId).run();
}
async function putMerk(c) {
  const naam = str(c.body.naam, 40, "Naam");
  let kleur = c.body.kleur ? String(c.body.kleur).toLowerCase() : "";
  if (kleur && !/^#[0-9a-f]{6}$/.test(kleur)) fail(400, "Kies een geldige kleur.");
  if (kleur && contrastOnBlack(kleur) < 4.5) fail(400, "Deze kleur is te donker voor de zwarte achtergrond. Kies een lichtere tint.");
  const m = { ...(await merkOf(c.env, c.coach.id)), naam: naam || null, kleur: kleur || null };
  await saveMerk(c.env, c.coach.id, m);
  return json({ merk: merkOut({ id: c.coach.id, merk: JSON.stringify(m) }) });
}
async function putMerkLogo(c) {
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > 1024 * 1024) fail(413, "Het logo is te groot (max. 1 MB).");
  const type = buf.length > 12 ? imageType(buf) : null;
  if (!type) fail(415, "Upload een PNG-, JPEG- of WebP-afbeelding.");
  const m = await merkOf(c.env, c.coach.id);
  const key = `merk/${c.coach.id}/logo`;
  await c.env.FOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  Object.assign(m, { logo_key: key, logo_type: type, v: c.now });
  await saveMerk(c.env, c.coach.id, m);
  return json({ merk: merkOut({ id: c.coach.id, merk: JSON.stringify(m) }) });
}
async function delMerkLogo(c) {
  const m = await merkOf(c.env, c.coach.id);
  if (m.logo_key) await c.env.FOTOS.delete(m.logo_key);
  delete m.logo_key; delete m.logo_type;
  await saveMerk(c.env, c.coach.id, m);
  return json({ merk: merkOut({ id: c.coach.id, merk: JSON.stringify(m) }) });
}
// logos are shown to clients and in the PDF; they are brand assets, not personal data, so no session is needed
async function getMerkLogo(c) {
  const m = await merkOf(c.env, c.params[0]);
  const obj = m.logo_key && await c.env.FOTOS.get(m.logo_key);
  if (!obj) fail(404, "Geen logo.");
  return new Response(obj.body, { headers: { "content-type": m.logo_type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}

// ---------- demo client (onboarding) ----------
// A realistic example so a new coach can explore every screen. It cannot log in (no password).
async function createDemo(c) {
  const exists = await c.env.DB.prepare("SELECT id FROM clients WHERE coach_id = ? AND demo = 1").bind(c.coach.id).first();
  if (exists) fail(409, "U heeft al een voorbeeldcliënt.");
  const iso = (d) => new Date((c.now - d * DAY) * 1000).toISOString().slice(0, 10);
  const lang = c.coach.taal || pickLang(c.req, c.url), t = (nl) => tr(lang, nl); // sample content in the coach's language
  const profiel = { geslacht: "v", geboorte: "1994-05-12", lengte: 168, maaltijden: 4, activiteit: 1.55, doel: -0.1,
    geenRood: true, geenVis: false, vega: false, geenZuivel: false, excl: [], trainingsdagen: [1, 2, 3, 4, 5, 6], trainingsmoment: "avond" };
  const intake = { doel: t("5 kg vetmassa kwijt en sterker worden. Ik wil me weer fit voelen na mijn zwangerschap."), streefgewicht: 66,
    medisch: "", blessures: t("Soms lage rugpijn bij zwaar tillen"), allergieen: "", werk: "zittend", slaap: 7, ervaring: "beginner", sport: t("Fitness 3–4x per week"), lastig: t("Snacken in de avond"), alcohol: "soms" };
  const { meta } = await c.env.DB.prepare(
    "INSERT INTO clients (coach_id, naam, email, created_at, profiel, intake, demo, privacy_akkoord, programma, notities) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).bind(c.coach.id, t("Voorbeeld: Maya Jansen"), `voorbeeld-${c.coach.id}@demo.invalid`, c.now - 43 * DAY, JSON.stringify(profiel), JSON.stringify(intake),
    c.now - 43 * DAY, JSON.stringify({ id: "ppl12", start: iso(42) }), t("Voorbeeldcliënt: verken hier alle tabbladen. Verwijder haar gerust als u klaar bent.")).run();
  const id = meta.last_row_id, q = [];
  const kg = [72.4, 71.9, 71.3, 71.0, 70.4, 70.1, 69.6];
  kg.forEach((w, i) => q.push(c.env.DB.prepare("INSERT INTO metingen (client_id, datum, gewicht, taille, created_at, door) VALUES (?, ?, ?, ?, ?, 'client')")
    .bind(id, iso(42 - i * 7), w, 82 - i * 0.7, c.now)));
  [[3, 3, 3, 3, 4], [3, 4, 3, 3, 3], [4, 3, 4, 2, 4], [2, 4, 3, 4, 3], [4, 2, 4, 3, 5], [4, 3, 4, 2, 4]].forEach((k, i) =>
    q.push(c.env.DB.prepare("INSERT INTO checkins (client_id, datum, energie, honger, slaap, stress, naleving, training, opmerking, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, iso(35 - i * 7), ...k, 4 + (i % 3), i === 3 ? t("Drukke week op werk, 's avonds veel trek.") : "", c.now)));
  const sets = { incline_db_press: [{ kg: 12, reps: 10, ok: true }, { kg: 14, reps: 8, ok: true }, { kg: 14, reps: 8, ok: true }, { kg: 16, reps: 6, ok: true }] };
  for (let w = 1; w <= 5; w++) q.push(c.env.DB.prepare("INSERT INTO workouts (client_id, programma, week, dag, datum, sets, notitie, afgerond, updated_at) VALUES (?, 'ppl12', ?, 'pushA', ?, ?, '', ?, ?)")
    .bind(id, w, iso(42 - (w - 1) * 7), JSON.stringify({ incline_db_press: sets.incline_db_press.map((s) => ({ ...s, kg: s.kg + (w - 1) * 1 })) }), c.now, c.now));
  q.push(c.env.DB.prepare("INSERT INTO berichten (client_id, van, tekst, created_at, gelezen) VALUES (?, 'client', ?, ?, NULL)").bind(id, t("Hoi coach! Mag ik de rijst bij de lunch vervangen door cassave?"), c.now - 3600));
  q.push(c.env.DB.prepare("INSERT INTO dagboek (client_id, datum, maaltijd, naam, bron, ref, gram, kcal, eiwit, koolh, vet, created_at) VALUES (?, ?, 'ontbijt', ?, 'basis', 'kwark', 250, 142.5, 25, 10, 0.5, ?)").bind(id, iso(0), t("Magere kwark"), c.now));
  await c.env.DB.batch(q);
  return json({ id }, 201);
}

// ---------- client self-service: export and delete ----------
async function clientExport(c) {
  const id = c.client.id, q = (sql) => c.env.DB.prepare(sql).bind(id).all().then((r) => r.results);
  const cl = c.client;
  const data = {
    gemaakt: new Date().toISOString(),
    account: { naam: cl.naam, email: cl.email, sinds: new Date(cl.created_at * 1000).toISOString().slice(0, 10) },
    profiel: cl.profiel ? JSON.parse(cl.profiel) : null, intake: cl.intake ? JSON.parse(cl.intake) : null,
    metingen: await q("SELECT datum, gewicht, taille, heup, p1, p2, p3, p4 FROM metingen WHERE client_id = ? ORDER BY datum"),
    checkins: await q("SELECT datum, energie, honger, slaap, stress, naleving, training, opmerking FROM checkins WHERE client_id = ? ORDER BY datum"),
    trainingen: (await q("SELECT programma, week, dag, datum, sets, notitie, afgerond FROM workouts WHERE client_id = ? ORDER BY datum")).map((w) => ({ ...w, sets: JSON.parse(w.sets) })),
    dagboek: await q("SELECT datum, maaltijd, naam, gram, kcal, eiwit, koolh, vet FROM dagboek WHERE client_id = ? ORDER BY datum, id"),
    producten: await q("SELECT naam, merk, barcode, kcal, eiwit, koolh, vet, vezels, portie_naam, portie_g FROM producten WHERE client_id = ?"),
    berichten: await q("SELECT van, tekst, foto_key IS NOT NULL AS foto, datetime(created_at, 'unixepoch') AS tijd FROM berichten WHERE client_id = ? ORDER BY id"),
    bloedonderzoek: (await q("SELECT datum, lab, waarden, samenvatting FROM bloedonderzoek WHERE client_id = ? ORDER BY datum")).map((b) => ({ datum: b.datum, lab: b.lab, waarden: JSON.parse(b.waarden), samenvatting: b.samenvatting ? JSON.parse(b.samenvatting).client.tekst : null })),
    progressiefotos: (await q("SELECT datum, pose FROM fotos WHERE client_id = ? ORDER BY datum")).map((f) => ({ ...f, opmerking: tr(pickLang(c.req, c.url), "De foto zelf kunt u bekijken en opslaan in de app (Voortgang).") })),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-disposition": `attachment; filename="mijn-gegevens-${data.gemaakt.slice(0, 10)}.json"` } });
}
async function clientDeleteAccount(c) {
  const keys = [`ip:${clientIp(c)}`, `client:${c.client.email}`];
  await throttle(c, keys);
  // the confirmation word is shown in the user's language
  if (!["VERWIJDEREN", ...["en", "pt", "es"].map((l) => tr(l, "VERWIJDEREN"))].includes(String(c.body.bevestig || "").trim().toUpperCase()))
    fail(400, "Typ {w} om te bevestigen.", undefined, { w: "VERWIJDEREN" });
  if (!c.client.pw_hash || !(await verifyPassword(String(c.body.password || ""), c.client.pw_hash))) {
    await recordFailure(c, keys);
    fail(400, "Uw wachtwoord klopt niet.");
  }
  // stop billing first, so nobody is charged for an account that no longer exists
  if (c.client.stripe_subscription && ACTIVE_SUB.includes(c.client.abo_status)) {
    await stripe(c.env, "DELETE", `/subscriptions/${c.client.stripe_subscription}`);
  }
  const cl = c.client;
  await deleteClientData(c.env, cl.id);
  c.ctx?.waitUntil(notify(c.env, "coach", cl.coach_id, { titel: "{naam} heeft het account verwijderd", v: { naam: cl.naam }, tekst: "Alle gegevens van deze cliënt zijn gewist.", url: "/coach/#/" }, c.now));
  return json({ ok: true }, 200, { "set-cookie": cookie(COOKIE.client, "", 0) });
}

// ---------- monitoring ----------
async function logFout(env, pad, e) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const melding = String((e && (e.stack || e.message)) || e).slice(0, 1500);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO fouten (ts, pad, melding) VALUES (?, ?, ?)").bind(now, pad.slice(0, 200), melding),
      env.DB.prepare("DELETE FROM fouten WHERE ts < ?").bind(now - 30 * DAY),
    ]);
    // alert the owner, at most once per hour
    const prev = await env.DB.prepare("SELECT COUNT(*) AS n FROM fouten WHERE ts > ? AND ts < ?").bind(now - 3600, now).first();
    const owner = await ownerCoach(env);
    if (owner && prev.n === 0)
      await notify(env, "coach", owner.id, { titel: "Serverfout in DCRAMERE Coaching", tekst: `${pad}: ${String(e && e.message || e).slice(0, 100)}`, raw: true, url: "/coach/#/coaches" }, now);
  } catch (err) { console.error("logFout failed", err); }
}
async function health(c) {
  const t = Date.now();
  const db = await c.env.DB.prepare("SELECT 1 AS ok").first().then(() => true).catch(() => false);
  return json({ ok: db, db, ms: Date.now() - t, tijd: new Date().toISOString() }, db ? 200 : 503);
}
async function ownerSysteem(c) {
  if (!c.coach.is_owner) fail(403, "Alleen voor de eigenaar van het platform.");
  const q = (sql, ...b) => c.env.DB.prepare(sql).bind(...b).first();
  const [f24, f7, clients, actief, push, backup] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM fouten WHERE ts > ?", c.now - DAY), q("SELECT COUNT(*) AS n FROM fouten WHERE ts > ?", c.now - 7 * DAY),
    q("SELECT COUNT(*) AS n FROM clients WHERE demo = 0"), q("SELECT COUNT(*) AS n FROM clients WHERE demo = 0 AND last_seen > ?", c.now - 7 * DAY),
    q("SELECT COUNT(*) AS n FROM push_subs"), c.env.BACKUPS.get("meta:laatste"),
  ]);
  const { results } = await c.env.DB.prepare("SELECT ts, pad, melding FROM fouten ORDER BY id DESC LIMIT 30").all();
  return json({ fouten24: f24.n, fouten7: f7.n, clienten: clients.n, actief7: actief.n, pushApparaten: push.n,
    laatsteBackup: backup ? Number(backup) : null, betalingen: billingReady(c.env), fouten: results });
}

// ---------- profile pictures ----------
const avatarUrl = (role, r) => (r && r.avatar_key ? `/api/avatar/${role}/${r.id}?v=${r.avatar_v || 0}` : null);
async function putAvatar(c, role, id) {
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length > 1024 * 1024) fail(413, "De foto is te groot (max. 1 MB).");
  const type = buf.length > 12 ? imageType(buf) : null;
  if (!type) fail(415, "Upload een JPEG-, PNG- of WebP-foto.");
  const table = role === "coach" ? "coaches" : "clients";
  const old = await c.env.DB.prepare(`SELECT avatar_key FROM ${table} WHERE id = ?`).bind(id).first();
  const key = `avatar/${role}/${id}/${randomToken(9)}`;
  await c.env.FOTOS.put(key, buf, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare(`UPDATE ${table} SET avatar_key = ?, avatar_v = ? WHERE id = ?`).bind(key, c.now, id).run();
  if (old && old.avatar_key) await c.env.FOTOS.delete(old.avatar_key);
  return json({ avatar: avatarUrl(role, { id, avatar_key: key, avatar_v: c.now }) });
}
async function delAvatar(c, role, id) {
  const table = role === "coach" ? "coaches" : "clients";
  const old = await c.env.DB.prepare(`SELECT avatar_key FROM ${table} WHERE id = ?`).bind(id).first();
  if (old && old.avatar_key) await c.env.FOTOS.delete(old.avatar_key);
  await c.env.DB.prepare(`UPDATE ${table} SET avatar_key = NULL, avatar_v = NULL WHERE id = ?`).bind(id).run();
  return json({ avatar: null });
}
async function serveAvatar(env, key, cache) {
  const obj = key && await env.FOTOS.get(key);
  if (!obj) fail(404, "Geen foto.");
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata.contentType || "image/jpeg", "cache-control": cache, "x-content-type-options": "nosniff" } });
}
// client photos: only the client and their own coach
async function getClientAvatar(c) {
  const id = c.params[0];
  const row = await c.env.DB.prepare("SELECT avatar_key, coach_id FROM clients WHERE id = ?").bind(id).first();
  if (!row) fail(404, "Geen foto.");
  const [asClient, asCoach] = await Promise.all([sessionSubject(c, "client"), sessionSubject(c, "coach")]);
  if (asClient !== id && asCoach !== row.coach_id) fail(404, "Geen foto.");
  return serveAvatar(c.env, row.avatar_key, "private, max-age=86400");
}
// coach photos are public: they appear on the storefront
async function getCoachAvatar(c) {
  const row = await c.env.DB.prepare("SELECT avatar_key FROM coaches WHERE id = ?").bind(c.params[0]).first();
  return serveAvatar(c.env, row && row.avatar_key, "public, max-age=86400");
}

// ---------- storefronts ----------
const RESERVED_SLUGS = new Set(["app", "api", "coach", "coaches", "admin", "dcramere-coaching", "login", "privacy", "voorwaarden", "help", "support", "www", "winkel"]);
function cleanWinkel(b) {
  const list = (a, max) => (Array.isArray(a) ? a.slice(0, max) : []);
  const w = {
    gepubliceerd: !!b.gepubliceerd,
    titel: str(b.titel, 80, "Titel"),
    bio: str(b.bio, 1500, "Over mij"),
    specialisaties: list(b.specialisaties, 8).map((x) => str(x, 30, "Specialisatie")).filter(Boolean),
    pakketten: list(b.pakketten, 4).map((p) => ({
      naam: str(p && p.naam, 40, "Pakketnaam"), prijs: str(p && p.prijs, 20, "Prijs"), periode: str(p && p.periode, 20, "Periode"),
      beschrijving: str(p && p.beschrijving, 200, "Beschrijving"),
      kenmerken: list(p && p.kenmerken, 6).map((x) => str(x, 60, "Kenmerk")).filter(Boolean),
    })).filter((p) => p.naam),
    reviews: list(b.reviews, 6).map((r) => ({ naam: str(r && r.naam, 40, "Naam"), tekst: str(r && r.tekst, 300, "Review") })).filter((r) => r.naam && r.tekst),
    whatsapp: String(b.whatsapp || "").replace(/\D/g, "").slice(0, 15),
    instagram: String(b.instagram || "").replace(/^@/, "").trim(),
  };
  if (w.whatsapp && w.whatsapp.length < 7) fail(400, "Vul een volledig WhatsApp-nummer in, met landcode (bijv. 597…).");
  if (w.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(w.instagram)) fail(400, "Ongeldige Instagram-naam.");
  if (w.gepubliceerd && (!w.titel || !w.bio || !w.pakketten.length)) fail(400, "Vul een titel, een tekst over uzelf en minstens één pakket in om de winkel te publiceren.");
  return w;
}
async function getWinkel(c) {
  const r = await c.env.DB.prepare("SELECT slug, winkel FROM coaches WHERE id = ?").bind(c.coach.id).first();
  return json({ slug: r.slug, winkel: r.winkel ? JSON.parse(r.winkel) : null, url: r.slug ? `${c.url.origin}/c/${r.slug}` : null });
}
async function putWinkel(c) {
  const slug = String(c.body.slug || "").toLowerCase().trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug)) fail(400, "Kies een webadres van 3–30 tekens: kleine letters, cijfers en streepjes.");
  if (RESERVED_SLUGS.has(slug)) fail(409, "Dit webadres is niet beschikbaar.");
  if (await c.env.DB.prepare("SELECT 1 FROM coaches WHERE slug = ? AND id != ?").bind(slug, c.coach.id).first()) fail(409, "Dit webadres is al in gebruik. Kies een ander.");
  const w = cleanWinkel(c.body.winkel || {});
  if (w.gepubliceerd && !c.coach.avatar_key) fail(400, "Voeg eerst een profielfoto toe (Instellingen) voordat u de winkel publiceert.");
  await c.env.DB.prepare("UPDATE coaches SET slug = ?, winkel = ? WHERE id = ?").bind(slug, JSON.stringify(w), c.coach.id).run();
  return json({ slug, winkel: w, url: `${c.url.origin}/c/${slug}` });
}
const winkelVisible = (k) => k && k.winkel && JSON.parse(k.winkel).gepubliceerd && (k.is_owner || k.status === "actief");
async function listWinkels(c) {
  const { results } = await c.env.DB.prepare("SELECT id, naam, slug, winkel, merk, is_owner, status, avatar_key, avatar_v FROM coaches WHERE slug IS NOT NULL AND winkel IS NOT NULL").all();
  const out = results.filter(winkelVisible).map((k) => {
    const w = JSON.parse(k.winkel), m = merkOut(k);
    return { slug: k.slug, naam: k.naam, merk: m && m.naam, titel: w.titel, specialisaties: w.specialisaties, avatar: avatarUrl("coach", k), eigenaar: !!k.is_owner };
  }).sort((a, b) => b.eigenaar - a.eigenaar || a.naam.localeCompare(b.naam));
  return json(out, 200, { "cache-control": "public, max-age=300" });
}
async function postAanvraag(c) {
  const keys = [`lead:${clientIp(c)}`];
  await throttle(c, keys);
  await recordFailure(c, keys); // counts submissions: max 8 per 15 min per IP
  const k = await c.env.DB.prepare("SELECT id, naam, is_owner, status, winkel FROM coaches WHERE slug = ?").bind(c.params[0]).first();
  if (!winkelVisible(k)) fail(404, "Deze coach is niet gevonden.");
  if (c.body.website) return json({ ok: true }); // honeypot: bots fill every field
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const addr = email(c.body.email);
  const a = { telefoon: str(c.body.telefoon, 30, "Telefoon"), pakket: str(c.body.pakket, 40, "Pakket"), doel: str(c.body.doel, 1000, "Doel") };
  await c.env.DB.prepare("INSERT INTO aanvragen (coach_id, naam, email, telefoon, pakket, doel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(k.id, naam, addr, a.telefoon, a.pakket, a.doel, c.now).run();
  c.ctx?.waitUntil(notify(c.env, "coach", k.id, { titel: "Nieuwe aanvraag van {naam}", tekst: a.pakket ? "Pakket: {p}" : "Via uw winkelpagina", v: { naam, p: a.pakket }, url: "/coach/#/aanvragen" }, c.now));
  return json({ ok: true }, 201);
}
async function listAanvragen(c) {
  const { results } = await c.env.DB.prepare("SELECT * FROM aanvragen WHERE coach_id = ? ORDER BY id DESC LIMIT 200").bind(c.coach.id).all();
  return json(results);
}
async function ownAanvraag(c) {
  const a = await c.env.DB.prepare("SELECT * FROM aanvragen WHERE id = ? AND coach_id = ?").bind(c.params[0], c.coach.id).first();
  if (!a) fail(404, "Aanvraag niet gevonden.");
  return a;
}
async function putAanvraag(c) {
  const a = await ownAanvraag(c);
  if (!["nieuw", "afgewezen"].includes(c.body.status)) fail(400, "Ongeldige status.");
  await c.env.DB.prepare("UPDATE aanvragen SET status = ? WHERE id = ?").bind(c.body.status, a.id).run();
  return json({ ok: true });
}
async function inviteAanvraag(c) {
  const a = await ownAanvraag(c);
  if (await c.env.DB.prepare("SELECT 1 FROM clients WHERE email = ?").bind(a.email).first()) fail(409, "Er bestaat al een cliënt met dit e-mailadres.");
  const { meta } = await c.env.DB.prepare("INSERT INTO clients (coach_id, naam, email, created_at, notities) VALUES (?, ?, ?, ?, ?)")
    .bind(c.coach.id, a.naam, a.email, c.now, [a.pakket && `Pakket: ${a.pakket}`, a.telefoon && `Telefoon: ${a.telefoon}`, a.doel && `Doel: ${a.doel}`].filter(Boolean).join("\n")).run();
  await c.env.DB.prepare("UPDATE aanvragen SET status = 'uitgenodigd', client_id = ? WHERE id = ?").bind(meta.last_row_id, a.id).run();
  return json({ id: meta.last_row_id, link: await issueInvite(c, meta.last_row_id), telefoon: a.telefoon }, 201);
}

// server-rendered storefront page (shareable, with Open Graph preview)
async function storefrontPage(env, url, lang) {
  const t = (nl, v) => tr(lang, nl, v);
  const slug = url.pathname.slice(3).replace(/\/$/, "").toLowerCase();
  const k = /^[a-z0-9-]{3,30}$/.test(slug) && await env.DB.prepare(
    "SELECT * FROM coaches WHERE slug = ?").bind(slug).first();
  const h = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  if (!winkelVisible(k)) {
    return new Response(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t("Coach niet gevonden")}</title><link rel="stylesheet" href="/style.css"></head><body><div class="wrap" style="padding-top:80px;text-align:center"><h1>${t("Deze coach is niet gevonden")}</h1><p class="sub" style="margin:0 auto 20px">${t("De pagina bestaat niet (meer) of is nog niet gepubliceerd.")}</p><a class="btn" href="/">${t("Naar DCRAMERE Coaching")}</a></div></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const w = JSON.parse(k.winkel), m = merkOut(k), brand = (m && m.naam) || "DCRAMERE Coaching";
  const avatar = avatarUrl("coach", k), kleur = m && m.kleur;
  const direct = k.is_owner && billingReady(env);
  // coaches with Stripe Connect: visitors subscribe right here, at the coach's own price
  let plan = null; if (!k.is_owner) try { plan = payPlan(env, k); } catch (e) { /* no online payments for this coach */ }
  const money = plan && new Intl.NumberFormat({ nl: "nl-NL", en: "en-US", pt: "pt-BR", es: "es-419" }[lang], { style: "currency", currency: plan.valuta, minimumFractionDigits: plan.bedrag % 1 ? 2 : 0 }).format(plan.bedrag);
  const wa = w.whatsapp ? `https://wa.me/${w.whatsapp}?text=${encodeURIComponent(t("Hallo {naam}, ik zag uw coachingpagina en heb een vraag.", { naam: k.naam }))}` : null;
  const page = `<!DOCTYPE html>
<html lang="${lang}" data-lang="${lang}"${kleur ? ` style="--gold:${kleur};--c:${kleur}"` : ""}>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${h(k.naam)} — ${h(w.titel)}</title>
<meta name="description" content="${h(w.bio.slice(0, 160))}">
<meta property="og:type" content="profile"><meta property="og:title" content="${h(k.naam)} — ${h(w.titel)}">
<meta property="og:description" content="${h(w.bio.slice(0, 200))}">
${avatar ? `<meta property="og:image" content="${url.origin}${avatar}">` : ""}
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="/img/icon-48.png" type="image/png" sizes="48x48"><link rel="icon" href="/img/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${m && m.logo ? h(m.logo) : "/img/icon-180.png"}"><link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${h(k.naam)}">
<link rel="preload" href="/fonts/cinzel.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/overpass.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/landing.css"><link rel="stylesheet" href="/storefront.css">
</head>
<body class="landing" data-no-t>
<header class="lnav"><div class="lwrap lnav-in">
  <a class="brand" href="/"><img src="${m && m.logo ? h(m.logo) : "/img/emblem.webp"}" alt=""><span><b>${h(m && m.naam ? m.naam : "DCRAMERE")}</b><small>Coaching</small></span></a>
  <nav><a href="#pakketten">${t("Pakketten")}</a>${w.reviews.length ? `<a href="#ervaringen">${t("Ervaringen")}</a>` : ""}<a href="/app/" class="btn small ghost">${t("Inloggen")}</a><span data-lang-switch></span></nav>
</div></header>
<main>
  <section class="sf-hero"><div class="lwrap sf-hero-in">
    ${avatar ? `<img class="sf-avatar" src="${h(avatar)}" alt="${h(k.naam)}" width="400" height="400">` : ""}
    <div>
      <p class="kicker">${h(brand)}</p>
      <h1>${h(k.naam)}</h1>
      <p class="sf-titel">${h(w.titel)}</p>
      ${w.specialisaties.length ? `<ul class="sf-tags">${w.specialisaties.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}
      <div class="actions">${direct ? `<a class="btn" href="/?start=client#prijzen">${t("Direct starten")}</a>` : plan ? `<button class="btn" type="button" data-sf-start>${t("Direct starten · {x} per maand", { x: money })}</button>` : ""}<a class="btn${direct || plan ? " ghost" : ""}" href="#aanvraag">${t("Plan een kennismaking")}</a>${wa ? `<a class="btn ghost" href="${h(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div>
    </div>
  </div></section>
  <section class="lsec"><div class="lwrap narrow-l">
    <p class="kicker">${t("Over mij")}</p>
    <div class="sf-bio">${h(w.bio).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>").replace(/^/, "<p>")}</p></div>
    ${w.instagram ? `<p class="sub"><a href="https://instagram.com/${h(w.instagram)}" target="_blank" rel="noopener">${t("@{x} op Instagram", { x: h(w.instagram) })}</a></p>` : ""}
  </div></section>
  <section class="lsec alt" id="pakketten"><div class="lwrap">
    <p class="kicker">${t("Pakketten")}</p><h2>${t("Kies wat bij u past")}</h2>
    <div class="plans sf-plans">${w.pakketten.map((p, i) => `<article class="plan${i === 0 ? " featured" : ""}">
      <h3>${h(p.naam)}</h3>
      ${p.prijs ? `<p class="price"><b>${h(p.prijs)}</b><span>${h(p.periode)}</span></p>` : ""}
      ${p.beschrijving ? `<p class="sub" style="margin:0">${h(p.beschrijving)}</p>` : ""}
      ${p.kenmerken.length ? `<ul>${p.kenmerken.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}
      <a class="btn${i === 0 ? "" : " ghost"} block" href="#aanvraag" data-pakket="${h(p.naam)}">${t("Aanvragen")}</a>
    </article>`).join("")}</div>
    <p class="sub center" style="margin-top:18px">${t("Inclusief de DCRAMERE Coaching-app: voedingsplan op maat, trainingsprogramma, check-ins en chat met uw coach.")}</p>
  </div></section>
  ${w.reviews.length ? `<section class="lsec" id="ervaringen"><div class="lwrap"><p class="kicker">${t("Ervaringen")}</p><h2>${t("Wat cliënten zeggen")}</h2>
    <div class="sf-reviews">${w.reviews.map((r) => `<figure><blockquote>“${h(r.tekst)}”</blockquote><figcaption>${h(r.naam)}</figcaption></figure>`).join("")}</div></div></section>` : ""}
  <section class="lsec alt" id="aanvraag"><div class="lwrap narrow-l">
    <p class="kicker">${t("Kennismaken")}</p><h2>${t("Vraag een plek aan bij {naam}", { naam: h(k.naam) })}</h2>
    <form id="fLead" class="sf-form" novalidate data-slug="${h(k.slug)}">
      <div class="row"><label>${t("Naam")}<input name="naam" autocomplete="name" required></label><label>${t("E-mailadres")}<input type="email" name="email" autocomplete="email" required></label></div>
      <div class="row"><label>${t("Telefoon / WhatsApp")} <small>${t("optioneel")}</small><input name="telefoon" autocomplete="tel"></label>
        <label>${t("Pakket")}<select name="pakket"><option value="">${t("Nog niet zeker")}</option>${w.pakketten.map((p) => `<option>${h(p.naam)}</option>`).join("")}</select></label></div>
      <label>${t("Wat wilt u bereiken?")} <small>${t("optioneel")}</small><textarea name="doel" style="min-height:90px"></textarea></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="sub" style="font-size:13px;margin:0">${t("Uw gegevens gaan alleen naar {naam}.", { naam: h(k.naam) })} <a href="/privacy.html">${t("Privacyverklaring")}</a></p>
      <div><button class="btn" type="submit">${t("Aanvraag versturen")}</button></div>
      <div class="flash" data-msg role="status"></div>
    </form>
  </div></section>
</main>
${plan ? `<div class="sheet-wrap" id="startSheet" hidden><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="t-sfstart">
  <div class="sheet-h"><h2 id="t-sfstart">${t("Start uw coaching bij {naam}", { naam: h(k.naam) })}</h2><button class="del-x" type="button" data-close aria-label="${t("Sluiten")}">×</button></div>
  <p class="sub">${t("{x} per maand, maandelijks opzegbaar. U rondt de betaling af bij onze betaalpartner Stripe; daarna kiest u meteen uw wachtwoord.", { x: money })}</p>
  <form id="fSfStart" novalidate data-slug="${h(k.slug)}">
    <label>${t("Naam")}<input name="naam" autocomplete="name" required></label>
    <label>${t("E-mailadres")}<input type="email" name="email" autocomplete="email" required></label>
    <label class="consent"><input type="checkbox" name="akkoord"><span>${t('Ik ga akkoord met de <a href="/voorwaarden.html" target="_blank" rel="noopener">voorwaarden</a> en de <a href="/privacy.html" target="_blank" rel="noopener">privacyverklaring</a>.')}</span></label>
    <button class="btn block" type="submit">${t("Verder naar betalen")}</button>
    <div class="flash" data-msg role="status"></div>
  </form></div></div>` : ""}
<footer class="lfoot"><div class="lwrap lfoot-in"><div><p>${h(brand)}<br><span>${t("Aangedreven door DCRAMERE Coaching")}</span></p></div>
  <nav><a href="/">${t("Meer coaches")}</a><a href="/help.html">${t("Handleiding")}</a><a href="/privacy.html">${t("Privacy")}</a><a href="/voorwaarden.html">${t("Voorwaarden")}</a></nav></div></footer>
<script src="/i18n.js" data-load="/core.js /storefront.js"></script>
</body></html>`;
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", vary: "cookie, accept-language",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" } });
}
