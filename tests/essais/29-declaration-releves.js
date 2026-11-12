// Déclaration préremplie d'après les relevés du compte : recettes, charges, salaires (et bénéficiaires)
// des mouvements lus pendant la période ; proposée à la saisie, et en tête des estimations d'office.
const { ouvrir, onglet, pause, texte } = require("../outils");

const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });`;

module.exports = {
  nom: "Déclaration préremplie d'après les relevés",
  async lancer(env, t) {
    // Fenêtre de la période proposée par défaut, puis un relevé dont les mouvements y tombent.
    const sonde = await ouvrir(env, { hash: "declaration", avant: ENT });
    const k = await sonde.evaluate(() => document.querySelector("#d-per").value);
    await sonde.close();
    // Lundi de la semaine ISO k, minuit (heure de Paris, UTC+1 en novembre).
    const [an, sem] = k.split("-S").map(Number), j4 = new Date(Date.UTC(an, 0, 4)), lundi = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 864e5 + (sem - 1) * 7 * 864e5 - 3600e3);
    const w = { t0: lundi.getTime(), t1: lundi.getTime() + 7 * 864e5 };
    t.ok(/^\d{4}-S\d{2}$/.test(k), "période proposée : " + k);
    const m = (h, lib, v) => ({ t: new Date(w.t0 + h * 3600e3).toISOString(), libelle: lib, montant: v });
    const mouvements = [m(30, "Course client", 12000), m(40, "Course client", 8000), m(50, "Achat carburant", -3000), m(60, "Salaire Paul Martin", -4000), m(61, "Salaire Lucie Bernard", -3500), m(70, "Paiement Préfecture de police", -2000)].reverse();
    const fin = w.t0 + 80 * 3600e3;
    const REL = ENT + `window.__SEED.push({ collection: "releves", id: "r1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", montant: 50000, at: "${new Date(fin).toISOString()}", mouvements: ${JSON.stringify(mouvements)}, lecture: "capture", agent: "Directeur Test", createdAt: "${new Date(fin).toISOString()}" } });`;
    const d = await ouvrir(env, { hash: "declaration", avant: REL });
    await pause(d, 800);
    await d.locator("#d-ent").fill("Taxi G7"); await d.locator("#d-ent").dispatchEvent("input"); await d.locator("#d-ent").dispatchEvent("change"); await pause(d, 400);
    const box = texte(await d.locator("#d-releves").innerText());
    t.ok(/20 000 €.*reçus/.test(box) && /3 000 € de charges/.test(box) && /7 500 € de salaires/.test(box) && /2 bénéficiaires/.test(box), "relevés résumés pour la période", box);
    await d.locator("#d-prerempli").click(); await pause(d, 300);
    const v = await d.evaluate(() => ["#d-ca", "#d-ch", "#d-ms", "#d-nb"].map((s) => document.querySelector(s).value));
    t.egal(v.join(","), "20000,3000,7500,2", "formulaire prérempli");
    t.contient(await d.locator("#d-note").inputValue(), "relevés du compte", "note de la déclaration");
    t.sansErreur(d);
  },
};
