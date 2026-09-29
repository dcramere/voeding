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

const ACTIVITEIT = [1.35, 1.45, 1.55, 1.7, 1.85];
const DOEL = [-0.2, -0.1, 0, 0.1];
const MOMENT = ["ochtend", "middag", "avond"];

const BACKUP_TTL = 60 * DAY; // weekly snapshots, ~8 kept
const BACKUP_EVERY = 7 * DAY;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Er ging iets mis op de server. Probeer het later opnieuw." }, 500);
    }
  },

  // optional cron entry point (the free plan's 5 cron slots are taken, so backups are normally
  // triggered by backupIfDue when the coach opens the dashboard)
  async scheduled(event, env) {
    await writeBackup(env);
  },
};

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
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

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

const withClient = (fn) => async (c) => {
  const id = await sessionSubject(c, "client");
  if (!id) fail(401, "Log opnieuw in.");
  const client = await c.env.DB.prepare("SELECT * FROM clients WHERE id = ?").bind(id).first();
  if (!client || !client.actief) fail(401, "Uw account is niet actief. Neem contact op met uw coach.");
  return fn({ ...c, client });
};
const withCoach = (fn) => async (c) => {
  const id = await sessionSubject(c, "coach");
  if (!id) fail(401, "Log opnieuw in.");
  const coach = await c.env.DB.prepare("SELECT id, naam, email FROM coaches WHERE id = ?").bind(id).first();
  if (!coach) fail(401, "Log opnieuw in.");
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
  ["GET", "/coach/me", withCoach(async (c) => json(c.coach))],
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
    profiel: cl.profiel ? JSON.parse(cl.profiel) : null, intake: cl.intake ? JSON.parse(cl.intake) : null,
    privacyAkkoord: cl.privacy_akkoord, menu: JSON.parse(cl.menu), metingen, checkins, fotos,
    programma: cl.programma ? JSON.parse(cl.programma) : null, workouts, producten,
  });
}

async function clientPutProfiel(c) {
  const naam = str(c.body.naam, 100, "Naam");
  if (!naam) fail(400, "Vul uw naam in.");
  const profiel = cleanProfiel(c.body.profiel);
  await c.env.DB.prepare("UPDATE clients SET naam = ?, profiel = ? WHERE id = ?")
    .bind(naam, JSON.stringify(profiel), c.client.id).run();
  return json({ naam, profiel });
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
  const { meta } = await c.env.DB.prepare("INSERT INTO coaches (email, naam, pw_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(addr, naam, await hashPassword(pw), c.now).run();
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, "coach", meta.last_row_id) });
}

function coachLogin(c) { return login(c, "coach", "coaches"); }

async function ownClient(c, id) {
  const row = await c.env.DB.prepare("SELECT * FROM clients WHERE id = ? AND coach_id = ?").bind(id, c.coach.id).first();
  if (!row) fail(404, "Cliënt niet gevonden.");
  return row;
}

function publicClient(r) {
  return {
    id: r.id, naam: r.naam, email: r.email, actief: !!r.actief, geactiveerd: !!r.pw_hash,
    uitnodigingVerloopt: r.invite_expires, notities: r.notities, privacyAkkoord: r.privacy_akkoord,
    profiel: r.profiel ? JSON.parse(r.profiel) : null, intake: r.intake ? JSON.parse(r.intake) : null,
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
       (SELECT MAX(datum) FROM workouts w WHERE w.client_id = c.id AND w.afgerond IS NOT NULL) AS laatste_training
     FROM clients c WHERE c.coach_id = ? ORDER BY c.naam COLLATE NOCASE`,
  ).bind(c.coach.id).all();
  return json(results.map((r) => ({
    ...publicClient(r), aantal: r.aantal, checkin: r.checkin ? JSON.parse(r.checkin) : null, laatsteFoto: r.laatste_foto, laatsteTraining: r.laatste_training,
    eerste: r.eerste ? JSON.parse(r.eerste) : null, laatste: r.laatste ? JSON.parse(r.laatste) : null,
  })));
}

async function issueInvite(c, id) {
  const token = randomToken();
  await c.env.DB.prepare("UPDATE clients SET invite_hash = ?, invite_expires = ? WHERE id = ?")
    .bind(await sha256(token), c.now + INVITE_TTL, id).run();
  return `${c.url.origin}/?invite=${token}`;
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
  return json({ ...publicClient(row), metingen, checkins, fotos, workouts, producten });
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
  if ("programma" in b) { sets.push("programma = ?"); vals.push(b.programma === null ? null : JSON.stringify(cleanProgramma(b.programma))); }
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
  let cursor;
  do {
    const list = await env.FOTOS.list({ prefix: `c/${clientId}/`, cursor });
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
  if (!p || typeof p !== "object" || !PROGRAMMAS[p.id]) fail(400, "Onbekend trainingsprogramma.");
  if (!isDate(p.start)) fail(400, "Kies een geldige startdatum.");
  return { id: p.id, start: p.start };
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
  const p = JSON.parse(cl.programma), def = PROGRAMMAS[p.id], b = c.body;
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
