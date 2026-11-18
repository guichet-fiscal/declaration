// « J'ai payé » : depuis son espace, le patron annonce un paiement (sommes, montant, quand, comment) ; au
// guichet, le dossier de recouvrement attend la vérification ; la Direction voit le virement sur les relevés,
// encaisse en un clic ou dit qu'elle ne le retrouve pas ; le patron lit la réponse dans son espace.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const JETON = "0123456789abcdef0123456789abcdef0123";
const LIEN = `window.__jetons = { "${JETON}": "e1" };`;
const RELANCES = (env) => `window.__discord = { webhooks: { relances: "${env.url}/__webhook/relances" } };`;
const PA = (id, eid, nom, items, montant, statut, extra) => `window.__SEED.push({ collection: "paiementsAnnonces", id: "${id}", data: Object.assign({ entrepriseId: "${eid}", entrepriseNom: "${nom}", items: ${JSON.stringify(items)}, montant: ${montant}, quand: "2026-11-10T15:00:00Z", moyen: "virement", statut: "${statut}", enLigne: true, at: "2026-11-10T15:10:00Z" }, ${JSON.stringify(extra || {})}) });`;
const AVIS_E1 = [{ kind: "decl", id: "de12026-S44", ref: "DF-X", label: "Avis d’imposition · semaine 44", montant: 12400 }];
const AVIS_E3 = [{ kind: "decl", id: "de32026-S44", ref: "DF-Y", label: "Avis d’imposition · semaine 44", montant: 8000 }];
const RELEVE = `window.__SEED.push({ collection: "releves", id: "rv1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", at: "2026-11-10T16:00:00Z", montant: 500000, agent: "Inspecteur", lecture: "saisie", mouvements: [{ t: "2026-11-10T15:02:00Z", montant: -12400, libelle: "Virement Préfecture de police" }] } });`;

