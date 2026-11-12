// Lettres lues dans l'espace entreprise (ouverte / « J'ai pris connaissance ») et demande de délai de
// paiement : le patron demande, la Direction voit le dossier suspendu et accorde (échéancier).
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const JETON = "0123456789abcdef0123456789abcdef0123";
const LIEN = `window.__jetons = { "${JETON}": "e1" };`;

module.exports = {
  nom: "Lettres lues et demandes de délai de paiement",
  async lancer(env, t) {
    // 1. Le patron de Taxi G7 : sa relance s'ouvre, il la marque lue, puis demande un délai.
    const p = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + LIEN });
    await pause(p, 1200);
    t.ok(await p.locator("#pt-lettres").isVisible(), "lettres dans l'espace");
    const r1 = (await lignes(p, "relances")).find((x) => x.id === "r1") || {};
    t.ok(!!r1.vueLe && !r1.accuseLe, "relance notée ouverte à l'affichage", JSON.stringify(r1).slice(0, 160));
    await p.locator("#pt-lettres button", { hasText: "J’ai pris connaissance" }).first().click(); await pause(p, 600);
    t.ok(!!((await lignes(p, "relances")).find((x) => x.id === "r1") || {}).accuseLe, "« J'ai pris connaissance » noté");
    t.contient(texte(await p.locator("#pt-lettres").innerText()), "lue le", "lettre marquée lue");
    await p.locator("#pt-delai-btn").click(); await pause(p, 300);
    await p.locator("#pd-mode").selectOption("plusieurs"); await p.locator("#pd-nb").selectOption("3");
    await p.locator("#pd-motif").fill("Gros achat de véhicules cette semaine.");
    await p.locator("#dlg button", { hasText: "Envoyer la demande" }).click(); await pause(p, 800);
    const dl = (await lignes(p, "delais"))[0] || {};
    t.ok(dl.statut === "attente" && dl.mode === "plusieurs" && dl.nb === 3 && dl.decls.includes("de12026-S44"), "demande enregistrée", JSON.stringify(dl).slice(0, 200));
    t.contient(texte(await p.locator("#pt-delai").innerText()), "en attente de la Direction", "demande en attente affichée");
    t.sansErreur(p);

    // 2. La Direction : dossier suspendu, réponse dans « À faire » ; accorde.
    const DEM = `window.__SEED.push({ collection: "delais", id: "dl1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", decls: ["de12026-S44"], mode: "plusieurs", nb: 3, motif: "Gros achat de véhicules cette semaine.", statut: "attente", enLigne: true, at: "2026-11-10T19:00:00Z" } });
      window.__SEED.find(r => r.collection === "relances" && r.id === "r1").data.accuseLe = "2026-11-08T12:00:00Z";`;
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + DEM });
    await pause(d, 800);
    t.contient(texte(await d.locator("#todo").innerText()), "Demande de délai de paiement", "À traiter : la demande");
    await onglet(d, "recouvrement"); await pause(d, 400);
    const li = d.locator("#rc-afaire-l > li", { hasText: "Taxi G7" });
    const tx = texte(await li.innerText());
    t.ok(/demande à payer en 3 fois/.test(tx) && /Le recouvrement attend la réponse/.test(tx), "dossier suspendu par la demande", tx);
    await li.locator(".rc-dos-a > button", { hasText: "Répondre à la demande de délai" }).click(); await pause(d, 400);
    await d.locator("#dl-reponse").fill("Accordé une fois.");
    await d.locator("#dlg button", { hasText: "Accorder" }).click(); await pause(d, 1200);
    const ec = (await lignes(d, "echeanciers")).find((x) => x.declId === "de12026-S44") || {};
    t.ok((ec.echeances || []).length === 3 && ec.total === 12400 && ec.delai === "dl1", "échéancier en 3 fois créé", JSON.stringify(ec).slice(0, 200));
    t.egal(((await lignes(d, "delais")).find((x) => x.id === "dl1") || {}).statut, "accordee", "demande accordée");
    t.ok(!/12 400 € non payés/.test(texte(await d.locator("#rc-afaire").innerText())), "Taxi G7 n'est plus en retard (échéancier)");
    t.sansErreur(d);

    // 3. Sans la mise à jour 46 : l'espace marche, sans le bouton.
    const q = await ouvrir(env, { hash: "espace=" + JETON, avant: SEED + LIEN + "window.__sans46 = true;" });
    await pause(q, 1000);
    t.ok(await q.locator("#pt-delai-btn").count() === 0 && await q.locator("#pt-lettres").isVisible(), "sans le script : pas de demande, lettres visibles");
    t.sansErreur(q);
  },
};
