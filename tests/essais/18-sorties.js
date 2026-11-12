// Grosse sortie non vue entre deux relevés : le solde baisse bien plus que les mouvements lus
// (la tablette ne garde que les derniers) → mouvement suspect, à classer avec une note.
const { ouvrir, onglet, pause, texte } = require("../outils");

const ent = (id, nom) => `{ collection: "entreprises", id: "${id}", data: { nom: "${nom}", actif: true, createdAt: "2026-10-01T10:00:00Z" } }`;
const rel = (id, eid, nom, at, montant, mvts) => `{ collection: "releves", id: "${id}", data: { entrepriseId: "${eid}", entrepriseNom: "${nom}", at: "${at}", montant: ${montant}, agent: "Inspecteur", mouvements: ${JSON.stringify(mvts)} } }`;
const SEED = `window.__SEED.push(
  ${ent("eS", "Garage Sortie")}, ${ent("eL", "Garage Lu")}, ${ent("eP", "Garage Petit")},
  ${rel("r1", "eS", "Garage Sortie", "2026-11-06T18:00:00Z", 300000, [{ t: "2026-11-06T17:00:00Z", montant: 5000, libelle: "Facture" }])},
  ${rel("r2", "eS", "Garage Sortie", "2026-11-09T18:00:00Z", 100000, [{ t: "2026-11-09T17:00:00Z", montant: 2000, libelle: "Facture" }])},
  ${rel("r3", "eL", "Garage Lu", "2026-11-06T18:00:00Z", 300000, [])},
  ${rel("r4", "eL", "Garage Lu", "2026-11-09T18:00:00Z", 100000, [{ t: "2026-11-09T17:00:00Z", montant: -200000, libelle: "Achat véhicule" }, { t: "2026-11-05T10:00:00Z", montant: 1000, libelle: "Ancien" }])},
  ${rel("r5", "eP", "Garage Petit", "2026-11-06T18:00:00Z", 300000, [])},
  ${rel("r6", "eP", "Garage Petit", "2026-11-09T18:00:00Z", 270000, [{ t: "2026-11-09T17:00:00Z", montant: 2000, libelle: "Facture" }])});`;

module.exports = {
  nom: "Grosse sortie non vue entre deux relevés",
  async lancer(env, t) {
    const d = await ouvrir(env, { avant: SEED });
    await onglet(d, "recouvrement"); await d.locator('#rc-seg button[data-rc="comptes"]').click(); await pause(d, 500);
    const comptes = texte(await d.locator("#rc-comptes").innerText());
    t.contient(comptes, "202 000 € sortis du compte sans mouvement lu", "sortie non vue signalée (variation moins mouvements lus)");
    const n = (comptes.match(/sortis du compte sans mouvement lu/g) || []).length;
    t.egal(n, 1, "une seule alerte : ni la sortie lue sur le relevé (Garage Lu), ni la petite sous le seuil (Garage Petit)");
    t.sansErreur(d);
    // Seuil réglable : à 20 000 €, la petite sortie aussi ; à 0, plus rien.
    const e = await ouvrir(env, { avant: SEED + ' window.__SEED.push({ collection: "config", id: "main", data: { blanchiment: { sortieNonVue: 20000 } } });' });
    await onglet(e, "recouvrement"); await e.locator('#rc-seg button[data-rc="comptes"]').click(); await pause(e, 500);
    t.contient(texte(await e.locator("#rc-comptes").innerText()), "32 000 € sortis du compte", "seuil abaissé : la petite sortie aussi");
    await onglet(e, "reglages"); await e.locator("#set-tab-recouvrement").click(); await pause(e, 300);
    t.egal(await e.locator("#bl-sortie").inputValue(), "20000", "le seuil est dans Réglages → Recouvrement");
    const f = await ouvrir(env, { avant: SEED + ' window.__SEED.push({ collection: "config", id: "main", data: { blanchiment: { sortieNonVue: 0 } } });' });
    await onglet(f, "recouvrement"); await f.locator('#rc-seg button[data-rc="comptes"]').click(); await pause(f, 500);
    t.ok(!/sortis du compte/.test(texte(await f.locator("#rc-comptes").innerText())), "seuil à 0 : jamais");
  },
};