module.exports = {
  nom: "Paiements annoncés (« J'ai payé »)",
  async lancer(env, t) {
    // 1. Le patron annonce son paiement.
    const p = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + LIEN });
    await pause(p, 1200);
    await p.locator("#pt-pa-btn").click(); await pause(p, 300);
    t.egal(await p.locator("#pp-montant").inputValue(), "12400", "une seule somme due : cochée, montant prérempli");
    const case1 = p.locator("#dlg .rl-pick label", { hasText: "Semaine 44" }).first();
    await case1.click(); await pause(p, 100);
    await p.locator("#pp-ok").click(); await pause(p, 200);
    t.contient(texte(await p.locator("#dlg .err").innerText()), "Cochez ce que vous avez payé", "rien coché : refusé");
    await case1.click(); await pause(p, 100);
    t.egal(await p.locator("#pp-montant").inputValue(), "12400", "montant recalculé avec la somme cochée");
    await p.locator("#pp-note").fill("Virement fait depuis la banque de Taxi G7");
    await p.locator("#pp-ok").click(); await pause(p, 900);
    const pa = (await lignes(p, "paiementsAnnonces"))[0] || {};
    t.ok(pa.statut === "attente" && pa.montant === 12400 && pa.moyen === "virement" && (pa.items || [])[0] && pa.items[0].id === "de12026-S44", "paiement annoncé enregistré", JSON.stringify(pa).slice(0, 300));
    t.contient(texte(await p.locator("#pt-pa-l").innerText()), "la Préfecture le vérifie", "annonce en vérification dans l'espace");
    t.contient(texte(await p.locator("#pt-pay").innerText()), "paiement annoncé : vérification en cours", "somme marquée dans « À payer »");
    t.sansErreur(p);

    // 2. La Direction : À traiter, dossier suspendu, virement retrouvé, encaissement.
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + RELEVE + RELANCES(env) + PA("pa1", "e1", "Taxi G7", AVIS_E1, 12400, "attente") + PA("pa2", "e3", "Club 77", AVIS_E3, 8000, "attente") });
    await pause(d, 900);
    const todo = texte(await d.locator("#todo").innerText());
    t.ok(/Paiements annoncés par les entreprises, à vérifier/.test(todo) && !/Virements? à la Préfecture lus/.test(todo), "À traiter : les paiements annoncés (le virement lu n'est pas proposé deux fois)", todo.slice(0, 500));
    await onglet(d, "recouvrement"); await pause(d, 400);
    const li = d.locator("#rc-afaire-l > li", { hasText: "Taxi G7" }).first();
    const tx = texte(await li.innerText());
    t.ok(/L’entreprise dit avoir payé 12\s400\s€/.test(tx) && /attend la vérification/.test(tx), "dossier suspendu par le paiement annoncé", tx.slice(0, 400));
    await li.locator(".rc-dos-a > button", { hasText: "Vérifier le paiement" }).click(); await pause(d, 400);
    const dlg = texte(await d.locator("#dlg").innerText());
    t.ok(/Virement de 12\s400\s€ à la Préfecture/.test(dlg) && /relevé RC-RV1/.test(dlg), "le virement retrouvé sur le relevé", dlg.slice(0, 600));
    await d.locator("#pa-encaisser").click(); await pause(d, 1500);
    const dec = await d.evaluate(() => (window.__rows.get("decisions/de12026-S44") || {}).data);
    t.ok(dec && dec.statut === "payee" && /Paiement annoncé PA-/.test(dec.note || ""), "avis encaissé", JSON.stringify(dec).slice(0, 300));
    const p1 = (await lignes(d, "paiementsAnnonces")).find((x) => x.id === "pa1") || {};
    t.ok(p1.statut === "encaisse" && p1.montantEncaisse === 12400, "paiement annoncé : encaissé", JSON.stringify(p1).slice(0, 300));
    const post = d.webhooks.find((w) => /Paiement annoncé PA-/.test(w.corps));
    t.ok(post && /12\s400\s€ reçus et encaissés/.test(post.corps), "réponse au salon des relances", post ? post.corps.slice(0, 200) : "rien");
    const rv = (await lignes(d, "releves")).find((x) => x.id === "rv1") || {};
    t.ok(Object.values(rv.paiementsVus || {}).some((x) => x.etat === "encaisse"), "virement noté encaissé sur le relevé");

    // Club 77 : rien sur ses relevés, paiement non retrouvé.
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "dashboard"); await pause(d, 300);
    await d.locator("#todo .linkbtn", { hasText: "Paiement annoncé" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Aucun relevé de son compte", "pas de relevé : l'agent est prévenu");
    await d.locator("#pa-refuser").click(); await pause(d, 200);
    t.contient(texte(await d.locator("#dlg .err").innerText()), "pourquoi le paiement n’est pas retrouvé", "refus sans motif refusé");
    await d.locator("#pa-reponse").fill("Aucun virement reçu à cette date sur le compte de la Préfecture.");
    await d.locator("#pa-refuser").click(); await pause(d, 1200);
    const p2 = (await lignes(d, "paiementsAnnonces")).find((x) => x.id === "pa2") || {};
    t.ok(p2.statut === "refuse" && /Aucun virement reçu/.test(p2.reponse || ""), "paiement non retrouvé", JSON.stringify(p2).slice(0, 200));
    const dec3 = await d.evaluate(() => (window.__rows.get("decisions/de32026-S44") || {}).data);
    t.ok(dec3 && dec3.statut === "validee", "l'avis reste dû");
    t.sansErreur(d);

    // 3. Le patron lit la réponse.
    const q = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + LIEN + PA("pa9", "e1", "Taxi G7", AVIS_E1, 12400, "refuse", { decideLe: "2026-11-10T19:00:00Z", decideParNom: "Directeur Test", reponse: "Rien reçu à cette heure." }) });
    await pause(q, 1200);
    const l = texte(await q.locator("#pt-pa-l").innerText());
    t.ok(/Non retrouvé le .*Rien reçu à cette heure/.test(l) && !/Directeur Test/.test(l), "réponse lue dans l'espace (sans le nom de l'agent)", l);
    t.ok(await q.locator("#pt-pa-btn").isVisible(), "il peut l'annoncer à nouveau");

    // 4. Sans la mise à jour 52 : pas de bouton.
    const s = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + LIEN + "window.__sans52 = true;" });
    await pause(s, 1000);
    t.egal(await s.locator("#pt-pa-btn").count(), 0, "sans le script : pas de « J'ai payé »");
    t.sansErreur(s);
  },
};
