// Tableau de bord du personnel : chiffres, heures des 8 semaines, payes, points à surveiller ; droits.
const { ouvrir, pause, texte } = require("../outils");

module.exports = {
  nom: "Tableau de bord du personnel",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel", avant: 'window.__SEED.push({ collection: "demandesAgents", id: "da1", data: { fid: "f2", nom: "Bruno LEROY", type: "conge", objet: "Repos", du: "2026-11-20", au: "2026-11-21", statut: "envoyee", at: "2026-11-10T18:00:00Z" } });' });
    await d.locator("#rh-espaces button", { hasText: "Tableau de bord" }).click(); await pause(d, 500);
    const tout = texte(await d.locator("#rh-bord").innerText());
    t.contient(tout, "Effectif", "chiffre de l'effectif");
    t.contient(tout, "Semaine dernière", "heures de la semaine dernière (Direction)");
    t.egal(await d.locator("#rh-bord .es-col").count(), 8, "huit semaines d'heures");
    t.contient(tout, "Payes du mois", "payes du mois face au budget");
    t.contient(tout, "1 demande en attente", "la demande en attente est à surveiller");
    await d.locator("#rh-bord .linkbtn", { hasText: "demande en attente" }).click(); await pause(d, 400);
    t.ok(await d.locator("#rh-demandes").isVisible(), "le lien ouvre la rubrique Demandes");
    t.sansErreur(d);
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel" });
    await r.locator("#rh-espaces button", { hasText: "Tableau de bord" }).click(); await pause(r, 400);
    const rt = texte(await r.locator("#rh-bord").innerText());
    t.ok(!rt.includes("Payes du mois") && rt.includes("réservées à la Direction"), "RH : pas d'heures ni de payes, et c'est dit");
    t.sansErreur(r);
  },
};
