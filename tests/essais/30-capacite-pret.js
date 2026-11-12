// Prêts : capacité de remboursement dans le formulaire (résultat moyen après impôts, autres prêts, impayés,
// dernier solde), avec un avis selon la part de l'échéance.
const { ouvrir, onglet, pause, texte } = require("../outils");

const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });
  for (const [k, ca] of [["2026-S44", 100000], ["2026-S45", 120000]]) window.__SEED.push({ collection: "declarations", id: "d" + k, data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", periode: k, ca, charges: 20000, masse: 30000, total: 10000, createdAt: "2026-11-0" + (k === "2026-S44" ? "2" : "9") + "T10:00:00Z" } });
  window.__SEED.push({ collection: "releves", id: "r1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", montant: 85000, at: "2026-11-10T18:00:00Z", mouvements: [], lecture: "saisie", agent: "Directeur Test", createdAt: "2026-11-10T18:00:00Z" } });`;

module.exports = {
  nom: "Prêts : capacité de remboursement",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "prets", avant: ENT });
    await pause(d, 1000);
    await d.locator("#pret-new").click(); await pause(d, 300);
    await d.locator("#pf-ent").fill("Taxi G7"); await d.locator("#pf-ent").dispatchEvent("input");
    await d.locator("#pf-montant").fill("40000"); await d.locator("#pf-montant").dispatchEvent("input"); await pause(d, 200);
    // Résultat moyen : (50 000 + 70 000) / 2 = 60 000 ; impôts 10 000 ; reste 50 000. Quatre échéances de 10 000 : 20 %.
    let cap = texte(await d.locator("#pret-cap").innerText());
    t.ok(/50 000 € par semaine/.test(cap) && /Résultat moyen 60 000 €/.test(cap) && /soutenable/.test(cap) && /85 000 €/.test(cap), "capacité soutenable", cap);
    t.ok((await d.locator("#pret-cap").getAttribute("class")).includes("ok"), "avis vert");
    // En une fois : 40 000 sur 50 000 = 80 %, peu de marge.
    await d.locator("#pf-mode").selectOption("unique"); await pause(d, 200);
    cap = texte(await d.locator("#pret-cap").innerText());
    t.ok(/peu de marge/.test(cap) && (await d.locator("#pret-cap").getAttribute("class")).includes("warn"), "en une fois : peu de marge", cap);
    await d.locator("#pf-montant").fill("200000"); await d.locator("#pf-montant").dispatchEvent("input"); await pause(d, 200);
    t.ok((await d.locator("#pret-cap").getAttribute("class")).includes("bad"), "trop lourd : avis rouge");
    t.sansErreur(d);
  },
};
