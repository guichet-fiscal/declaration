// Réclamations : depuis son espace, le patron conteste un avis ou une pénalité (motif, preuve, montant
// proposé) ; au guichet, le dossier de recouvrement attend la réponse ; la Direction réduit l'avis ou annule
// la pénalité, la réponse part au salon des relances et le patron la lit dans son espace.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const JETON = "0123456789abcdef0123456789abcdef0123";
const LIEN = `window.__jetons = { "${JETON}": "e1" };`;
const PEN = `window.__SEED.push({ collection: "penalites", id: "pn1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", type: "retard", motif: "Déclaration déposée en retard", montant: 5000, statut: "due", at: "2026-11-05T10:00:00Z" } });`;
const RELANCES = (env) => `window.__discord = { webhooks: { relances: "${env.url}/__webhook/relances" } };`;

module.exports = {
  nom: "Réclamations des entreprises",
  async lancer(env, t) {
    // 1. Le patron conteste son avis de la semaine 44.
    const p = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + PEN + LIEN });
    await pause(p, 1200);
    await p.locator("#pt-rc-btn").click(); await pause(p, 300);
    const choix = texte(await p.locator("#dlg .rl-pick").innerText());
    t.ok(/Avis d’imposition · semaine 44/i.test(choix) && /Pénalité · Déclaration déposée en retard/.test(choix), "avis et pénalité à contester", choix);
    await p.locator("#pr-motif").fill("Trop court");
    await p.locator("#pr-ok").click(); await pause(p, 200);
    t.contient(texte(await p.locator("#dlg .err").innerText()), "20 caractères au moins", "motif trop court refusé");
    await p.locator("#pr-motif").fill("Le chiffre d’affaires repris est celui de deux semaines, pas d’une seule.");
    await p.locator("#pr-preuve").fill("https://example.org/releve.png");
    await p.locator("#pr-montant").fill("6000");
    await p.locator("#pr-ok").click(); await pause(p, 900);
    const rc = (await lignes(p, "reclamations"))[0] || {};
    t.ok(rc.statut === "attente" && rc.cible && rc.cible.kind === "decl" && rc.cible.id === "de12026-S44" && rc.montantPropose === 6000 && rc.preuve === "https://example.org/releve.png", "réclamation enregistrée", JSON.stringify(rc).slice(0, 300));
    t.contient(texte(await p.locator("#pt-rc-l").innerText()), "la Préfecture l’examine", "réclamation en attente dans l'espace");
    t.contient(texte(await p.locator("#pt-pay").innerText()), "contesté : en attente de la réponse", "avis marqué contesté dans « À payer »");
    t.sansErreur(p);

    // 2. La Direction : « À traiter », dossier suspendu, réponse.
    const RC = `window.__SEED.push({ collection: "reclamations", id: "rc1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", cible: { kind: "decl", id: "de12026-S44", periode: "2026-S44", montant: 12400 }, motif: "Le chiffre d’affaires repris est celui de deux semaines.", montantPropose: 6000, statut: "attente", enLigne: true, at: "2026-11-10T18:00:00Z" } });
      window.__SEED.push({ collection: "reclamations", id: "rc2", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", cible: { kind: "pen", id: "pn1", type: "retard", motif: "Déclaration déposée en retard", montant: 5000 }, motif: "La déclaration a été déposée à l’heure, capture à l’appui.", statut: "attente", enLigne: true, at: "2026-11-10T18:05:00Z" } });`;
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + PEN + RC + RELANCES(env) });
    await pause(d, 900);
    t.contient(texte(await d.locator("#todo").innerText()), "Réclamations d’entreprise à examiner", "À traiter : les réclamations");
    await onglet(d, "recouvrement"); await pause(d, 400);
    const li = d.locator("#rc-afaire-l > li", { hasText: "Taxi G7" }).first();
    const tx = texte(await li.innerText());
    t.ok(/L’entreprise conteste l’avis DF-/.test(tx) && /Le recouvrement attend la réponse/.test(tx), "dossier suspendu par la réclamation", tx.slice(0, 400));
    await li.locator(".rc-dos-a > button", { hasText: "Répondre à la réclamation" }).click(); await pause(d, 400);
    await d.locator("#rc-choix").selectOption("reduite");
    await d.locator("#rc-montant").fill("6000");
    await d.locator("#rc-reponse").fill("Erreur de reprise confirmée : l’avis est ramené à une semaine.");
    await d.locator("#rc-ok").click(); await pause(d, 1200);
    const dec = await d.evaluate(() => (window.__rows.get("decisions/de12026-S44") || {}).data);
    t.ok(dec && dec.montant === 6000 && dec.statut === "validee" && dec.rectifie && dec.rectifie.ancienMontant === 12400, "avis réduit à 6 000 € (ancien montant noté)", JSON.stringify(dec).slice(0, 300));
    const r1 = (await lignes(d, "reclamations")).find((x) => x.id === "rc1") || {};
    t.ok(r1.statut === "reduite" && r1.montantRetenu === 6000 && !!r1.decideLe, "réclamation : réduite", JSON.stringify(r1).slice(0, 200));
    const post = d.webhooks.find((w) => /Réclamation RC-/.test(w.corps));
    t.ok(post && /montant réduit de 12\s400\s€ à 6\s000\s€/.test(post.corps), "réponse au salon des relances", post ? post.corps.slice(0, 300) : "rien");

    // La pénalité : annulée.
    await onglet(d, "dashboard"); await pause(d, 400);
    await d.locator("#todo .linkbtn", { hasText: "Réclamation" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "La déclaration a été déposée à l’heure", "« À traiter » ouvre la réclamation restante");
    await d.locator("#rc-choix").selectOption("accueillie");
    await d.locator("#rc-reponse").fill("Dépôt à l’heure vérifié : pénalité annulée.");
    await d.locator("#rc-ok").click(); await pause(d, 1000);
    const pn = await d.evaluate(() => (window.__rows.get("penalites/pn1") || {}).data);
    t.ok(pn && pn.statut === "annulee" && /Réclamation RC-/.test(pn.motifAnnulation || ""), "pénalité annulée", JSON.stringify(pn).slice(0, 200));
    t.sansErreur(d);

    // 3. Le patron lit la réponse.
    const DECIDE = RC.replace('statut: "attente", enLigne: true, at: "2026-11-10T18:00:00Z"', 'statut: "reduite", montantRetenu: 6000, ancienMontant: 12400, reponse: "Erreur de reprise confirmée.", decideLe: "2026-11-10T19:00:00Z", decideParNom: "Directeur Test", enLigne: true, at: "2026-11-10T18:00:00Z"');
    const q = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + PEN + DECIDE + LIEN });
    await pause(q, 1200);
    const l = texte(await q.locator("#pt-rc-l").innerText());
    t.ok(/réduit à 6\s000 €\. Erreur de reprise confirmée/.test(l) && !/Directeur Test/.test(l), "réponse lue dans l'espace (sans le nom de l'agent)", l);

    // 4. Sans la mise à jour 49 : pas de bouton.
    const s = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + PEN + LIEN + "window.__sans49 = true;" });
    await pause(s, 1000);
    t.egal(await s.locator("#pt-rc-btn").count(), 0, "sans le script : pas de réclamation en ligne");
    t.sansErreur(s);
  },
};
