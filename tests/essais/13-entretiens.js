// Entretiens et objectifs : création par la Direction, brouillon / partage, lecture et accusé par l'agent.
const { ouvrir, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Entretiens et objectifs",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel" });
    await d.locator("#rh-espaces button", { hasText: "Entretiens" }).click(); await pause(d, 400);
    await d.locator("#rh-entretiens button", { hasText: "Nouvel entretien" }).click(); await pause(d, 300);
    await d.locator("#en-qui").selectOption("f1"); await d.locator("#en-date").fill("2026-11-10");
    await d.locator("#dlg button", { hasText: "Enregistrer l’entretien" }).click(); await pause(d, 200);
    t.contient(texte(await d.locator("#dlg .err").innerText()), "bilan", "il faut un bilan ou un objectif");
    await d.locator("#en-bilan").fill("Très bon premier mois, ponctuelle et rigoureuse.");
    await d.locator("#dlg button", { hasText: "Ajouter un objectif" }).click(); await pause(d, 100);
    await d.locator(".obj-ligne input").first().fill("Faire 10 h de service par semaine");
    await d.locator('.obj-ligne input[type="date"]').first().fill("2026-11-30");
    await d.locator("#dlg button", { hasText: "Enregistrer l’entretien" }).click(); await pause(d, 700);
    const e = (await lignes(d, "entretiens"))[0];
    t.ok(e && e.fid === "f1" && e.statut === "partage" && e.objectifs.length === 1 && e.objectifs[0].echeance === "2026-11-30", "entretien partagé avec un objectif");
    await pause(d, 300);
    t.contient(texte(await d.locator("#rh-entretiens").innerText()), "Objectifs en cours (1)", "objectif en cours listé");
    // Fiche de l'agent : section entretiens.
    await d.locator("#rh-espaces button", { hasText: "Effectif" }).click(); await pause(d, 300);
    await d.locator("#rh-list .linkbtn", { hasText: "Alice" }).first().click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Entretiens et objectifs", "section dans la fiche de l'agent");
    t.sansErreur(d);
    // L'agent lit le compte rendu et en prend connaissance.
    const etat = JSON.stringify([{ collection: "entretiens", id: e.id, data: Object.assign({}, e, { id: undefined }) }]);
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: `window.__SEED.push(...${etat});` });
    const carte = a.locator("#espace-main .card", { has: a.locator("h3", { hasText: "Mes objectifs" }) });
    t.contient(texte(await carte.innerText()), "Faire 10 h de service par semaine", "l'agent voit ses objectifs");
    await carte.locator("button", { hasText: "Lire" }).click(); await pause(a, 300);
    t.contient(texte(await a.locator("#dlg").innerText()), "Très bon premier mois", "l'agent lit le bilan");
    await a.locator("#me-com").fill("Merci, je vais m’organiser."); await a.locator("#dlg button", { hasText: "J’ai pris connaissance" }).click(); await pause(a, 900);
    const vu = (await lignes(a, "entretiens"))[0];
    t.ok(vu.vuParAgentLe && vu.commentaireAgent === "Merci, je vais m’organiser.", "prise de connaissance et commentaire enregistrés");
    t.sansErreur(a);
    // Brouillon : invisible pour l'agent.
    const b = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: `window.__SEED.push({ collection: "entretiens", id: "eb", data: { fid: "f1", nom: "Alice MARTIN", date: "2026-11-09", type: "suivi", bilan: "Brouillon secret", objectifs: [], statut: "brouillon" } });` });
    t.ok(!(await b.locator("body").innerText()).includes("Brouillon secret"), "un brouillon n'est pas montré à l'agent");
  },
};
