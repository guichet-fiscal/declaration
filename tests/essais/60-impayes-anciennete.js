// Recouvrement → Impayés : les sommes échues par ancienneté (moins de 7 jours, 7 à 14, 15 à 30, plus de 30),
// par entreprise, l'encours échu semaine après semaine et le taux de recouvrement des avis émis.
const { ouvrir, onglet, pause, texte } = require("../outils");
const SEED = require("../jeux/recouvrement");

// Jeu « recouvrement » au 10 novembre : Taxi G7 (12 400 €, avis S44) et Club 77 (8 000 €, S44), Vanguard (45 000 €, S43),
// Paris Immo (22 000 €, S45, pas encore échu). Une pénalité de Taxi G7 vieille de 40 jours.
const PEN = `window.__SEED.push({ collection: "penalites", id: "pnv", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", type: "retard", motif: "Retard ancien", montant: 5000, statut: "due", createdAt: "2026-09-29T10:00:00Z" } });`;
const euros = (t) => Number(String(t).replace(/[^\d]/g, ""));

module.exports = {
  nom: "Impayés par ancienneté",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "recouvrement", avant: SEED + PEN });
    await pause(d, 900);
    const cnt = texte(await d.locator('#rc-seg button[data-rc="impayes"]').innerText());
    t.ok(/Impayés\s*3/.test(cnt), "pastille : 3 entreprises", cnt);
    await d.locator('#rc-seg button[data-rc="impayes"]').click(); await pause(d, 500);
    const k = texte(await d.locator("#imp-kpis").innerText());
    t.ok(/Impayé échu\s*70\s400\s€/.test(k) && /3 entreprises · 4 sommes/.test(k), "impayé échu : total et nombre", k);
    t.ok(/Plus de 30 jours\s*5\s000\s€/.test(k), "plus de 30 jours : la vieille pénalité", k);
    const tr = texte(await d.locator("#imp-tranches").innerText());
    t.ok(/Plus de 30 jours 5\s000\s€/.test(tr), "légende des tranches", tr);
    const somme = (await d.locator("#imp-tranches li b").allInnerTexts()).reduce((x, v) => x + euros(v), 0);
    t.egal(somme, 70400, "les tranches font le total");
    const ents = d.locator("#imp-ents tbody tr");
    t.ok(/^Vanguard Armurerie/.test(texte(await ents.nth(0).innerText())), "plus gros impayé d'abord", texte(await ents.nth(0).innerText()));
    const taxi = texte(await d.locator("#imp-ents tbody tr", { hasText: "Taxi G7" }).innerText());
    t.ok(/17\s400\s€/.test(taxi) && /4\d j$/.test(taxi), "Taxi G7 : total et la plus ancienne", taxi);
    t.egal(await d.locator("#imp-tendance .es-col").count(), 6, "une barre par semaine depuis le début du suivi (S41), 8 au plus");
    const rec = texte(await d.locator("#imp-recouvrement").innerText());
    t.ok(/Semaine 44 \(\d+\)/.test(rec) && /%/.test(rec), "recouvrement des avis par semaine d'émission", rec.slice(0, 300));
    await d.locator("#imp-ents tbody tr .linkbtn", { hasText: "Club 77" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Club 77", "le nom ouvre la fiche");
    t.sansErreur(d);
  },
};
