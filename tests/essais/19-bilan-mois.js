// Bilan du mois : publié une fois au salon de la Direction quand la date limite de la dernière semaine
// du mois est passée ; aussi en image à la main (Recouvrement → Clôture des semaines).
const { ouvrir, onglet, pause, texte } = require("../outils");

module.exports = {
  nom: "Bilan du mois",
  async lancer(env, t) {
    const salons = `window.__discord = { webhooks: { direction: "${env.url}/__webhook/direction" } };`;
    const duMois = (p) => p.webhooks.filter((w) => /Bilan de novembre 2026/.test(w.corps));

    // 1er décembre : la semaine 48 est encore dans son délai de dépôt → pas encore.
    const a = await ouvrir(env, { maintenant: "2026-12-01T10:00:00Z", avant: salons });
    await pause(a, 1500);
    t.egal(duMois(a).length, 0, "pas avant la date limite de la dernière semaine du mois");

    // 3 décembre : publié une fois, avec l'image.
    const d = await ouvrir(env, { maintenant: "2026-12-03T10:00:00Z", avant: salons });
    await pause(d, 2000);
    const posts = duMois(d);
    t.egal(posts.length, 1, "bilan de novembre publié une fois");
    const c = (posts[0] || {}).corps || "";
    t.ok(/semaines 45 à 48/.test(c) && /Impôts :/.test(c) && /Dépenses :/.test(c) && /Trésor :/.test(c) && /Personnel : .* de service/.test(c), "impôts, dépenses, Trésor, personnel", c.slice(0, 600));
    t.ok(/filename="[^"]*bilan-du-mois[^"]*\.png"/i.test(c), "image du bilan jointe", (c.match(/filename="[^"]*"/) || [""])[0]);
    const meta = await d.evaluate(() => (window.__rows.get("meta/bilanMois") || {}).data || null);
    t.ok(meta && meta.mois === "2026-11", "noté pour le mois (meta/bilanMois)", JSON.stringify(meta));
    t.sansErreur(d);
    const deja = 'window.__SEED.push({ collection: "meta", id: "bilanMois", data: { mois: "2026-11", at: "2026-12-02T10:00:00Z" } });';
    const e = await ouvrir(env, { maintenant: "2026-12-03T10:00:00Z", avant: salons + deja });
    await pause(e, 1500);
    t.egal(duMois(e).length, 0, "pas de seconde publication");

    // À la main : Recouvrement → Bilan du mois en image.
    const f = await ouvrir(env, {});
    await onglet(f, "recouvrement"); await f.locator('#rc-seg button[data-rc="clotures"]').click(); await pause(f, 400);
    t.contient(texte(await f.locator("#rc-mois").innerText()), "Novembre 2026", "boutons des derniers mois sous la clôture des semaines");
    await f.locator("#rc-mois button", { hasText: "Novembre 2026" }).click(); await pause(f, 1200);
    t.ok(await f.locator("#dlg img").count() > 0, "le bilan du mois s'affiche en image");
    t.sansErreur(f);
  },
};
