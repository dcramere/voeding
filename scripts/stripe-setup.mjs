#!/usr/bin/env node
// One-time Stripe setup for DCRAMERE Coaching. Run it yourself: `npm run stripe:setup`.
// Asks for your Stripe secret key (hidden input), then creates/reuses:
//   - monthly price for clients (lookup key dcramere_client_monthly)
//   - monthly price for coaches  (lookup key dcramere_coach_monthly)
//   - webhook endpoint → <site>/api/stripe/webhook
//   - customer portal configuration (cancel at period end, payment method, invoices)
// and stores the results as Cloudflare secrets (and optionally in .dev.vars for local testing).
// The key never leaves your machine except to Stripe and Cloudflare.
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE = process.env.SITE || "https://dcramere-voeding.dcramere.workers.dev";
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q, def = "") => new Promise((r) => rl.question(`${q}${def ? ` [${def}]` : ""}: `, (a) => r(a.trim() || def)));
function askHidden(q) {
  return new Promise((r) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(q)) write.call(rl, s); else write.call(rl, "*"); };
    rl.question(`${q}: `, (a) => { rl._writeToOutput = write; process.stdout.write("\n"); r(a.trim()); });
  });
}
function enc(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") enc(v, key, out); else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}
let KEY = "";
async function stripe(method, path, params) {
  const q = params ? enc(params) : "";
  const r = await fetch(`https://api.stripe.com/v1${path}${method === "GET" && q ? "?" + q : ""}`, {
    method, headers: { authorization: `Bearer ${KEY}`, "stripe-version": "2024-06-20", ...(method !== "GET" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: method !== "GET" ? q : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path}: ${d.error && d.error.message}`);
  return d;
}
async function ensurePrice(lookup, productName, description, amount, currency) {
  const found = (await stripe("GET", "/prices", { lookup_keys: [lookup], active: "true", expand: ["data.product"] })).data[0];
  if (found && found.unit_amount === amount && found.currency === currency) { console.log(`  ✓ ${productName}: bestaande prijs ${found.id}`); return found.id; }
  const product = found ? found.product.id : (await stripe("POST", "/products", { name: productName, description })).id;
  const p = await stripe("POST", "/prices", { product, unit_amount: amount, currency, recurring: { interval: "month" }, lookup_key: lookup, transfer_lookup_key: "true" });
  console.log(`  ✓ ${productName}: nieuwe prijs ${p.id}`);
  return p.id;
}
function putSecret(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], { input: value + "\n", stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`wrangler secret put ${name} mislukt:\n${r.stderr}`);
  console.log(`  ✓ secret ${name} opgeslagen in Cloudflare`);
}

try {
  console.log("\nDCRAMERE Coaching — Stripe instellen\n");
  console.log("Tip: begin met uw TEST-sleutel (sk_test_…) uit dashboard.stripe.com → Developers → API keys.");
  console.log("Later draait u dit script opnieuw met de LIVE-sleutel (sk_live_…).\n");
  KEY = await askHidden("Stripe secret key");
  if (!/^(sk|rk)_(test|live)_/.test(KEY)) throw new Error("Dit lijkt geen Stripe secret key (begint met sk_test_ of sk_live_).");
  const live = KEY.includes("_live_");
  const acct = await stripe("GET", "/account");
  console.log(`\nAccount: ${acct.settings?.dashboard?.display_name || acct.id} (${live ? "LIVE" : "test"}), land ${acct.country}, standaardvaluta ${acct.default_currency}\n`);
  const currency = (await ask("Valuta (bijv. usd, eur)", "usd")).toLowerCase();
  const client = Math.round(parseFloat((await ask("Prijs per maand voor cliënten (coaching)", "99")).replace(",", ".")) * 100);
  const coach = Math.round(parseFloat((await ask("Prijs per maand voor coaches (platform)", "149")).replace(",", ".")) * 100);
  if (!(client > 0 && coach > 0)) throw new Error("Ongeldige prijs.");

  console.log("\nPrijzen…");
  const priceClient = await ensurePrice("dcramere_client_monthly", "DCRAMERE Coaching", "Maandabonnement online coaching: voeding, training en check-ins", client, currency);
  const priceCoach = await ensurePrice("dcramere_coach_monthly", "DCRAMERE Coaching Platform", "Maandabonnement voor coaches", coach, currency);

  console.log("Webhook…");
  const url = `${SITE}/api/stripe/webhook`;
  for (const w of (await stripe("GET", "/webhook_endpoints", { limit: 100 })).data.filter((w) => w.url === url)) await stripe("DELETE", `/webhook_endpoints/${w.id}`);
  const hook = await stripe("POST", "/webhook_endpoints", {
    url, description: "DCRAMERE Coaching", api_version: "2024-06-20",
    enabled_events: ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"],
  });
  console.log(`  ✓ ${url}`);

  console.log("Klantportaal…");
  const portal = await stripe("POST", "/billing_portal/configurations", {
    business_profile: { headline: "DCRAMERE Coaching — abonnement beheren", privacy_policy_url: `${SITE}/privacy.html`, terms_of_service_url: `${SITE}/voorwaarden.html` },
    features: { invoice_history: { enabled: "true" }, payment_method_update: { enabled: "true" },
      customer_update: { enabled: "true", allowed_updates: ["email", "name", "address"] },
      subscription_cancel: { enabled: "true", mode: "at_period_end", cancellation_reason: { enabled: "true", options: ["too_expensive", "unused", "other"] } } },
    default_return_url: `${SITE}/app/`,
  });
  console.log(`  ✓ ${portal.id}`);

  console.log("\nOpslaan in Cloudflare…");
  putSecret("STRIPE_SECRET_KEY", KEY);
  putSecret("STRIPE_WEBHOOK_SECRET", hook.secret);
  putSecret("STRIPE_PRICE_CLIENT", priceClient);
  putSecret("STRIPE_PRICE_COACH", priceCoach);
  putSecret("STRIPE_PORTAL_CONFIG", portal.id);

  if (!live && (await ask("\nOok in .dev.vars zetten voor lokaal testen? (j/n)", "j")).toLowerCase().startsWith("j")) {
    const lines = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l && !l.startsWith("STRIPE_")) : [];
    lines.push(`STRIPE_SECRET_KEY=${KEY}`, `STRIPE_PRICE_CLIENT=${priceClient}`, `STRIPE_PRICE_COACH=${priceCoach}`, `STRIPE_PORTAL_CONFIG=${portal.id}`, `STRIPE_WEBHOOK_SECRET=${hook.secret}`);
    writeFileSync(".dev.vars", lines.join("\n") + "\n");
    console.log("  ✓ .dev.vars bijgewerkt (staat niet in git)");
  }
  console.log(`\nKlaar. Stripe staat ingesteld in ${live ? "LIVE" : "TEST"}-modus.\n`);
} catch (e) {
  console.error(`\n✘ ${e.message}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
}
