// Prêt : « Réaménager les échéances » (Direction). Exemple : la moitié de ce qui reste tout de suite, le
// reste une semaine plus tard, avec un motif ; même total, ancien échéancier noté ; la première échéance est
// exigible aussitôt (saisie possible), la seconde attend sa date.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const PRET = `window.__SEED.push({ collection: "prets", id: "pt1", data: { entrepriseId: "e2", entrepriseNom: "XPL", statut: "en_cours", objet: "tresorerie", montant: 50000, taux: 0, at: "2026-10-30T20:00:00Z", verseLe: "2026-10-30T20:00:00Z",
  echeances: [{ n: 1, date: "2026-11-06T22:59:00Z", montant: 16667, capital: 16667, interets: 0, payee: false }, { n: 2, date: "2026-11-09T22:59:00Z", montant: 16667, capital: 16667, interets: 0, payee: false },
    { n: 3, date: "2026-11-20T22:59:00Z", montant: 16666, capital: 16666, interets: 0, payee: false }] } });`;

module.exports = {
  nom: "Prêt : échéances réaménagées",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + PRET });
    await pause(d, 900);
    await d.keyboard.press("Control+k"); await pause(d, 300); await d.locator("#q-in").fill("PR-"); await pause(d, 300);
    await d.locator("#q-list li", { hasText: "XPL" }).first().click(); await pause(d, 500);
    await d.locator("#pr-reamenager").click(); await pause(d, 400);
    t.contient(texte(await d.locator("#pr-ream-total").innerText()), "Total : 50 000 € sur 50 000 €", "proposé : la moitié maintenant, le reste dans 7 jours");
    await d.locator("#pr-ream-ok").click(); await pause(d, 200);
    t.contient(texte(await d.locator("#dlg .err").innerText()), "motif", "motif obligatoire");
    await d.locator("#pr-ream-motif").fill("Entreprise restée sans dirigeant une partie de la période : la moitié exigée tout de suite, le reste reporté d’une semaine.");
    await d.locator("#pr-ream-ok").click(); await pause(d, 1200);
    const p = (await lignes(d, "prets")).find((x) => x.id === "pt1") || {};
    const e = p.echeances || [];
    t.ok(e.length === 2 && e[0].montant === 25000 && e[1].montant === 25000 && e.every((x) => x.horsAvis && !x.payee) && e[0].n === 1 && e[1].n === 2, "deux échéances de 25 000 €", JSON.stringify(e));
    t.ok(new Date(e[0].date).getTime() < Date.parse("2026-11-10T20:30:00Z") && new Date(e[1].date).getTime() > Date.parse("2026-11-17T00:00:00Z"), "la première tout de suite, la seconde dans une semaine", JSON.stringify(e.map((x) => x.date)));
    t.ok((p.reamenagements || []).length === 1 && p.reamenagements[0].avant.length === 3 && /sans dirigeant/.test(p.reamenagements[0].motif), "ancien échéancier et motif notés", JSON.stringify(p.reamenagements || []).slice(0, 300));
    t.contient(texte(await d.locator("#pr-ream-l").innerText()), "sans dirigeant", "fiche du prêt : réaménagement affiché");
    // Recouvrement : seules les sommes exigibles (25 000 €) sont dues et saisissables.
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "recouvrement"); await pause(d, 500);
    const li = texte(await d.locator("#rc-afaire-l > li", { hasText: "XPL" }).filter({ hasText: "non payés" }).first().innerText());
    t.ok(/25\s000\s€ non payés/.test(li) && /PR-/.test(li), "recouvrement : 25 000 € exigibles", li.slice(0, 300));
    t.sansErreur(d);
  },
};
