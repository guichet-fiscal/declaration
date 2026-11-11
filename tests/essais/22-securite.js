// Espace Sécurité du service de la protection : entrées dans la Préfecture (avec la photo de la pièce),
// contrôles d'identité, rapports ; responsables : rapports lus, suppression ; Direction : tout.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
const grades = (a, b) => `window.__SEED.find(r => r.id === "f1").data.grade = "${a}"; window.__SEED.find(r => r.id === "f2").data.grade = "${b}";`;
const PROTECTION = grades("Agent service de la protection", "Responsable service de la protection");

module.exports = {
  nom: "Espace Sécurité du service de la protection",
  async lancer(env, t) {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "secu-"));
    const carte = path.join(dossier, "carte.png");
    fs.writeFileSync(carte, PNG);

    // Agent de la protection : Mon espace et Sécurité.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace", avant: PROTECTION });
    await pause(a, 800);
    t.ok(await a.locator("#tab-btn-securite").isVisible(), "agent de la protection : onglet Sécurité");
    await a.locator("#tab-btn-securite").click(); await pause(a, 500);
    // Entrée avec la photo de la carte.
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").fill("Jean Dupont");
    await a.locator("#se-qualite").fill("Avocat");
    await a.locator("#se-visite").fill("Direction des finances publiques");
    await a.locator("#dlg input[type=file]").setInputFiles(carte); await pause(a, 300);
    t.egal(await a.locator("#dlg .secu-photo").count(), 1, "photo de la carte jointe avant l'envoi");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 1200);
    let txt = texte(await a.locator("#secu-main").innerText());
    t.ok(/Dans les locaux \(1\)/.test(txt) && /Jean Dupont · Avocat/.test(txt) && /Pièce vue/.test(txt), "entrée notée, dans les locaux, pièce vue", txt.slice(0, 300));
    let e = (await lignes(a, "securiteEntrees"))[0] || {};
    t.ok(e.fid === "f1" && e.agent === "Alice MARTIN" && /^securiteEntrees\/.+\.jpg$/.test((e.photos || [])[0] && e.photos[0].path) && !e.sortie, "dossier : auteur, photo dans l'espace « securite »", JSON.stringify(e).slice(0, 300));
    t.ok(await a.evaluate((p) => window.__fichiers.has("securite/" + p), e.photos[0].path), "photo envoyée dans l'espace privé");
    await a.locator("#secu-main button", { hasText: "Sortie" }).click(); await pause(a, 1000);
    e = (await lignes(a, "securiteEntrees"))[0] || {};
    t.ok(!!e.sortie && e.sortiePar === "Alice MARTIN" && /Dans les locaux \(0\)/.test(texte(await a.locator("#secu-main").innerText())), "sortie notée");
    // Deux contrôles de la même personne (noms dans l'autre ordre) : le second le signale.
    for (const [nom, res] of [["Jean Dupont", "conforme"], ["DUPONT Jean", "faux"]]) {
      await a.locator("#secu-controle").click(); await pause(a, 300);
      await a.locator("#sc-nom").fill(nom);
      await a.locator("#sc-resultat").selectOption(res);
      await a.locator("#dlg input[type=file]").setInputFiles(carte); await pause(a, 200);
      if (res === "faux") t.contient(texte(await a.locator("#dlg").innerText()), "Déjà contrôlé 1 fois", "même personne déjà contrôlée");
      await a.locator("#dlg button", { hasText: "Enregistrer le contrôle" }).click(); await pause(a, 1000);
    }
    await a.locator("#secu-main .seg button", { hasText: "Contrôles" }).click(); await pause(a, 300);
    txt = texte(await a.locator("#secu-main").innerText());
    t.ok(/Faux document/.test(txt) && /Conforme/.test(txt) && /1 photo/.test(txt), "liste des contrôles avec le résultat", txt.slice(0, 300));
    // Rapport : remis, l'agent ne le marque pas comme lu.
    await a.locator("#secu-rapport").click(); await pause(a, 300);
    await a.locator("#sr-titre").fill("Altercation à l’accueil");
    await a.locator("#sr-recit").fill("À 21 h 10, un visiteur a refusé de présenter sa pièce et a insulté l’agent d’accueil.");
    await a.locator("#dlg button", { hasText: "Remettre le rapport" }).click(); await pause(a, 1000);
    await a.locator("#secu-main .seg button", { hasText: "Rapports" }).click(); await pause(a, 300);
    t.contient(texte(await a.locator("#secu-main").innerText()), "Remis", "rapport remis");
    await a.locator("#secu-main .linkbtn", { hasText: "Altercation" }).click(); await pause(a, 300);
    t.ok(!(await a.locator("#dlg button", { hasText: "Marquer comme lu" }).count()) && !(await a.locator("#dlg button", { hasText: "Supprimer" }).count()), "un agent ne marque pas lu et ne supprime pas");
    t.sansErreur(a);

    // Responsable : rapport à lire, marqué comme lu, suppression possible.
    const RAPPORT = 'window.__SEED.push({ collection: "securiteRapports", id: "sr1", data: { fid: "f1", agent: "Alice MARTIN", type: "incident", titre: "Vol au vestiaire", date: "2026-11-10T19:00:00Z", recit: "Un portefeuille a disparu du vestiaire.", statut: "remis", at: "2026-11-10T19:30:00Z" } });';
    const r = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", hash: "securite", avant: PROTECTION + RAPPORT });
    await pause(r, 1000);
    await r.locator("#tab-btn-securite").click(); await pause(r, 500);
    t.contient(texte(await r.locator("#secu-main").innerText()), "1 à lire", "responsable : rapports à lire");
    await r.locator("#secu-main .seg button", { hasText: "Rapports" }).click(); await pause(r, 300);
    await r.locator("#secu-main .linkbtn", { hasText: "Vol au vestiaire" }).click(); await pause(r, 300);
    t.ok(await r.locator("#dlg button", { hasText: "Supprimer" }).count() > 0, "responsable : suppression possible");
    await r.locator("#dlg button", { hasText: "Marquer comme lu" }).click(); await pause(r, 800);
    const rp = (await lignes(r, "securiteRapports")).find((x) => x.id === "sr1") || {};
    t.ok(rp.luLe && rp.luPar === "Bruno LEROY" && rp.statut === "lu", "rapport marqué comme lu", JSON.stringify(rp).slice(0, 200));
    t.sansErreur(r);

    // Direction : l'onglet et les dossiers ; Inspection et agent d'un autre service : pas d'onglet.
    const d = await ouvrir(env, { avant: RAPPORT });
    await pause(d, 600);
    t.ok(await d.locator("#tab-btn-securite").count() > 0, "Direction : onglet Sécurité");
    await onglet(d, "securite"); await pause(d, 400);
    await d.locator("#secu-main .seg button", { hasText: "Rapports" }).click(); await pause(d, 300);
    t.contient(texte(await d.locator("#secu-main").innerText()), "Vol au vestiaire", "Direction : voit les rapports");
    await d.locator("#secu-main .linkbtn", { hasText: "Vol au vestiaire" }).click(); await pause(d, 300);
    const sup = d.locator("#dlg button.danger");
    await sup.click(); await pause(d, 300);
    t.ok((await sup.innerText()).includes("Confirmer") && (await lignes(d, "securiteRapports")).some((x) => x.id === "sr1"), "suppression : un premier clic demande confirmation");
    await sup.click(); await pause(d, 800);
    t.ok(!(await lignes(d, "securiteRapports")).some((x) => x.id === "sr1"), "suppression confirmée");
    t.sansErreur(d);
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test" });
    t.ok(await i.locator("#tab-btn-securite").isHidden(), "Inspection : pas d'onglet Sécurité");
    const x = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace" });
    await pause(x, 600);
    t.ok(await x.locator("#tab-btn-securite").isHidden(), "agent d'un autre service : pas d'onglet Sécurité");

    // Mise à jour 38 pas exécutée : l'onglet le dit.
    const z = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace", avant: PROTECTION + "window.__sans38 = true;" });
    await pause(z, 800);
    await z.locator("#tab-btn-securite").click(); await pause(z, 400);
    t.contient(texte(await z.locator("#secu-main").innerText()), "v38_securite.sql", "sans la mise à jour 38 : message clair");
    fs.rmSync(dossier, { recursive: true, force: true });
  },
};
