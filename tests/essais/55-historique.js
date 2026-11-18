// Historique d'un dossier : depuis la fiche d'un agent, une déclaration, la fiche d'une entreprise ou la paye
// d'une semaine, les lignes du journal de ce dossier, et « Rétablir l'état d'avant » sans passer par l'onglet
// Journal.
const { ouvrir, onglet, pause, texte } = require("../outils");
const SEED = require("../jeux/recouvrement");

const ALICE = { nom: "Alice MARTIN", grade: "Agent administratif", discordId: "111111111111111111", actif: true, at: "2026-10-10T10:00:00Z" };
const J = `window.__journal = [
  { id: 21, at: "2026-11-10T19:40:00Z", auteur: "RH Test", discord_id: "916695949978525766", action: "modification", collection: "fonctionnaires", doc_id: "f1",
    avant: ${JSON.stringify(Object.assign({}, ALICE, { telephone: "555-0101" }))}, apres: ${JSON.stringify(ALICE)} },
  { id: 20, at: "2026-11-10T19:30:00Z", auteur: "Directeur Test", discord_id: "999999999999999999", action: "modification", collection: "fonctionnaires", doc_id: "f2", avant: {}, apres: { nom: "Bruno LEROY" } },
  { id: 19, at: "2026-11-10T19:20:00Z", auteur: "Directeur Test", discord_id: "999999999999999999", action: "modification", collection: "decisions", doc_id: "de12026-S44", avant: { montant: 15000 }, apres: { montant: 12400 } },
  { id: 18, at: "2026-11-10T19:10:00Z", auteur: "Directeur Test", discord_id: "999999999999999999", action: "modification", collection: "payes", doc_id: "2026-S46", avant: { semaine: "2026-S46" }, apres: { semaine: "2026-S46", budgetImpose: 900000 } }];`;
const chercher = async (p, q) => { await p.keyboard.press("Control+k"); await pause(p, 300); await p.locator("#q-in").fill(q); await pause(p, 300); };

module.exports = {
  nom: "Historique d'un dossier",
  async lancer(env, t) {
    // Fiche d'un agent : seule sa ligne, et on rétablit l'état d'avant.
    const d = await ouvrir(env, { hash: "personnel", avant: J });
    await pause(d, 900);
    await d.locator("#rh-list .linkbtn", { hasText: "Alice MARTIN" }).first().click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Historique" }).click(); await pause(d, 600);
    const l = texte(await d.locator("#hist-l").innerText());
    t.ok(/RH Test/.test(l) && !/Bruno/.test(l) && (await d.locator("#hist-l > li").count()) === 1, "historique de la fiche : sa seule ligne", l);
    await d.locator("#hist-l button", { hasText: "Rétablir l’état d’avant" }).click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Restaurer" }).click(); await pause(d, 1500);
    const f1 = await d.evaluate(() => (window.__rows.get("fonctionnaires/f1") || {}).data);
    t.ok(f1 && f1.telephone === "555-0101", "fiche rétablie dans son état d'avant", JSON.stringify(f1));
    t.contient(texte(await d.locator("#dlg").innerText()), "Historique du dossier", "retour à l'historique après la restauration");
    t.sansErreur(d);

    // Paye de la semaine.
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "payes"); await pause(d, 600);
    await d.locator("#py-historique").click(); await pause(d, 600);
    t.contient(texte(await d.locator("#hist-l").innerText()), "Directeur Test", "historique de la paye de la semaine");
    t.sansErreur(d);

    // Déclaration (avec son avis) et fiche d'une entreprise.
    const e = await ouvrir(env, { hash: "dashboard", avant: SEED + J });
    await pause(e, 900);
    await chercher(e, "Taxi G7");
    await e.locator("#q-list li", { hasText: "semaine 44" }).first().click(); await pause(e, 500);
    await e.locator("#dlg button[data-historique]").click(); await pause(e, 600);
    const dl = texte(await e.locator("#hist-l").innerText());
    t.ok(/Directeur Test/.test(dl) && (await e.locator("#hist-l > li").count()) === 1, "historique de la déclaration : la modification de son avis", dl);
    await e.locator("#dlg button", { hasText: "Retour" }).click(); await pause(e, 400);
    t.ok(/Taxi G7/.test(texte(await e.locator("#dlg").innerText())) && (await e.locator("#dlg button[data-historique]").count()) === 1, "« Retour » rouvre la déclaration");
    await e.keyboard.press("Escape"); await pause(e, 200);
    await chercher(e, "Taxi G7");
    await e.locator("#q-list li", { hasText: "Entreprise" }).first().click(); await pause(e, 500);
    await e.locator("#dlg button[data-historique]").click(); await pause(e, 600);
    t.contient(texte(await e.locator("#dlg").innerText()), "Aucune trace de ce dossier dans le journal", "fiche sans historique");
    t.sansErreur(e);

    // RH et agents n'ont pas l'historique (lecture du journal réservée à la Direction et à l'inspection).
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel", avant: J });
    await pause(r, 900);
    await r.locator("#rh-list .linkbtn", { hasText: "Alice MARTIN" }).first().click(); await pause(r, 400);
    t.egal(await r.locator("#dlg [data-historique]").count(), 0, "RH : pas de bouton Historique");
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: SEED + J });
    await pause(a, 900);
    t.egal(await a.locator("[data-historique], #py-historique").count(), 0, "agent : pas de bouton Historique");
  },
};
