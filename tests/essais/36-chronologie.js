// Chronologie de l'entreprise : tout le dossier sur un seul fil, du plus récent au plus ancien, avec un filtre.
const { ouvrir, onglet, pause, texte } = require("../outils");
const SEED = require("../jeux/recouvrement");

const PLUS = `
  { const r1 = window.__SEED.find(r => r.collection === "relances" && r.id === "r1").data; r1.vueLe = "2026-11-08T09:00:00Z"; r1.accuseLe = "2026-11-08T09:05:00Z"; }
  window.__SEED.find(r => r.collection === "decisions" && r.id === "de12026-S43").data = { statut: "payee", at: "2026-10-27T12:00:00Z", paidAt: "2026-10-29T10:00:00Z", paidByNom: "Agent Test", montant: 0 };
  window.__SEED.push({ collection: "releves", id: "rv1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", montant: 250000, at: "2026-11-05T15:00:00Z", agent: "Agent Test", lecture: "saisie", mouvements: [] } });
  window.__SEED.push({ collection: "delais", id: "dl1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", decls: ["de12026-S44"], mode: "report", jours: 4, motif: "Attente d'un gros paiement client.", statut: "attente", enLigne: true, at: "2026-11-10T18:00:00Z" } });
`;

module.exports = {
  nom: "Chronologie de l'entreprise",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + PLUS });
    await pause(d, 800);
    await onglet(d, "entreprises");
    await d.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(d, 500);
    await d.locator('#dlg .fiche-tabs button[data-ft="chrono"]').click(); await pause(d, 300);
    const liste = d.locator("#chrono-l");
    t.ok(await liste.isVisible(), "onglet « Chronologie » de la fiche");
    const tx = texte(await liste.innerText());
    for (const m of ["Demande de délai de paiement", "Lettre lue par l’entreprise", "Lettre ouverte par l’entreprise", "Relance de paiement", "Relevé de compte", "Avis émis", "Avis payé", "Inscrite au registre"])
      t.contient(tx, m, "événement : " + m);
    // Le plus récent en haut : la demande de délai (10 nov.) avant la relance (7 nov.), elle avant l'inscription (1er oct.).
    const i = (m) => tx.indexOf(m);
    t.ok(i("Demande de délai") < i("Relance de paiement") && i("Relance de paiement") < i("Inscrite au registre"), "ordre : du plus récent au plus ancien");
    t.ok(/Mardi 10 novembre/.test(tx), "regroupé par jour", tx.slice(0, 120));
    t.ok(i("Avis émis · Semaine 44") < i("Déclaration · Semaine 44"), "même heure : l'avis au-dessus de sa déclaration");

    // Filtre « Lettres » : seulement les lettres.
    await d.locator('#dlg .chrono-f button', { hasText: "Lettres" }).click(); await pause(d, 200);
    const tl = texte(await liste.innerText());
    t.ok(/Relance de paiement/.test(tl) && !/Relevé de compte/.test(tl) && !/Avis émis/.test(tl), "filtre « Lettres »", tl.slice(0, 200));

    // Un clic ouvre la pièce : la relance.
    await liste.locator("button", { hasText: "Relance de paiement" }).first().click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "RL-", "la lettre s'ouvre");
    t.sansErreur(d);
  }
};
