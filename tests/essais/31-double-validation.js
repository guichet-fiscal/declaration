// Double validation : un membre de la Direction demande (annuler une pénalité, gros prêt) ; un autre valide
// et le geste se fait ; le compte exempté (Directeur FP) agit seul.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });
  window.__SEED.push({ collection: "penalites", id: "pn1", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", motif: "Retard de déclaration", montant: 25000, statut: "due", createdAt: "2026-11-09T10:00:00Z" } });
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.budgetInitial = 80000000; }`;
const EXEMPT = "1008447342413873212";
const DEMANDE = `window.__SEED.push({ collection: "validations", id: "v1", data: { action: "penalite_annulee", libelle: "Annuler la pénalité de Taxi G7", cible: { collection: "penalites", id: "pn1" }, payload: {}, statut: "attente", demandePar: "Directeur Test", demandeParUid: "uid-999999999999999999", demandeParDiscord: "999999999999999999", at: "2026-11-10T19:00:00Z" } });`;

async function annulerPenalite(p) {
  await onglet(p, "entreprises");
  await p.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(p, 500);
  await p.locator("#dlg button", { hasText: /^Déclarations$/ }).first().click(); await pause(p, 300);
  await p.locator("#dlg .pen-table button", { hasText: /^Annuler$/ }).first().click(); await pause(p, 900);
}

module.exports = {
  nom: "Double validation des gestes sensibles",
  async lancer(env, t) {
    // 1. Membre de la Direction non exempté : la pénalité n'est pas annulée, une demande part.
    const d = await ouvrir(env, { hash: "dashboard", avant: ENT });
    await pause(d, 800);
    await annulerPenalite(d);
    const v = (await lignes(d, "validations"))[0] || {};
    t.ok(v.action === "penalite_annulee" && v.statut === "attente" && v.cible.id === "pn1" && v.demandeParDiscord === "999999999999999999", "demande de validation enregistrée", JSON.stringify(v).slice(0, 200));
    t.egal(((await lignes(d, "penalites"))[0] || {}).statut, "due", "pénalité toujours due");
    t.ok(await d.locator("#dlg .pen-table button", { hasText: "Annulation à valider" }).count() === 1, "bouton : annulation à valider");
    await d.keyboard.press("Escape"); await pause(d, 300);
    await onglet(d, "dashboard");
    t.contient(texte(await d.locator("#todo").innerText()), "Demande en attente d’un second membre de la Direction", "À traiter : sa demande en attente");
    // Gros prêt : enregistré comme demande, à valider.
    await onglet(d, "prets");
    await d.locator("#pret-new").click(); await pause(d, 300);
    await d.locator("#pf-ent").fill("Taxi G7"); await d.locator("#pf-montant").fill("600000"); await d.locator("#pf-montant").dispatchEvent("input");
    await d.locator("#dlg button", { hasText: "Accorder et verser" }).click(); await pause(d, 1200);
    const pr = (await lignes(d, "prets"))[0] || {};
    t.ok(pr.statut === "demande" && (await lignes(d, "validations")).some((x) => x.action === "pret_accorde" && x.cible.id === pr.id), "gros prêt : demande, versement à valider", JSON.stringify(pr).slice(0, 120));
    await d.keyboard.press("Escape"); await pause(d, 200);
    await onglet(d, "reglages");
    await d.locator("#set-tab-acces").click(); await pause(d, 400);
    const dv = texte(await d.locator("#dv-card").innerText());
    t.ok(/Double validation/.test(dv) && /Agissent seuls/.test(dv) && await d.locator('#dv-card input[data-dv-ex="1008447342413873212"]').isChecked(), "réglages : double validation, Directeur FP exempté", dv.slice(0, 200));
    t.sansErreur(d);

    // 2. Un second membre de la Direction valide : la pénalité est annulée.
    const s = await ouvrir(env, { discord: "888888888888888888", nom: "Directrice Adjointe", hash: "dashboard", avant: ENT + DEMANDE + `window.__roles = { "888888888888888888": "direction" };` });
    await pause(s, 800);
    t.contient(texte(await s.locator("#todo").innerText()), "Geste sensible à valider", "À traiter : geste à valider");
    await s.locator("#todo button", { hasText: "Geste sensible à valider" }).first().click(); await pause(s, 400);
    await s.locator("#dv-autres button", { hasText: "Valider" }).click(); await pause(s, 1200);
    t.egal(((await lignes(s, "penalites"))[0] || {}).statut, "annulee", "validé : pénalité annulée");
    const v2 = (await lignes(s, "validations")).find((x) => x.id === "v1") || {};
    t.ok(v2.statut === "validee" && v2.decidePar === "Directrice Adjointe", "demande close : validée par le second membre");
    t.sansErreur(s);

    // 3. Le compte exempté annule seul.
    const x = await ouvrir(env, { discord: EXEMPT, nom: "Directeur FP | Pierre LALLEMENT", hash: "dashboard", avant: ENT });
    await pause(x, 800);
    await annulerPenalite(x);
    t.ok(((await lignes(x, "penalites"))[0] || {}).statut === "annulee" && !(await lignes(x, "validations")).length, "exempté : annulée sans demande");
    t.sansErreur(x);
  },
};
