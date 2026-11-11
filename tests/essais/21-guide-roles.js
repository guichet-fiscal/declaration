// Guide du guichet selon le rôle : Direction, Inspection, ressources humaines (pas la Lecture seule) ;
// ouvert à la première visite, rouvert par le « ? » du bandeau ; chaque « Ouvrir » mène à la rubrique.
const { ouvrir, pause, texte } = require("../outils");

const dlgTxt = async (p) => texte(await p.locator("#dlg").innerText().catch(() => ""));

module.exports = {
  nom: "Guide du guichet par rôle",
  async lancer(env, t) {
    // Direction : première visite, cinq pages, liens qui mènent aux rubriques.
    const d = await ouvrir(env, { guide: true });
    await pause(d, 1200);
    let g = await dlgTxt(d);
    t.ok(/Guide du guichet · Direction · 1 sur 5/.test(g) && /Bienvenue à la Direction, Directeur/.test(g), "Direction : le guide s'ouvre à la première visite", g.slice(0, 200));
    for (let i = 2; i <= 5; i++) { await d.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(d, 200); }
    g = await dlgTxt(d);
    t.ok(/5 sur 5/.test(g) && /Réglages et sécurité/.test(g) && /Accès/.test(g), "Direction : dernière page, réglages et accès");
    await d.locator("#dlg .guide-liste li").filter({ has: d.locator("strong", { hasText: /^Discord$/ }) }).locator("button").click(); await pause(d, 500);
    t.ok(await d.locator("#set-page-discord").isVisible(), "« Ouvrir » mène à Réglages → Discord");
    const vu = await d.evaluate(() => localStorage.getItem("gf-guide-direction-uid-999999999999999999"));
    t.ok(!!vu, "vu : il ne se rouvre plus tout seul");
    await d.locator("#guide-btn").click(); await pause(d, 300);
    t.contient(await dlgTxt(d), "1 sur 5", "le « ? » du bandeau le rouvre");
    await d.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(d, 200);
    await d.locator("#dlg .guide-liste li", { hasText: "Saisir une déclaration" }).locator("button").click(); await pause(d, 500);
    t.ok(await d.locator("#tab-declaration").isVisible(), "« Ouvrir » mène à l'onglet");
    t.sansErreur(d);

    // Inspection : son guide, sans les réglages.
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", guide: true });
    await pause(i, 1200);
    g = await dlgTxt(i);
    t.ok(/Inspection · 1 sur 4/.test(g) && /La Direction garde/.test(g), "Inspection : son guide, avec ce qui reste à la Direction", g.slice(0, 200));
    for (let k = 2; k <= 4; k++) { await i.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(i, 200); }
    t.ok(!/Réglages et sécurité/.test(await dlgTxt(i)), "Inspection : pas de page des réglages");
    await i.locator("#dlg .guide-liste li", { hasText: "Saisir une demande" }).locator("button").click(); await pause(i, 500);
    t.ok(await i.locator("#tab-demande").isVisible(), "Inspection : « Ouvrir » mène à l'onglet");
    t.sansErreur(i);

    // Ressources humaines : Personnel, rubrique par rubrique.
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel", guide: true });
    await pause(r, 1200);
    g = await dlgTxt(r);
    t.ok(/Ressources humaines · 1 sur 3/.test(g), "RH : son guide", g.slice(0, 160));
    await r.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(r, 200);
    await r.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(r, 200);
    await r.locator("#dlg .guide-liste li", { hasText: "Entretiens et objectifs" }).locator("button").click(); await pause(r, 500);
    t.ok(await r.locator("#rh-entretiens").isVisible(), "RH : « Ouvrir » mène à la rubrique de Personnel");
    t.sansErreur(r);

    // Lecture seule : ni guide ni bouton.
    const l = await ouvrir(env, { role: "lecture", discord: "444444444444444444", nom: "Lecture Test", guide: true });
    await pause(l, 1500);
    t.ok(!(await l.locator("#dlg").isVisible()) && await l.locator("#guide-btn").isHidden(), "Lecture seule : pas de guide");
  },
};
