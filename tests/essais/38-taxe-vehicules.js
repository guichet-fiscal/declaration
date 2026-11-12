// Taxe sur les véhicules de société (option) : désactivée par défaut ; activée, chaque véhicule détenu pendant
// la période ajoute le montant de son type à l'avis (0 : exonéré). Vendu avant la période : pas compté.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });
  const V = (id, cat, plaque, extra) => window.__SEED.push({ collection: "vehicules", id, data: Object.assign({ entrepriseId: "e1", entrepriseNom: "Taxi G7", plaque, modele: "Modèle " + id, categorie: cat, prix: 50000, achatLe: "2026-10-01T12:00:00Z", statut: "service", source: "entreprise", constats: [], createdAt: "2026-10-01T12:00:00Z" }, extra || {}) });
  V("v1", "berline", "AB-123-CD"); V("v2", "utilitaire", "UT-111-AA");
  V("v3", "suv", "SU-222-BB", { statut: "vendu", vente: { at: "2026-10-20T12:00:00Z", prix: 30000 } });
  V("v4", "sportive", "SP-333-CC", { achatLe: "2026-12-01T12:00:00Z" });`;
const TAXE = `{ const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.vehicules = { actif: true, taxe: true, taxeMontants: { berline: 800 } }; }`;

async function saisir(d) {
  await d.locator("#d-ent").fill("Taxi G7"); await d.locator("#d-ent").dispatchEvent("input"); await d.locator("#d-ent").dispatchEvent("change"); await pause(d, 300);
  await d.locator("#d-ca").fill("20000"); await d.locator("#d-ch").fill("3000");
  await d.locator("#d-ca").dispatchEvent("input"); await pause(d, 300);
}

module.exports = {
  nom: "Taxe sur les véhicules de société (option)",
  async lancer(env, t) {
    // 1. Désactivée par défaut : rien dans le calcul.
    const a = await ouvrir(env, { hash: "declaration", avant: ENT });
    await pause(a, 800); await saisir(a);
    t.ok(!(await a.locator("#c-tvs").isVisible()), "désactivée par défaut : pas de ligne");
    await a.close();

    // 2. Activée : la berline compte (800 €), l'utilitaire est exonéré, le SUV vendu avant et la sportive achetée après ne comptent pas.
    const d = await ouvrir(env, { hash: "declaration", avant: ENT + TAXE });
    await pause(d, 800); await saisir(d);
    t.ok(await d.locator("#c-tvs").isVisible(), "ligne de la taxe dans le calcul");
    t.contient(texte(await d.locator("#c-tvs-l").innerText()), "(1 véhicule)", "un seul véhicule taxé");
    t.contient(texte(await d.locator("#c-tvs").innerText()), "800 €", "montant de la berline");
    const tot0 = texte(await d.locator("#c-tot").innerText());
    await d.locator("#d-decl").fill("Jean Dupont");
    await d.locator("#d-submit").click(); await pause(d, 1200);
    if (await d.locator("#dlg").isVisible()) { const b = d.locator("#dlg .dlg-foot button.ink, #dlg footer button.ink").last(); if (await b.count()) { await b.click(); await pause(d, 1000); } }
    const decl = (await lignes(d, "declarations"))[0] || {};
    t.ok(decl.taxeVehicules && decl.taxeVehicules.montant === 800 && decl.taxeVehicules.vehicules.length === 1 && decl.taxeVehicules.vehicules[0].plaque === "AB-123-CD", "taxe enregistrée avec la déclaration", JSON.stringify(decl.taxeVehicules || null));
    t.ok(decl.total === (decl.impot || 0) + (decl.cotisations || 0) + (decl.majoration || 0) + 800, "total : impôt, cotisations, majoration et taxe", `${decl.total} · ${tot0}`);

    // 3. Le dossier de la déclaration la montre, par type de véhicule.
    await onglet(d, "entreprises"); await pause(d, 300);
    await d.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(d, 500);
    await d.locator('#dlg .fiche-tabs button[data-ft="declarations"]').click(); await pause(d, 200);
    await d.locator("#fp-declarations button.linkbtn", { hasText: /Semaine/ }).first().click(); await pause(d, 500);
    t.contient(texte(await d.locator("#dlg").innerText()), "Taxe véhicules · berline ou citadine (AB-123-CD)", "dossier : la ligne de la taxe");
    t.sansErreur(d);
    await d.close();

    // 4. Espace entreprise (mise à jour 47) : le montant estimé de la déclaration en ligne la compte.
    const JETON = "0123456789abcdef0123456789abcdef0123";
    const p = await ouvrir(env, { hash: "espace=" + JETON, avant: ENT + TAXE + `window.__jetons = { "${JETON}": "e1" };` });
    await pause(p, 1200);
    await p.locator("#pt-todo button", { hasText: "Déclarer" }).first().click(); await pause(p, 400);
    await p.locator("#dlg select").first().selectOption("2026-S45"); await pause(p, 200);
    await p.locator("#dlg input[type=number]").first().fill("20000"); await p.locator("#dlg input[type=number]").first().dispatchEvent("input"); await pause(p, 200);
    t.contient(texte(await p.locator("#dlg").innerText()), "Taxe sur les véhicules de société (1 véhicule)", "espace entreprise : la taxe dans le montant estimé");
    t.sansErreur(p);
    await p.close();

    // 5. Réglages : l'option et les montants par type.
    const r = await ouvrir(env, { hash: "dashboard", avant: ENT });
    await pause(r, 600); await onglet(r, "reglages"); await r.locator("#set-tab-entreprises").click(); await pause(r, 300);
    t.ok(!(await r.locator("#vh-taxe").isChecked()) && !(await r.locator("#vh-taxe-montants").isVisible()), "réglage : désactivée, montants cachés");
    await r.locator("#vh-taxe").check(); await pause(r, 100);
    t.ok(await r.locator("#vh-taxe-montants").isVisible(), "montants par type affichés");
    t.egal(await r.locator("#vh-tx-utilitaire").inputValue(), "0", "utilitaire exonéré par défaut");
    await r.locator("#vh-tx-berline").fill("700");
    await r.locator("#vh-save").click(); await pause(r, 600);
    const cf = ((await lignes(r, "config")).find((x) => x.id === "main") || {}).vehicules || {};
    t.ok(cf.taxe === true && cf.taxeMontants && cf.taxeMontants.berline === 700 && cf.taxeMontants.suv === 1000, "réglage enregistré", JSON.stringify(cf));
    t.sansErreur(r);
  },
};
