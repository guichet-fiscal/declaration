// Recouvrement simplifié : « À faire » (une ligne par dossier, l'étape atteinte, une phrase, le geste
// suivant, les autres gestes dans un menu), « En attente d'une réponse », « Dans le délai de paiement »,
// rubriques en sous-onglets ; lettres en mots simples, articles de loi en petit ; mêmes lignes sur la fiche.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

module.exports = {
  nom: "Recouvrement : À faire, étapes et lettres simples",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED });
    await pause(d, 800);
    await onglet(d, "recouvrement"); await pause(d, 400);
    const af = texte(await d.locator("#rc-afaire-l").innerText());
    t.ok(/Vanguard Armurerie/.test(af) && /45 000 € non payés/.test(af) && /Vous pouvez saisir/.test(af), "Vanguard : mise en demeure sans effet, saisie proposée", af.slice(0, 300));
    t.ok(/Taxi G7/.test(af) && /Relancée le 7 novembre, toujours pas payé/.test(af), "Taxi G7 : relance sans réponse");
    t.egal(await d.locator("#rc-afaire-l > li").first().locator(".rc-dos-a > button").innerText(), "Saisir", "le dossier le plus avancé en premier, un seul geste principal");
    t.egal(await d.locator("#rc-afaire-l li", { hasText: "Taxi G7" }).locator(".rc-steps li.suivant").innerText(), "Mise en demeure", "étape suivante en évidence");
    t.contient(texte(await d.locator("#rc-attente-l").innerText()), "Elle a jusqu’au 12 novembre à 11:00 pour payer", "Club 77 en attente, avec la date");
    t.contient(await d.locator(".rc-apayer summary").innerText(), "Dans le délai de paiement (1)", "Paris Immo : dans le délai de paiement");
    t.egal((await d.locator('#rc-seg button[data-rc="afaire"] .count').innerText()).trim(), "2", "compte de « À faire »");

    // Autres gestes : menu, Échap le ferme.
    const li = d.locator("#rc-afaire-l li", { hasText: "Taxi G7" });
    await li.locator(".rc-menu-w > button").click(); await pause(d, 200);
    const menu = texte(await li.locator(".rc-menu").innerText());
    t.ok(/Voir la dernière lettre/.test(menu) && /Organiser une collecte/.test(menu) && /Transmettre à la justice/.test(menu), "menu des autres gestes", menu);
    await d.keyboard.press("Escape"); await pause(d, 150);
    t.ok(await li.locator(".rc-menu").isHidden(), "Échap ferme le menu");

    // Geste suivant : la mise en demeure part, le dossier passe en attente ; lettre en mots simples.
    await li.locator(".rc-dos-a > button", { hasText: "Envoyer la mise en demeure" }).click(); await pause(d, 1500);
    const r = (await lignes(d, "relances")).find((x) => x.entrepriseId === "e1" && x.niveau === "mise_en_demeure");
    t.ok(!!r && r.type === "paiement" && r.montant === 12400, "mise en demeure enregistrée", JSON.stringify(r || {}).slice(0, 160));
    t.ok(await d.locator("#dlg img.avis-preview").count() === 1, "lettre en image à poster");
    await d.keyboard.press("Escape"); await pause(d, 400);
    t.contient(texte(await d.locator("#rc-attente-l").innerText()), "Taxi G7", "Taxi G7 passe en attente");
    t.egal((await d.locator('#rc-seg button[data-rc="afaire"] .count').innerText()).trim(), "1", "plus qu'un dossier à faire");

    // Sous-onglets : les lettres envoyées, les comptes, la clôture.
    await d.locator('#rc-seg button[data-rc="historique"]').click(); await pause(d, 200);
    t.ok(await d.locator("#rc-hist").isVisible() && !(await d.locator("#rc-afaire").isVisible()), "sous-onglet « Lettres envoyées »");
    t.contient(texte(await d.locator("#rc-hist").innerText()), "Mise en demeure de payer", "la mise en demeure dans l'historique");
    await d.locator('#rc-seg button[data-rc="afaire"]').click(); await pause(d, 200);

    // Fiche : mêmes lignes, sans le nom.
    await onglet(d, "entreprises");
    await d.locator("#tab-entreprises .linkbtn:visible", { hasText: "Vanguard Armurerie" }).first().click(); await pause(d, 500);
    const f = texte(await d.locator("#dlg .rc-dos-l").innerText());
    t.ok(/45 000 € non payés/.test(f) && /Vous pouvez saisir/.test(f) && await d.locator("#dlg .rc-dos-l .rc-dos-a button", { hasText: "Saisir" }).count() === 1, "fiche : le dossier et son geste", f.slice(0, 200));
    await d.keyboard.press("Escape"); await pause(d, 300);
    t.sansErreur(d);

    // Deux déclarations en retard jamais relancées : relance groupée proposée.
    // Club 77 n'a pas non plus déclaré la semaine 45 : deux déclarations jamais relancées.
    const g = await ouvrir(env, { hash: "recouvrement", avant: SEED + `window.__SEED = window.__SEED.filter(r => r.id !== "de32026-S45");`, maintenant: "2026-11-12T10:00:00Z" });
    await pause(g, 800);
    await onglet(g, "recouvrement"); await pause(g, 400);
    const ag = texte(await g.locator("#rc-afaire").innerText());
    t.ok(/XPL/.test(ag) && /Semaine 45 non déclarée/.test(ag) && /En retard depuis le 10 novembre/.test(ag), "XPL : déclaration en retard", ag.slice(0, 400));
    t.ok(await g.locator("#rc-groupe-decl").isVisible(), "relance groupée proposée pour les déclarations jamais relancées");
    await g.locator("#rc-groupe-decl").click(); await pause(g, 300);
    const apercu = await g.locator("#rl-preview").innerText();
    t.ok(/Déclarations en retard/.test(apercu) && /XPL/.test(apercu) && /Club 77/.test(apercu) && !/Mirror/.test(apercu), "message groupé : seulement celles jamais relancées", apercu.slice(0, 300));
    await g.locator("#dlg button", { hasText: "Annuler" }).click(); await pause(g, 200);
    t.sansErreur(g);
  },
};
