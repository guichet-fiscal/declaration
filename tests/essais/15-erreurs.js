// Remontée des erreurs (mise à jour 37) : une erreur de la page est notée une fois, avec le navigateur
// et l'appareil ; la Direction la voit dans « À traiter » et dans Réglages, et la marque comme réglée.
const { ouvrir, onglet, pause, texte } = require("../outils");

// Erreur levée par un script de la page (une erreur lancée depuis l'essai lui-même, ou depuis un
// minuteur de l'horloge factice, n'arrive pas comme une erreur de la page).
const lever = (p, quoi) => p.evaluate((q) => {
  const s = document.createElement("script");
  s.textContent = q.promesse ? `Promise.reject(new Error(${JSON.stringify(q.message)}));` : `throw new Error(${JSON.stringify(q.message)});`;
  document.head.append(s); s.remove();
}, quoi);
const remontees = (p) => p.evaluate(() => window.__erreursRemontees || []);

module.exports = {
  nom: "Remontée des erreurs",
  async lancer(env, t) {
    // 1. Une erreur de la page, deux fois : notée une seule fois, avec le contexte.
    const d = await ouvrir(env, {});
    await lever(d, { message: "Essai de remontée 42" }); await lever(d, { message: "Essai de remontée 43" }); await pause(d, 600);
    let r = await remontees(d);
    t.egal(r.length, 1, "même erreur (chiffres près) notée une fois");
    const x = r[0] || {};
    t.ok(x.type === "erreur" && /Essai de remontée/.test(x.message) && /^Chrome \d+/.test(x.navigateur) && /Linux · \d+×\d+/.test(x.appareil) && x.onglet === "dashboard" && /^[0-9a-f]{8}$/.test(x.empreinte), "message, navigateur, appareil, onglet et empreinte", JSON.stringify(x));
    await lever(d, { message: "Promesse refusée d’essai", promesse: true }); await pause(d, 400);
    await lever(d, { message: "Failed to fetch", promesse: true }); await pause(d, 400);
    r = await remontees(d);
    t.ok(r.some((y) => y.type === "promesse") && !r.some((y) => /Failed to fetch/.test(y.message)), "promesse refusée notée, coupure réseau ignorée", JSON.stringify(r.map((y) => y.message)));

    // 2. La Direction : « À traiter », la liste regroupée, le détail, « Marquer comme réglée ».
    const vieilles = `window.__erreursRemontees = [
      { id: 1, at: "2026-11-10T19:00:00Z", type: "ecriture", message: "permission denied for table registre", empreinte: "aaaa1111", nom: "Alice MARTIN", role: "agent", navigateur: "Safari 17.4", appareil: "iPhone · appli installée · 390×844", onglet: "espace", details: { code: "42501" }, pile: "Error: permission denied\\n at write" },
      { id: 2, at: "2026-11-10T20:00:00Z", type: "ecriture", message: "permission denied for table registre", empreinte: "aaaa1111", nom: "Bruno LEROY", role: "agent", navigateur: "Chrome 130", appareil: "Android · 412×915", onglet: "espace" },
      { id: 3, at: "2026-11-10T18:00:00Z", type: "discord", message: "Discord injoignable depuis ce navigateur", empreinte: "bbbb2222", nom: "Directeur Test", role: "direction", navigateur: "Firefox 132", appareil: "Windows · 1920×1080", onglet: "payes" }];`;
    const e = await ouvrir(env, { avant: vieilles });
    await pause(e, 600);
    const todo = texte(await e.locator("#todo-card").innerText().catch(() => ""));
    t.contient(todo, "Erreurs remontées par le guichet", "« À traiter » signale les erreurs nouvelles");
    await e.locator("#todo .linkbtn", { hasText: "Erreurs remontées" }).click(); await pause(e, 500);
    const liste = texte(await e.locator("#dlg").innerText());
    t.ok(/permission denied/.test(liste) && /2 fois · 2 personnes/.test(liste) && /Discord injoignable/.test(liste), "erreurs regroupées, les plus récentes d'abord", liste.slice(0, 300));
    await e.locator("#dlg .err-list .linkbtn").first().click(); await pause(e, 300);
    const detail = texte(await e.locator("#dlg").innerText());
    t.ok(/Safari 17\.4/.test(detail) && /Chrome 130/.test(detail) && /iPhone/.test(detail) && /Alice MARTIN/.test(detail) && /code : 42501/.test(detail), "détail : navigateurs, appareils, personnes, précisions", detail.slice(0, 400));
    await e.locator("#dlg button", { hasText: "Marquer comme réglée" }).click(); await pause(e, 500);
    t.egal(await e.locator("#dlg .err-list li").count(), 1, "l'erreur réglée disparaît de la liste");
    await e.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(e, 300);
    // La carte « À traiter » est masquée quand il n'y a plus rien (son texte reste dans la page).
    const todo2 = (await e.locator("#todo-card").isVisible()) ? texte(await e.locator("#todo-card").innerText()) : "";
    t.ok(!todo2.includes("Erreurs remontées"), "plus rien dans « À traiter » une fois la liste vue", todo2.slice(0, 300) + " | " + await e.evaluate(() => localStorage.getItem("gf-erreurs-vues")));
    await onglet(e, "reglages");
    await e.locator("#set-tab-sauvegardes").click(); await pause(e, 300);
    t.ok(await e.locator("#card-erreurs").isVisible(), "carte « Erreurs remontées » dans Réglages");
    t.sansErreur(e);

    // 3. Mise à jour 37 absente : un seul essai d'envoi, et la carte le dit.
    const f = await ouvrir(env, { avant: "window.__sans37 = true;" });
    await lever(f, { message: "Première panne" }); await pause(f, 400); await lever(f, { message: "Seconde panne" }); await pause(f, 400);
    t.egal(await f.evaluate(() => window.__rpc.filter((n) => n === "signaler_erreur").length), 1, "sans la mise à jour 37 : on n'insiste pas");
    await onglet(f, "reglages"); await f.locator("#set-tab-sauvegardes").click(); await pause(f, 300);
    t.contient(texte(await f.locator("#b-erreurs-n").innerText()), "v37_suivi.sql", "la carte demande d'exécuter le script");

    // 4. Erreur avant le guichet : gardée par l'en-tête puis remontée.
    const g = await ouvrir(env, { html: (x) => x.replace("<meta name=\"mobile-web-app-capable\"", "<script>throw new Error(\"Panne avant le guichet\")</script>\n<meta name=\"mobile-web-app-capable\"") });
    await pause(g, 400);
    t.ok((await remontees(g)).some((y) => y.type === "demarrage" && /Panne avant le guichet/.test(y.message)), "erreur d'avant le démarrage remontée par le guichet");

    // 5. Le guichet ne démarre pas du tout : l'en-tête envoie lui-même, avec la session gardée.
    const h = await ouvrir(env, {
      avant: "try { localStorage.setItem('sb-essai-auth-token', JSON.stringify({ access_token: 'jeton-essai' })); } catch (e) {}",
      html: (x) => x.replace("window.__gfPret = true;", "window.__gfPret = true; ) panne de syntaxe"),
    });
    await pause(h, 9000);
    const directes = h.erreursDirectes;
    t.ok(directes.length >= 1 && directes.every((y) => y.p && y.p.type === "demarrage") && directes.some((y) => /SyntaxError|Unexpected|token/i.test(y.p.message)), "page cassée : l'erreur part quand même", JSON.stringify(directes).slice(0, 300));
  },
};
