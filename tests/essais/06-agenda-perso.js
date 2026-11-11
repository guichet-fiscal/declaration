// Agenda personnel et rappels au choix : ajout, modification, suppression, confidentialité, réglages.
const { ouvrir, pause, texte } = require("../outils");

const carte = (p) => p.locator("#espace-main .card", { has: p.locator("h3", { hasText: /^Agenda$/ }) });

module.exports = {
  nom: "Agenda personnel et rappels",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    await a.locator("#es-perso-ajout").click(); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "Ajouter à mon agenda" }).click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "titre", "titre obligatoire");
    await a.locator("#pe-titre").fill("Rendez-vous chez le notaire"); await a.locator("#pe-date").fill("2026-11-12");
    await a.locator("#pe-hd").fill("20:00"); await a.locator("#pe-rappel").selectOption("10");
    await a.locator("#dlg button", { hasText: "Ajouter à mon agenda" }).click(); await pause(a, 900);
    let perso = await a.evaluate(() => window.__perso);
    t.egal(perso.map((p) => [p.fid, p.titre, p.rappel_min]), [["f1", "Rendez-vous chez le notaire", 10]], "événement personnel enregistré avec son rappel");
    // Modifier puis supprimer.
    await carte(a).locator(".linkbtn", { hasText: "notaire" }).click(); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "Modifier" }).click(); await pause(a, 300);
    t.egal(await a.locator("#pe-rappel").inputValue(), "10", "le rappel est repris à la modification");
    await a.locator("#pe-rappel").selectOption(""); await a.locator("#dlg button", { hasText: "Enregistrer" }).click(); await pause(a, 800);
    t.egal((await a.evaluate(() => window.__perso))[0].rappel_min, null, "rappel retiré");
    await carte(a).locator(".linkbtn", { hasText: "notaire" }).click(); await pause(a, 300);
    const sup = await a.locator("#dlg button", { hasText: "Supprimer" }).elementHandle(); await sup.click(); await pause(a, 100); await sup.click(); await pause(a, 800);
    t.egal(await a.evaluate(() => window.__perso.length), 0, "suppression en deux clics");
    // Rappel habituel et rappel propre à un rendez-vous.
    await a.locator("#es-rappel-defaut").selectOption("30"); await pause(a, 700);
    t.egal(await a.evaluate(() => window.__rappels.f1.defaut_min), 30, "rappel habituel enregistré");
    await carte(a).locator(".linkbtn", { hasText: "Réunion de service" }).click(); await pause(a, 400);
    await a.locator("#ev-mon-rappel").selectOption("1440"); await pause(a, 700);
    t.egal(await a.evaluate(() => window.__rappels.f1.evenements), { e1: 1440 }, "rappel la veille pour ce rendez-vous");
    t.sansErreur(a);

    // Confidentialité : la Direction ne voit pas l'agenda personnel d'Alice.
    const d = await ouvrir(env, { avant: 'window.__perso = [{ id: "pa", fid: "f1", titre: "Secret Alice", debut: "2026-11-12T19:00:00Z", rappel_min: 60, journee: false }];', hash: "personnel" });
    t.ok(!(await d.locator("body").innerText()).includes("Secret Alice"), "l'encadrement ne voit pas les événements personnels");
    // Absent : pas de rappel proposé.
    const b = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno",
      avant: 'window.__SEED.forEach(r => { if (r.collection === "agenda") r.data.reponses = { f2: { r: "non" } }; });' });
    await carte(b).locator(".linkbtn", { hasText: "Réunion de service" }).click(); await pause(b, 400);
    t.contient(texte(await b.locator("#dlg").innerText()), "vous avez répondu « Absent »", "pas de rappel après « Absent »");
    // Sans les mises à jour 34 et 35 : le guichet le dit au lieu de casser.
    const x = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", avant: "window.__persoAbsent = true; window.__rappelsAbsent = true;" });
    t.egal(await x.locator("#es-rappel-defaut").count(), 0, "sans le script 35 : pas de réglage des rappels");
    await x.locator("#es-perso-ajout").click(); await pause(x, 400);
    t.ok(!(await x.locator("#dlg").isVisible()), "sans le script 34 : pas de formulaire, un message à la place");
    t.sansErreur(x);
  },
};
