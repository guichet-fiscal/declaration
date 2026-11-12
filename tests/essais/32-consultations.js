// Journal des consultations : ouvrir une fiche d'entreprise ou une fiche RH est noté (une fois par dossier
// et par 10 minutes) ; la Direction lit le journal (Journal → Consultations), les autres non.
const { ouvrir, onglet, pause, texte } = require("../outils");

const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });`;

module.exports = {
  nom: "Journal des consultations",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: ENT });
    await onglet(d, "entreprises");
    for (let i = 0; i < 2; i++) { await d.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(d, 400); await d.keyboard.press("Escape"); await pause(d, 200); }
    await onglet(d, "personnel");
    await d.locator("#rh-list .linkbtn", { hasText: "Bruno LEROY" }).click(); await pause(d, 400); await d.keyboard.press("Escape"); await pause(d, 200);
    const c = await d.evaluate(() => window.__consultations || []);
    t.ok(c.filter((x) => x.collection === "entreprises" && x.doc_id === "e1").length === 1 && c.some((x) => x.collection === "fonctionnaires" && x.doc_id === "f2" && x.libelle === "Bruno LEROY"), "consultations notées, une fois par dossier", JSON.stringify(c));
    await onglet(d, "journal");
    t.ok(await d.locator("#j-consult").isVisible(), "Direction : bouton Consultations");
    await d.locator("#j-consult").click(); await pause(d, 500);
    const txt = texte(await d.locator("#cs-liste").innerText());
    t.ok(/Directeur Test a ouvert la fiche de l’entreprise Taxi G7/.test(txt) && /la fiche RH de Bruno LEROY/.test(txt), "journal lisible", txt.slice(0, 300));
    await d.locator("#cs-q").fill("Bruno"); await pause(d, 200);
    t.ok(!/Taxi G7/.test(texte(await d.locator("#cs-liste").innerText())), "recherche dans le journal");
    t.sansErreur(d);

    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", hash: "journal" });
    await pause(i, 600);
    t.ok(!(await i.locator("#j-consult").isVisible()), "Inspection : pas de bouton Consultations");
    t.sansErreur(i);

    const sans = await ouvrir(env, { hash: "journal", avant: ENT + "window.__sans44 = true;" });
    await sans.locator("#j-consult").click(); await pause(sans, 400);
    t.contient(texte(await sans.locator("#dlg").innerText()), "v44_consultations.sql", "sans le script : la marche à suivre");
    t.sansErreur(sans);
  },
};
