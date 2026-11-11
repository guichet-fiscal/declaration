// Service worker : la page s'ouvre depuis le cache, la nouvelle version est récupérée en arrière-plan
// et annoncée par le bandeau « Nouvelle version du guichet » ; « Recharger » l'affiche.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { RACINE, pause } = require("../outils");

module.exports = {
  nom: "Ouverture depuis le cache et nouvelle version",
  async lancer(env, t) {
    // Serveur dont la page change de version à la demande (date de publication et marque dans le texte).
    let version = 1;
    const date = { 1: "Tue, 10 Nov 2026 20:00:00 GMT", 2: "Wed, 11 Nov 2026 01:00:00 GMT" };
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const f = path.join(RACINE, p === "/" ? "index.html" : p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      const page = /index\.html$/.test(f);
      let corps = fs.readFileSync(f);
      if (page) corps = Buffer.from(corps.toString("utf8").replace("</body>", `<div id="version-essai">${version}</div></body>`));
      res.writeHead(200, { "Content-Type": page ? "text/html; charset=utf-8" : /\.js$/.test(f) ? "application/javascript" : "application/octet-stream",
        "Last-Modified": page ? date[version] : date[1], "Cache-Control": "no-cache" });
      res.end(corps);
    });
    await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${srv.address().port}`;
    const fac = fs.readFileSync(path.join(__dirname, "../jeux/equipe.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../supabase-factice.js"), "utf8");
    const ctx = await env.navigateur.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", timezoneId: "Europe/Paris" });
    await ctx.route(/supabase-js/, (r) => r.fulfill({ contentType: "application/javascript", body: fac }));
    await ctx.route(/^https:\/\/(fonts\.|discord|cdn\.discordapp)/, (r) => r.abort());
    // Le guide de la Direction ne s'ouvre pas à la première visite (il couvrirait le bandeau).
    await ctx.addInitScript(() => { try { localStorage.setItem("gf-guide-direction-uid-999999999999999999", "essai"); } catch (e) { /* sans stockage */ } });
    const p = await ctx.newPage(); p.erreurs = []; p.on("pageerror", (e) => p.erreurs.push(e.message));
    env.pages.push(p);
    const adresse = `${url}/index.html?role=direction&discord=999999999999999999&nom=Directeur%20Test`;
    await p.goto(adresse); await pause(p, 2500);
    await p.evaluate(() => navigator.serviceWorker.ready); await pause(p, 800);
    // Deuxième ouverture : servie par le service worker.
    let rep = await p.goto(adresse); await pause(p, 1500);
    t.ok(rep.fromServiceWorker(), "deuxième ouverture servie depuis le cache");
    t.egal(await p.locator("#version-essai").textContent(), "1", "version 1 affichée");
    t.ok(await p.locator("#netbar").isHidden(), "pas de bandeau sans nouvelle version");
    // Mise en ligne d'une nouvelle version : la page en cache s'ouvre, puis le bandeau l'annonce.
    version = 2;
    rep = await p.goto(adresse); await pause(p, 3500);
    t.egal(await p.locator("#version-essai").textContent(), "1", "ouverture immédiate de la version en cache");
    t.ok(await p.locator("#netbar").isVisible() && (await p.locator("#netbar").innerText()).includes("Nouvelle version"), "bandeau « Nouvelle version du guichet »");
    await p.locator("#net-reload").click(); await pause(p, 2500);
    t.egal(await p.locator("#version-essai").textContent(), "2", "« Recharger » affiche la nouvelle version");
    t.egal(p.erreurs, [], "aucune erreur dans la page");
    await ctx.close(); srv.close();
  },
};
