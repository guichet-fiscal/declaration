// Payes : réglage « rappels en priorité ». Les rappels dus des semaines passées sont versés d'abord, la part
// de la semaine les compte en plus de sa part du mois ; avec un budget trop court, ce sont les payes de la
// semaine qui attendent, pas les rappels.
const { ouvrir, onglet, pause, texte } = require("../outils");

const RAPPEL = (m) => `window.__SEED.push({ collection: "rappels", id: "rgros", data: { fid: "f1", nom: "Alice MARTIN", semaine: "2026-S45", heures: 0, montant: ${m}, statut: "du", motif: "Prorata de la semaine 45", at: "2026-11-09T10:00:00Z" } });`;
const PRIO = `{ const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.payes = Object.assign({}, c.data.payes, { rappelsPriorite: true }); }`;
const IMPOSE = (v) => `window.__SEED.find(r => r.collection === "payes" && r.id === "2026-S46").data.budgetImpose = ${v};`;

module.exports = {
  nom: "Payes : rappels en priorité",
  async lancer(env, t) {
    // Sans le réglage : le bandeau le propose ; deux clics l'activent et le rappel passe en entier.
    const d = await ouvrir(env, { hash: "dashboard", avant: RAPPEL(2000000) });
    await pause(d, 900);
    await onglet(d, "payes"); await pause(d, 600);
    t.contient(texte(await d.locator("#py-rappels-place").innerText()), "verser les rappels en priorité", "bandeau : le réglage proposé");
    await d.locator("#py-rappels-prio").click(); await pause(d, 100);
    await d.locator("#py-rappels-prio").click(); await pause(d, 1200);
    const cf = await d.evaluate(() => (window.__rows.get("config/main") || {}).data.payes || {});
    t.ok(cf.rappelsPriorite === true, "réglage enregistré", JSON.stringify(cf).slice(0, 200));
    t.egal(await d.locator("#py-rappels-place").count(), 0, "tous les rappels passent");
    t.contient(texte(await d.locator("#py-k-verse").innerText()), "2 000 000 € de rappels", "rappels comptés dans la paye");
    t.contient(texte(await d.locator("#py-prio").innerText()), "Rappels en priorité : 2 000 000 € dus passent d’abord", "barre du budget : rappels en priorité");
    t.sansErreur(d);

    // Budget de la semaine trop court : les rappels d'abord, les payes de la semaine au prorata.
    const e = await ouvrir(env, { hash: "dashboard", avant: RAPPEL(2000000) + PRIO + IMPOSE(2000000) });
    await pause(e, 900);
    await onglet(e, "payes"); await pause(e, 600);
    const dep = texte(await e.locator("#py-depasse").innerText());
    t.ok(/Rappels versés d’abord \(2 000 000 €\)/.test(dep) && /payes à 0\s?%/.test(dep), "payes de la semaine au prorata, rappels versés", dep);
    t.contient(texte(await e.locator("#py-k-verse").innerText()), "2 000 000 € de rappels", "rappels versés en entier");
    t.sansErreur(e);

    // Réglage dans « Barème et budget ».
    const f = await ouvrir(env, { hash: "dashboard", avant: PRIO });
    await pause(f, 900);
    await onglet(f, "payes"); await pause(f, 600);
    await f.locator("button", { hasText: "Barème et budget" }).first().click(); await pause(f, 400);
    t.ok(await f.locator("#py-r-prio").isChecked(), "case cochée dans les réglages");
    t.egal(await f.locator("#py-prio").count(), 0, "sans rappel dû : rien à signaler");
  },
};
