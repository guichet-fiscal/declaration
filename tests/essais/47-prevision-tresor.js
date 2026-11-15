// Trésor : prévision du solde sur 8 semaines (recettes, crédits et achats au rythme des 4 dernières semaines,
// payes au rythme actuel, demande « salaires » du mois suivant d'un coup), seuil d'alerte réglé par la
// Direction, semaine où il serait franchi, dans l'onglet Économie, sur le tableau de bord et dans « À traiter ».
const path = require("path");
const { ouvrir, onglet, pause, texte } = require("../outils");

// 200 000 € encaissés le 4 novembre (semaine 45) : 50 000 € par semaine sur les 4 dernières semaines, moins que les payes.
// Demande « salaires » de novembre : celle de décembre (5 semaines de paye) est prévue d'un coup.
const JEU = `
  window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Garage Bastide", secteur: "Commerce", patron: "Patron", actif: true, createdAt: "2026-10-01T10:00:00Z", debutActivite: "2026-S41" } });
  window.__SEED.push({ collection: "declarations", id: "d1", data: { entrepriseId: "e1", entrepriseNom: "Garage Bastide", periode: "2026-S44", ca: 1000000, charges: 0, masse: 0, total: 200000, createdAt: "2026-11-02T12:00:00Z" } });
  window.__SEED.push({ collection: "decisions", id: "d1", data: { statut: "payee", montant: 200000, at: "2026-11-03T12:00:00Z", paidAt: "2026-11-04T20:00:00Z" } });
  window.__SEED.push({ collection: "demandes", id: "dsal1", data: { service: "Préfecture", objet: "Budget salaire", nature: "salaires", montant: 250000, urgence: "normale", demandeur: "Direction", recueAt: "2026-11-02T20:00:00Z", periode: "2026-11", createdAt: "2026-11-02T20:00:00Z" } });
  window.__SEED.push({ collection: "arbitrages", id: "dsal1", data: { statut: "accordee", montantAccorde: 250000, at: "2026-11-02T20:00:00Z" } });`;
const euros = (t) => Number(String(t).replace(/[^\d-]/g, ""));

module.exports = {
  nom: "Trésor : prévision sur 8 semaines et seuil d'alerte",
  async lancer(env, t) {
    const d = await ouvrir(env, { avant: JEU });
    await pause(d, 1000);
    // Tableau de bord : la phrase de prévision sous le graphique du Trésor.
    t.contient(texte(await d.locator("#tr-prev").innerText()), "Au rythme actuel, le Trésor reste au-dessus de zéro", "tableau de bord : prévision sous le graphique");

    await onglet(d, "economie"); await pause(d, 600);
    const kv = texte(await d.locator("#tp-kv").innerText());
    t.ok(/Recettes par semaine\s*50 000 €/.test(kv), "recettes : 200 000 € encaissés sur 4 semaines = 50 000 € par semaine", kv.slice(0, 500));
    t.ok(/Demande « salaires » de décembre 2026\s*[\d  ]+ €\s*5 semaines au rythme actuel/.test(kv), "demande « salaires » de décembre prévue (5 semaines de paye)", kv);
    t.egal(await d.locator("#tp-chart circle.dot").count(), 8, "courbe de 8 semaines");
    const solde0 = euros((/Solde aujourd’hui\s*([-\d  ]+) €/.exec(kv) || [])[1]);
    const fin = euros((/Solde dans 8 semaines\s*([-\d  ]+) €/.exec(kv) || [])[1]);
    t.ok(solde0 > 0 && fin > 0 && fin !== solde0, "solde d’aujourd’hui et dans 8 semaines", `${solde0} → ${fin}`);
    await d.screenshot({ path: path.join(__dirname, "..", "sorties", "prevision-tresor.png"), fullPage: false });

    // Seuil d'alerte entre le solde de la semaine 48 et celui de la semaine 49, où sort la demande de décembre.
    const soldes = await d.evaluate(() => document.querySelector("#tp-chart")._chart.series[0].values);
    t.ok(soldes[3] < soldes[2], "la demande « salaires » de décembre fait baisser le Trésor la semaine 49", JSON.stringify(soldes));
    const seuil = Math.ceil((soldes[3] + 1000) / 1000) * 1000;
    await d.locator("#tp-seuil-v").fill(String(seuil));
    await d.locator("#tp-seuil-ok").click(); await pause(d, 800);
    const alerte = texte(await d.locator("#tp-alerte").innerText());
    t.ok(new RegExp(`passerait sous le seuil de ${seuil.toLocaleString("fr-FR").replace(/\s/g, "\\s")} € la semaine du 30 novembre`).test(alerte), "date du passage sous le seuil", alerte);
    t.egal(await d.locator("#tp-chart line.seuil").count(), 1, "ligne du seuil sur la courbe");
    await d.locator("#tr-prev-card").scrollIntoViewIfNeeded();
    await d.screenshot({ path: path.join(__dirname, "..", "sorties", "prevision-tresor-seuil.png"), fullPage: false });
    await onglet(d, "dashboard"); await pause(d, 500);
    t.ok(/Trésor sous le seuil d’ici \d semaines?/.test(texte(await d.locator("#todo").innerText())), "« À traiter » : Trésor sous le seuil", texte(await d.locator("#todo").innerText()).slice(0, 400));
    t.contient(texte(await d.locator("#tr-prev").innerText()), "passerait sous le seuil", "tableau de bord : passage sous le seuil");
    t.sansErreur(d);
  },
};
