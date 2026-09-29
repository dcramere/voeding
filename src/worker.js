// DCRAMERE Voeding — API (/api/*) + static assets (public/)

const DAY = 86400;
const SESSION_TTL = 30 * DAY;
const INVITE_TTL = 14 * DAY;
const PBKDF2_ITER = 100000; // Workers' WebCrypto maximum
const COOKIE = { client: "vc", coach: "vk" };
const MAX_BODY = 20000;

const ACTIVITEIT = [1.35, 1.45, 1.55, 1.7, 1.85];
const DOEL = [-0.2, -0.1, 0, 0.1];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Er ging iets mis op de server. Probeer het later opnieuw." }, 500);
    }
  },
};

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
  return {
    geslacht: p.geslacht, geboorte: p.geboorte, lengte: num(p.lengte, 120, 230, "Lengte", true),
    maaltijden, activiteit, doel,
    geenRood: !!p.geenRood, geenVis: !!p.geenVis, vega: !!p.vega, geenZuivel: !!p.geenZuivel, excl,
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

function cleanMenu(b) {
  const seed = Number.isInteger(b.seed) ? Math.max(0, Math.min(b.seed, 1e6)) : 0;
  const off = Array.isArray(b.off) ? b.off.slice(0, 5).map((x) => (Number.isInteger(x) ? Math.max(0, Math.min(x, 1e6)) : 0)) : [];
  return { seed, off };
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
  ["POST", "/wachtwoord", withClient(clientChangePassword)],
  // coach
  ["GET", "/coach/status", coachStatus],
  ["POST", "/coach/setup", coachSetup],
  ["POST", "/coach/login", coachLogin],
  ["POST", "/coach/logout", logout("coach")],
  ["GET", "/coach/me", withCoach(async (c) => json(c.coach))],
  ["GET", "/coach/clients", withCoach(listClients)],
  ["POST", "/coach/clients", withCoach(createClient)],
  ["GET", /^\/coach\/clients\/(\d+)$/, withCoach(getClient)],
  ["PUT", /^\/coach\/clients\/(\d+)$/, withCoach(updateClient)],
  ["DELETE", /^\/coach\/clients\/(\d+)$/, withCoach(deleteClient)],
  ["POST", /^\/coach\/clients\/(\d+)\/uitnodiging$/, withCoach(newInvite)],
  ["POST", /^\/coach\/clients\/(\d+)\/metingen$/, withCoach(coachAddMeting)],
  ["DELETE", /^\/coach\/clients\/(\d+)\/metingen\/(\d+)$/, withCoach(coachDelMeting)],
];

async function route(req, env, url) {
  const method = req.method;
  if (method !== "GET" && method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) fail(403, "Ongeldige herkomst.");
  }
  const path = url.pathname.slice(4);
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    let params = [];
    if (typeof pattern === "string") { if (pattern !== path) continue; }
    else { const hit = path.match(pattern); if (!hit) continue; params = hit.slice(1).map(Number); }
    const body = method === "POST" || method === "PUT" ? await readJson(req) : {};
    return handler({ req, env, url, body, params, now: Math.floor(Date.now() / 1000) });
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
  const pw = await hashPassword(newPassword(c.body.password));
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE clients SET pw_hash = ?, invite_hash = NULL, invite_expires = NULL WHERE id = ?").bind(pw, row.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE role = 'client' AND subject_id = ?").bind(row.id),
  ]);
  return json({ ok: true }, 200, { "set-cookie": await startSession(c, "client", row.id) });
}

async function clientMe(c) {
  const { client: cl, env } = c;
  const [coach, metingen] = await Promise.all([
    env.DB.prepare("SELECT naam FROM coaches WHERE id = ?").bind(cl.coach_id).first(),
    metingenOf(env, cl.id),
    env.DB.prepare("UPDATE clients SET last_seen = ? WHERE id = ?").bind(c.now, cl.id).run(),
  ]);
  return json({
    naam: cl.naam, email: cl.email, coach: coach ? coach.naam : "",
    profiel: cl.profiel ? JSON.parse(cl.profiel) : null, menu: JSON.parse(cl.menu), metingen,
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
    uitnodigingVerloopt: r.invite_expires, notities: r.notities,
    profiel: r.profiel ? JSON.parse(r.profiel) : null, menu: JSON.parse(r.menu),
    aangemaakt: r.created_at, laatstGezien: r.last_seen,
  };
}

async function listClients(c) {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM metingen m WHERE m.client_id = c.id) AS aantal,
       (SELECT json_object('datum', datum, 'gewicht', gewicht)
          FROM metingen m WHERE m.client_id = c.id ORDER BY datum ASC LIMIT 1) AS eerste,
       (SELECT json_object('datum', datum, 'gewicht', gewicht, 'taille', taille, 'heup', heup,
                           'p1', p1, 'p2', p2, 'p3', p3, 'p4', p4)
          FROM metingen m WHERE m.client_id = c.id ORDER BY datum DESC LIMIT 1) AS laatste
     FROM clients c WHERE c.coach_id = ? ORDER BY c.naam COLLATE NOCASE`,
  ).bind(c.coach.id).all();
  return json(results.map((r) => ({
    ...publicClient(r), aantal: r.aantal,
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
  return json({ ...publicClient(row), metingen: await metingenOf(c.env, row.id) });
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
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM metingen WHERE client_id = ?").bind(row.id),
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
