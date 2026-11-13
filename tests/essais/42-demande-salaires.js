// Payes de la Préfecture : une demande « salaires » accordée pour le mois est l'argent des payes de ce mois.
// Les payes sont prises dessus (comptées une fois dans l'enveloppe et le Trésor) et le budget des payes du
// mois est le total de ces demandes (un complément l'augmente). Signalé le 13 nov. : la demande de 3 M€ et
// les payes étaient déduites toutes les deux.
const { ouvrir, onglet, pause, texte } = require("../outils");

const SAL = (id, montant, at) => `
  window.__SEED.push({ collection: "demandes", id: "${id}", data: { service: "Préfecture", objet: "Budget salaire", nature: "salaires", montant: ${montant}, urgence: "normale", demandeur: "Direction", recueAt: "${at}", periode: "2026-11", createdAt: "${at}" } });
  window.__SEED.push({ collection: "arbitrages", id: "${id}", data: { statut: "accordee", montantAccorde: ${montant}, at: "${at}" } });`;
// Enveloppe de la Préfecture serrée (250 000 €) : avant, 200 000 € de demande + 64 500 € de payes la dépassaient.
const ENV = `{ const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.enveloppesMois = { "2026-11": { "Préfecture": 250000 } }; }`;
const euros = (t) => Number(String(t).replace(/[^\d-]/g, ""));

module.exports = {
  nom: "Payes : la demande « salaires » du mois est l'argent des payes",
  async lancer(env, t) {
    // 1. Sans demande « salaires » : Trésor de référence.
    const a = await ouvrir(env, { hash: "dashboard", avant: ENV });
    await pause(a, 900);
    const tresorSans = euros(await a.locator("#k-solde .v").innerText());
    await a.close();

    // 2. Demande « salaires » de 200 000 € pour novembre : le Trésor ne perd que la part qui n'est pas déjà payée
    // (200 000 − 64 500 de payes de novembre = 135 500 €).
    const d = await ouvrir(env, { hash: "dashboard", avant: ENV + SAL("dsal1", 200000, "2026-11-09T20:23:00Z") });
    await pause(d, 900);
    t.egal(tresorSans - euros(await d.locator("#k-solde .v").innerText()), 135500, "Trésor : payes de novembre prises sur la demande, pas déduites deux fois");
    await onglet(d, "payes"); await pause(d, 500);
    const bud = texte(await d.locator("#py-budget").innerText());
    t.ok(/Budget des payes de novembre 2026 : 200 000 € \(demande « salaires » DM-/.test(bud), "budget du mois = la demande « salaires »", bud);
    t.ok(!/Limité par l’enveloppe/.test(bud), "l'enveloppe ne bloque pas les payes prises sur la demande", bud);
    t.contient(texte(await d.locator("#py-k-budget").innerText()), "45 166 €", "budget de la semaine : (200 000 − 64 500) / 3 semaines");
    t.sansErreur(d);

    // 3. Complément de 100 000 € : le budget du mois passe à 300 000 €.
    const c = await ouvrir(env, { hash: "dashboard", avant: ENV + SAL("dsal1", 200000, "2026-11-09T20:23:00Z") + SAL("dsal2", 100000, "2026-11-13T21:30:00Z") });
    await pause(c, 900);
    await onglet(c, "payes"); await pause(c, 500);
    const bud2 = texte(await c.locator("#py-budget").innerText());
    t.ok(/Budget des payes de novembre 2026 : 300 000 € \(demandes « salaires »/.test(bud2), "complément : budget de 300 000 €", bud2);
    t.contient(texte(await c.locator("#py-k-budget").innerText()), "78 500 €", "budget de la semaine : (300 000 − 64 500) / 3");
    t.sansErreur(c);
  },
};
