// Payes : des rappels qui ne passent pas parce qu'ils ne prennent que le reste du budget de la semaine (le
// reste du mois est partagé entre les semaines restantes). Le guichet l'explique et propose de tout verser
// cette semaine (budget de la semaine relevé, pris sur les suivantes) ou le complément qui manque.
const { ouvrir, onglet, pause, texte } = require("../outils");

const RAPPEL = (m) => `window.__SEED.push({ collection: "rappels", id: "rgros", data: { fid: "f1", nom: "Alice MARTIN", semaine: "2026-S45", heures: 0, montant: ${m}, statut: "du", motif: "Prorata de la semaine 45", at: "2026-11-09T10:00:00Z" } });`;
const euros = (t) => Number(String(t).replace(/[^\d]/g, ""));

module.exports = {
  nom: "Payes : rappels sans place dans la semaine",
  async lancer(env, t) {
    // Budget du mois 3,5 M€ : un rappel de 2 M€ ne tient pas dans la part de la semaine (≈ 1,14 M€).
    const d = await ouvrir(env, { hash: "dashboard", avant: RAPPEL(2000000) });
    await pause(d, 900);
    await onglet(d, "payes"); await pause(d, 600);
    const n = texte(await d.locator("#py-rappels-place").innerText());
    t.ok(/Rappels : 2 000 000 € dus, [\d  ]+ € versés cette semaine/.test(n) && /partagé entre 3 semaines : un complément « salaires » n’ajoute qu’1\/3/.test(n), "explication : la part de la semaine", n);
    await d.locator("#py-rappels-tout").click(); await pause(d, 900);
    const imp = await d.evaluate(() => (window.__rows.get("payes/2026-S46") || {}).data.budgetImpose);
    t.ok(imp > 2000000, "budget de la semaine relevé", String(imp));
    t.egal(await d.locator("#py-rappels-place").count(), 0, "tous les rappels versés cette semaine");
    t.contient(texte(await d.locator("#py-k-verse").innerText()), "2 000 000 € de rappels", "rappels comptés dans la paye");
    t.sansErreur(d);

    // Rappel plus grand que le reste du mois : le complément qui manque.
    const e = await ouvrir(env, { hash: "dashboard", avant: RAPPEL(4000000) });
    await pause(e, 900);
    await onglet(e, "payes"); await pause(e, 600);
    const m = texte(await e.locator("#py-rappels-place").innerText());
    t.ok(/Il manque [\d  ]+ € au budget du mois pour tout verser cette semaine/.test(m) && (await e.locator("#py-rappels-tout").count()) === 0, "il manque au budget du mois", m);
    const lib = await e.locator("#py-rappels-place button", { hasText: "Préparer un complément" }).innerText();
    t.ok(euros(lib) % 10000 === 0 && euros(lib) > 0, "complément proposé", lib);
    t.sansErreur(e);
  },
};
