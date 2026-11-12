// Prêt et avis : l'échéance réclamée avec l'avis n'est pas en retard avant la date de paiement de l'avis.
const { ouvrir, onglet, pause, texte } = require("../outils");

const SEED = `
  window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z", debutActivite: "2026-S41" } });
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.debutSuivi = "2026-S45"; c.data.delaiPaiementJours = 2; }
  window.__SEED.push({ collection: "declarations", id: "d45", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", periode: "2026-S45", ca: 50000, charges: 0, masse: 0, total: 10000, createdAt: "2026-11-10T12:00:00Z" } });
  window.__SEED.push({ collection: "decisions", id: "d45", data: { statut: "validee", at: "2026-11-10T12:00:00Z", montant: 10000 } });
  window.__SEED.push({ collection: "prets", id: "p1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", statut: "en_cours", montant: 40000, taux: 0, at: "2026-11-01T10:00:00Z",
    echeances: [{ n: 1, date: "2026-11-10T08:00:00Z", montant: 10000, payee: false }, { n: 2, date: "2026-11-17T08:00:00Z", montant: 10000, payee: false }, { n: 3, date: "2026-11-24T08:00:00Z", montant: 10000, payee: false }, { n: 4, date: "2026-12-01T08:00:00Z", montant: 10000, payee: false }] } });`;

module.exports = {
  nom: "Échéance de prêt exigible avec l'avis",
  async lancer(env, t) {
    // 10 nov. 20 h 30 : l'échéance du 10 nov. 8 h est réclamée avec l'avis, payable jusqu'au 12 nov. 12 h.
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED });
    await pause(d, 800);
    await onglet(d, "recouvrement"); await pause(d, 400);
    const tout = texte(await d.locator("#rc-afaire").innerText());
    t.ok(!/non payés/.test(tout), "rien en retard avant la date de l'avis", tout.slice(0, 300));
    await d.locator(".rc-apayer summary").click(); await pause(d, 200);
    t.contient(texte(await d.locator(".rc-apayer").innerText()), "20 000 € à payer avant le 12 novembre à 13:00", "avis et échéance : une seule date");
    t.sansErreur(d);
    // 13 nov. : les deux sont en retard.
    const e = await ouvrir(env, { hash: "dashboard", avant: SEED, maintenant: "2026-11-13T10:00:00Z" });
    await pause(e, 800);
    await onglet(e, "recouvrement"); await pause(e, 400);
    t.contient(texte(await e.locator("#rc-afaire-l").innerText()), "20 000 € non payés", "après la date de l'avis : avis et échéance en retard");
    t.sansErreur(e);
  },
};
