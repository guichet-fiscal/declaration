// Taxation d'office d'après les encaissements du compte (comme avec les relevés bancaires) : tout ce qui est
// entré est une recette (dépôts d'espèces compris, pas un remboursement de prêt) ; charges admises : paiements à
// d'autres, pas les retraits ni l'argent versé au patron. Sans encaissement relevé sur la semaine : la dernière
// activité constatée sur le compte. L'avis et la déclaration montrent le calcul.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

// Mirror (e4) n'a pas déclaré la semaine 45 ; sa mise en demeure a expiré le 8 novembre.
const rel = (id, at, mvts) => `window.__SEED.push({ collection: "releves", id: "${id}", data: { entrepriseId: "e4", entrepriseNom: "Mirror", at: "${at}", montant: 80000, agent: "Inspecteur", lecture: "saisie", mouvements: ${JSON.stringify(mvts)} } });`;
const S45 = rel("rv1", "2026-11-07T20:00:00Z", [
  { t: "2026-11-05T19:00:00Z", montant: 20000, libelle: "Facture — Club 77" },
  { t: "2026-11-05T19:30:00Z", montant: 5000, libelle: "Reçu de · Dépôt" },
  { t: "2026-11-05T20:00:00Z", montant: 3000, libelle: "Remboursement prêt" },
  { t: "2026-11-06T18:00:00Z", montant: -8000, libelle: "Facture — Paris Immo" },
  { t: "2026-11-06T18:30:00Z", montant: -3000, libelle: "Vers - · Retrait" },
  { t: "2026-11-06T19:00:00Z", montant: -2000, libelle: "Salaire Jean" },
  { t: "2026-11-06T19:30:00Z", montant: -1000, libelle: "Préfecture de police" }]);
// Compte figé : un seul encaissement fin octobre (semaine 44), rien ensuite.
const FIGE = rel("rv2", "2026-11-07T20:00:00Z", [{ t: "2026-10-30T19:00:00Z", montant: 12000, libelle: "Facture — Club 77" }]);
const JEUDI = "2026-11-12T10:00:00Z"; // date limite de la semaine 45 passée
const taxer = async (d) => {
  await onglet(d, "recouvrement"); await pause(d, 500);
  await d.locator("#rc-afaire-l > li", { hasText: "Mirror" }).first().locator(".rc-dos-a > button", { hasText: "Taxer d’office" }).click(); await pause(d, 800);
};

module.exports = {
  nom: "Taxation d'office sur les encaissements",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + S45, maintenant: JEUDI });
    await pause(d, 900);
    await taxer(d);
    const ban = texte(await d.locator("#d-editing").innerText());
    t.ok(/Base retenue : les encaissements du compte entre le/.test(ban), "base : les encaissements du compte", ban.slice(0, 300));
    t.ok(await d.locator("#d-releves").isHidden(), "pas l'encadré « Préremplir d'après les relevés » (autre calcul) pendant une taxation d'office");
    t.contient(await d.locator("#d-note").inputValue(), "sur la base des encaissements du compte", "note de l'avis");
    t.egal([await d.locator("#d-ca").inputValue(), await d.locator("#d-ch").inputValue(), await d.locator("#d-ms").inputValue()], ["25000", "8000", "2000"], "recettes (dépôt compris, pas le prêt), charges (sans retrait ni Préfecture), salaires");
    await d.locator("#d-submit").click(); await pause(d, 1500);
    const decl = (await lignes(d, "declarations")).find((x) => x.entrepriseId === "e4" && x.periode === "2026-S45") || {};
    const to = decl.taxationOffice || {};
    t.ok(to.estimation === "encaissements" && Array.isArray(to.calcul) && to.calcul.some((x) => /retraits d’espèces/.test(x.l) && x.v === 3000) && to.calcul.some((x) => /dépôts et paiements en espèces/.test(x.l) && x.v === 5000) && !to.corrige,
      "calcul gardé dans la déclaration", JSON.stringify(to).slice(0, 500));
    // La déclaration montre le calcul.
    await d.evaluate((id) => { location.hash = "decl=" + id; }, decl.id); await pause(d, 200);
    await onglet(d, "declaration"); await pause(d, 300);
    await d.keyboard.press("Control+k"); await pause(d, 300); await d.locator("#q-in").fill("Mirror"); await pause(d, 300);
    await d.locator("#q-list li", { hasText: "semaine 45" }).first().click(); await pause(d, 500);
    const dlg = texte(await d.locator("#dlg").innerText());
    t.ok(/Calcul de l’imposition d’office/.test(dlg) && /Non déduits : retraits d’espèces \(1 mouvement\)\s*3\s000\s€/.test(dlg) && /Non comptés en recettes : prêts, remboursements, aides \(1 mouvement\)\s*3\s000\s€/.test(dlg), "fenêtre de la déclaration : le calcul", dlg.slice(0, 900));
    t.sansErreur(d);

    // Compte figé : aucun encaissement relevé en semaine 45 → l'activité constatée en semaine 44 d'abord.
    const f = await ouvrir(env, { hash: "dashboard", avant: SEED + FIGE, maintenant: JEUDI });
    await pause(f, 900);
    await taxer(f);
    const b2 = texte(await f.locator("#d-editing").innerText());
    t.ok(/Base retenue : l’activité constatée sur le compte en semaine 44/.test(b2) && /Aucun encaissement relevé/.test(b2), "compte figé : activité constatée, « aucun encaissement » en autre base", b2.slice(0, 400));
    t.egal(await f.locator("#d-ca").inputValue(), "12000", "chiffre d'affaires de la semaine 44");
    await f.locator("#d-editing button", { hasText: "Aucun encaissement relevé" }).click(); await pause(f, 300);
    t.egal(await f.locator("#d-ca").inputValue(), "0", "l'autre base en un clic");
    t.sansErreur(f);
  },
};
