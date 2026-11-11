// Outils communs des essais : petit serveur de fichiers, ouverture d'une page avec le faux Supabase,
// vérifications.
const http = require("http");
const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".ttf": "font/ttf" };

// Sert le dépôt tel quel (comme GitHub Pages) sur un port libre.
function serveur() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const f = path.join(RACINE, p === "/" ? "index.html" : p);
      if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${s.address().port}`, fermer: () => s.close() }));
  });
}

const FACTICE = fs.readFileSync(path.join(__dirname, "supabase-factice.js"), "utf8");
const jeu = (nom) => fs.readFileSync(path.join(__dirname, "jeux", nom + ".js"), "utf8");
const texte = (s) => String(s || "").replace(/\s+/g, " ").trim();
const pause = (p, ms) => p.waitForTimeout(ms);

// Ouvre le guichet pour un rôle et un compte Discord donnés.
//  o.role : direction, inspecteur, lecture, rh, agent ; o.discord, o.nom ; o.hash : onglet ;
//  o.jeu : nom du jeu d'essai (tests/jeux) ; o.avant : code exécuté avant le faux Supabase ;
//  o.maintenant : date ISO de l'horloge ; o.largeur / o.hauteur ; o.theme : light ou dark.
async function ouvrir(env, o) {
  o = Object.assign({ role: "direction", discord: "999999999999999999", nom: "Directeur Test", hash: "dashboard", jeu: "equipe", maintenant: "2026-11-10T20:30:00Z" }, o || {});
  const ctx = await env.navigateur.newContext({ viewport: { width: o.largeur || 1280, height: o.hauteur || 1000 }, serviceWorkers: "block", timezoneId: "Europe/Paris",
    locale: "fr-FR", acceptDownloads: true, colorScheme: o.theme || "light" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  p.erreurs = [];
  p.on("pageerror", (e) => p.erreurs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts|Failed to load|net::ERR/.test(m.text())) p.erreurs.push(m.text()); });
  const corps = (o.jeu ? jeu(o.jeu) : "window.__SEED = [];") + "\n" + (o.avant || "") + "\n" + FACTICE;
  await p.route(/supabase-js/, (r) => r.fulfill({ contentType: "application/javascript", body: corps }));
  await p.route(/^https:\/\/(fonts\.|discord|cdn\.discordapp)/, (r) => r.abort());
  await p.clock.setSystemTime(new Date(o.maintenant));
  await p.goto(`${env.url}/index.html?role=${o.role}&discord=${o.discord}&nom=${encodeURIComponent(o.nom)}#${o.hash}`);
  await pause(p, 2200);
  env.pages.push(p);
  return p;
}

// Ouvre un onglet, en dépliant son groupe si besoin.
async function onglet(p, nom) {
  if (!(await p.locator(`#tab-btn-${nom}`).isVisible())) {
    const grp = await p.locator(`#tab-btn-${nom}`).getAttribute("data-grp").catch(() => null);
    if (grp) await p.locator(`#grp-${grp}`).click().catch(() => {});
  }
  await p.locator(`#tab-btn-${nom}`).click();
  await pause(p, 900);
}

// Lignes d'une collection du faux registre.
const lignes = (p, c) => p.evaluate((c) => [...window.__rows.values()].filter((r) => r.collection === c).map((r) => Object.assign({ id: r.id }, r.data)), c);

module.exports = { serveur, ouvrir, onglet, lignes, texte, pause, RACINE };
