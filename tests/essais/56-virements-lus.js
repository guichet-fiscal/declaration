// Virements lus sur les relevés : un virement à la Préfecture du montant d'un avis impayé est proposé à
// l'encaissement (À traiter, fiche de l'entreprise, recouvrement) ; « Ce n'est pas ce paiement » l'écarte ;
// un virement qui ne correspond à rien, ou lu deux fois sur des relevés qui se chevauchent, n'est proposé
// qu'une fois ou pas du tout.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const rel = (id, eid, nom, at, mvts) => `window.__SEED.push({ collection: "releves", id: "${id}", data: { entrepriseId: "${eid}", entrepriseNom: "${nom}", at: "${at}", montant: 500000, agent: "Inspecteur", lecture: "saisie", mouvements: ${JSON.stringify(mvts)} } });`;
const VIR = (m, t) => ({ t, montant: -m, libelle: "Virement Préfecture de police" });
const RELEVES = rel("rv1", "e1", "Taxi G7", "2026-11-10T16:00:00Z", [VIR(12400, "2026-11-10T15:00:00Z"), { t: "2026-11-10T14:00:00Z", montant: 3000, libelle: "Course" }])
  + rel("rv2", "e1", "Taxi G7", "2026-11-10T18:00:00Z", [VIR(12400, "2026-11-10T15:00:00Z")]) // le même virement, relevé suivant
  + rel("rv3", "e3", "Club 77", "2026-11-10T17:00:00Z", [VIR(8000, "2026-11-10T16:30:00Z")])
  + rel("rv4", "e6", "Vanguard Armurerie", "2026-11-10T17:00:00Z", [VIR(999, "2026-11-10T16:30:00Z")]);

module.exports = {
  nom: "Virements lus sur les relevés",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + RELEVES });
    await pause(d, 900);
    const todo = texte(await d.locator("#todo").innerText());
    t.ok(/Virements à la Préfecture lus sur les relevés, à encaisser/.test(todo) && /Taxi G7 : 12\s400\s€/.test(todo) && /Club 77 : 8\s000\s€/.test(todo) && !/999/.test(todo), "À traiter : deux virements (pas le doublon, pas celui qui ne correspond à rien)", todo.slice(0, 600));
    await d.locator("#todo .linkbtn", { hasText: "Virements à la Préfecture" }).click(); await pause(d, 400);
    t.egal(await d.locator("#pl-l > li").count(), 2, "deux lignes dans la liste");
    const li = d.locator("#pl-l > li", { hasText: "Taxi G7" });
    t.ok(/Avis d’imposition · semaine 44/i.test(texte(await li.innerText())) && /relevé RC-/.test(texte(await li.innerText())), "le virement, son relevé et l'avis qui correspond", texte(await li.innerText()));
    await li.locator('button[data-pl="encaisser"]').click(); await pause(d, 1500);
    const dec = await d.evaluate(() => (window.__rows.get("decisions/de12026-S44") || {}).data);
    t.ok(dec && dec.statut === "payee" && /Virement de 12\s400\s€ à la Préfecture/.test(dec.note || ""), "avis encaissé, avec le virement en note", JSON.stringify(dec).slice(0, 300));
    const r1 = (await lignes(d, "releves")).find((x) => x.id === "rv1") || (await lignes(d, "releves")).find((x) => x.id === "rv2") || {};
    t.ok(Object.values(r1.paiementsVus || {}).some((x) => x.etat === "encaisse"), "virement marqué encaissé sur le relevé", JSON.stringify(r1.paiementsVus || {}));
    t.egal(await d.locator("#pl-l > li").count(), 1, "il reste le virement de Club 77");
    t.sansErreur(d);

    // Recouvrement : le dossier de Club 77 propose d'encaisser le virement.
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "recouvrement"); await pause(d, 500);
    const club = d.locator("#rc-afaire-l > li", { hasText: "Club 77" }).first();
    const tx = texte(await club.innerText());
    t.ok(/Virement de 8\s000\s€ à la Préfecture/.test(tx) && /Encaisser le virement/.test(tx), "recouvrement : encaissement proposé", tx.slice(0, 400));

    // Fiche de Club 77 : « Ce n'est pas ce paiement » (deux clics) l'écarte.
    await d.keyboard.press("Control+k"); await pause(d, 300); await d.locator("#q-in").fill("Club 77"); await pause(d, 300);
    await d.locator("#q-list li", { hasText: "Entreprise" }).first().click(); await pause(d, 500);
    t.contient(texte(await d.locator("#pl-fiche").innerText()), "8 000 €", "fiche : le virement lu");
    await d.locator('#pl-fiche button[data-pl="ecarter"]').click(); await pause(d, 100);
    await d.locator('#pl-fiche button[data-pl="ecarter"]').click(); await pause(d, 1200);
    t.egal(await d.locator("#pl-fiche").count(), 0, "virement écarté");
    const r3 = (await lignes(d, "releves")).find((x) => x.id === "rv3") || {};
    t.ok(Object.values(r3.paiementsVus || {}).some((x) => x.etat === "ecarte"), "écart noté sur le relevé", JSON.stringify(r3.paiementsVus || {}));
    const dec3 = await d.evaluate(() => (window.__rows.get("decisions/de32026-S44") || {}).data);
    t.ok(dec3 && dec3.statut !== "payee", "l'avis de Club 77 reste dû");
    t.sansErreur(d);

    // Déjà encaissé à la main : plus proposé.
    const DEJA = `{ const x = window.__SEED.find(r => r.collection === "decisions" && r.id === "de12026-S44"); x.data.statut = "payee"; x.data.paidAt = "2026-11-10T19:00:00Z"; }`;
    const e = await ouvrir(env, { hash: "dashboard", avant: SEED + RELEVES + DEJA });
    await pause(e, 900);
    t.ok(!/Taxi G7 : 12\s400/.test(texte(await e.locator("#todo").innerText())), "avis déjà encaissé : virement plus proposé");
    t.sansErreur(e);
  },
};
