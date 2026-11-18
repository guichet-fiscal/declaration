// Délai de paiement accordé par la Direction sur un avis : « Reporter le paiement » au jour choisi (tout en
// une fois) ; l'avis n'est plus relancé avant cette date.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

module.exports = {
  nom: "Paiement reporté par la Direction",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED });
    await pause(d, 900);
    await d.keyboard.press("Control+k"); await pause(d, 300); await d.locator("#q-in").fill("Taxi G7"); await pause(d, 300);
    await d.locator("#q-list li", { hasText: "semaine 44" }).first().click(); await pause(d, 500);
    t.contient(texte(await d.locator("#dlg").innerText()), "Délai de paiement", "section du délai sur l'avis");
    await d.locator("#ech-report").fill("2026-11-20"); await d.locator("#ech-reporter").click(); await pause(d, 1000);
    const ec = (await lignes(d, "echeanciers")).find((x) => x.id === "de12026-S44") || {};
    t.ok(ec.report && (ec.echeances || []).length === 1 && ec.echeances[0].montant === 12400 && /^2026-11-20/.test(new Date(Date.parse(ec.echeances[0].date) + 3600e3).toISOString()), "paiement reporté au 20 novembre", JSON.stringify(ec).slice(0, 300));
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "recouvrement"); await pause(d, 500);
    t.ok(!/Taxi G7[\s\S]{0,80}12\s400\s€ non payés/.test(texte(await d.locator("#rc-afaire").innerText())), "plus relancé avant la date");
    t.sansErreur(d);
  },
};
