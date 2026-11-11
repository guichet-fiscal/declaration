// Journal : qui a fait quoi. Les gestes d'un fonctionnaire depuis Mon espace portent le nom de sa fiche,
// une modification faite dans la base (script SQL) est dite telle quelle ; plus de « Sans nom ».
const { ouvrir, onglet, pause, texte } = require("../outils");

const J = `window.__journal = [
  { id: 4, at: "2026-11-10T19:40:00Z", auteur: "Directeur Test", discord_id: "999999999999999999", action: "modification", collection: "config", doc_id: "main", avant: {}, apres: { delaiJours: 2 } },
  { id: 3, at: "2026-11-10T19:30:00Z", auteur: null, discord_id: "111111111111111111", action: "ajout", collection: "absences", doc_id: "ab1", avant: null, apres: { fid: "f1", nom: "Alice MARTIN", du: "2026-11-12", au: "2026-11-12", par: "agent", statut: "signalee" } },
  { id: 2, at: "2026-11-10T19:20:00Z", auteur: null, discord_id: null, action: "modification", collection: "config", doc_id: "main", avant: {}, apres: { budgetInitial: 80000000 } },
  { id: 1, at: "2026-11-10T19:10:00Z", auteur: null, discord_id: null, action: "ajout", collection: "relances", doc_id: "rl1", avant: null, apres: { auto: true, entrepriseNom: "Garage", niveau: "rappel", type: "paiement" } }];`;

module.exports = {
  nom: "Auteurs du journal",
  async lancer(env, t) {
    const d = await ouvrir(env, { avant: J });
    await onglet(d, "journal"); await pause(d, 800);
    const j = texte(await d.locator("#j-list").innerText());
    t.ok(!/Sans nom/.test(j), "plus de « Sans nom »", j.slice(0, 400));
    t.contient(j, "Alice MARTIN", "geste depuis Mon espace : le nom de la fiche du fonctionnaire");
    t.contient(j, "Base de données (script)", "modification faite dans la base, sans compte");
    t.contient(j, "Envoi automatique", "envoi automatique toujours reconnu");
    t.sansErreur(d);
  },
};
