// Lance tous les essais du dossier tests/essais, dans l'ordre des noms, et dit ce qui a échoué.
// Usage : cd tests && npm install && npx playwright install chromium && node lancer.js [filtre]
// Sortie 1 si un essai échoue (GitHub le signale alors en rouge).
const fs = require("fs");
const path = require("path");
// Les essais du service worker ont besoin de voir ses requêtes (context.route).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const { serveur } = require("./outils");

const SORTIES = path.join(__dirname, "sorties");

(async () => {
  const filtre = process.argv[2] || "";
  const fichiers = fs.readdirSync(path.join(__dirname, "essais")).filter((f) => f.endsWith(".js") && f.includes(filtre)).sort();
  fs.mkdirSync(SORTIES, { recursive: true });
  const srv = await serveur();
  const navigateur = await chromium.launch();
  let echecs = 0, reussites = 0;
  const debut = Date.now();
  for (const f of fichiers) {
    const essai = require(path.join(__dirname, "essais", f));
    const env = { url: srv.url, navigateur, pages: [], resultats: [] };
    const t = {
      // Vérifie une condition ; le message dit ce qui est attendu.
      ok(cond, message, detail) { env.resultats.push({ ok: !!cond, message, detail }); },
      egal(vu, attendu, message) {
        const a = JSON.stringify(vu), b = JSON.stringify(attendu);
        env.resultats.push({ ok: a === b, message, detail: a === b ? undefined : `vu ${a}, attendu ${b}` });
      },
      contient(s, morceau, message) {
        const ok = String(s || "").includes(morceau);
        env.resultats.push({ ok, message, detail: ok ? undefined : `« ${morceau} » absent de « ${String(s || "").slice(0, 300)} »` });
      },
      sansErreur(p, message) { env.resultats.push({ ok: !p.erreurs.length, message: message || "aucune erreur dans la page", detail: p.erreurs.join(" | ") || undefined }); },
    };
    const t0 = Date.now();
    try { await essai.lancer(env, t); }
    catch (e) { env.resultats.push({ ok: false, message: "l’essai s’est arrêté", detail: String((e && e.stack) || e).split("\n").slice(0, 4).join(" ") }); }
    const ko = env.resultats.filter((r) => !r.ok);
    if (ko.length) {
      for (const [i, p] of env.pages.entries()) await p.screenshot({ path: path.join(SORTIES, `${f.replace(/\.js$/, "")}-${i + 1}.png`), fullPage: true }).catch(() => {});
    }
    for (const p of env.pages) await p.context().close().catch(() => {});
    console.log(`${ko.length ? "✗" : "✓"} ${essai.nom || f} (${env.resultats.length - ko.length}/${env.resultats.length}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const r of ko) console.log(`    ✗ ${r.message}${r.detail ? " — " + r.detail : ""}`);
    echecs += ko.length; reussites += env.resultats.length - ko.length;
  }
  await navigateur.close(); srv.fermer();
  console.log(`\n${echecs ? "ÉCHEC" : "OK"} : ${reussites} vérifications réussies, ${echecs} en échec (${((Date.now() - debut) / 1000).toFixed(0)} s).`);
  process.exit(echecs ? 1 : 0);
})();
