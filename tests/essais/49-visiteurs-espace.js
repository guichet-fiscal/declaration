// Visiteurs attendus annoncés depuis Mon espace (mise à jour 50) : un fonctionnaire qui n'est ni de
// l'encadrement ni de la protection inscrit ses visiteurs dans un rendez-vous de son agenda personnel ;
// l'accueil les attend, les reçoit, et il est prévenu ; modifier ou supprimer le rendez-vous les met à jour.
const { ouvrir, pause, texte } = require("../outils");

const PROTECTION = `window.__SEED.find(r => r.id === "f2").data.grade = "Agent service de la protection";`;
const attendus = (p) => p.evaluate(() => [...window.__rows.values()].filter((r) => r.collection === "securiteAttendus").map((r) => Object.assign({ id: r.id }, r.data)));

module.exports = {
  nom: "Mon espace : visiteurs attendus d'un rendez-vous personnel",
  async lancer(env, t) {
    // 1. Alice annonce deux visiteurs pour son rendez-vous de 22 h.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    await pause(a, 800);
    await a.locator("#es-perso-ajout").click(); await pause(a, 300);
    await a.locator("#pe-titre").fill("Entretien avec un avocat");
    await a.locator("#pe-date").fill("2026-11-10"); await a.locator("#pe-hd").fill("22:00");
    await a.locator("#pe-visiteurs").fill("Paul BLANC, Sophie ROUX");
    await a.locator("#pe-ok").click(); await pause(a, 1000);
    let l = await attendus(a);
    t.ok(l.length === 2 && l.every((x) => x.hote === "Alice MARTIN" && x.hoteFid === "f1" && x.objet === "Entretien avec un avocat" && x.statut === "attendu" && x.date === "2026-11-10T21:00:00.000Z"),
      "deux visiteurs attendus, à son nom, à l'heure du rendez-vous", JSON.stringify(l).slice(0, 400));
    const carte = a.locator("#espace-main .card", { has: a.locator("h3", { hasText: /^Agenda$/ }) });
    await carte.locator(".linkbtn", { hasText: "avocat" }).click(); await pause(a, 300);
    t.ok(/Paul BLANC\s*Attendu/.test(texte(await a.locator("#pe-visiteurs-l").innerText())), "le rendez-vous montre ses visiteurs");

    // 2. Sophie ROUX ne vient plus.
    await a.locator("#dlg button", { hasText: "Modifier" }).click(); await pause(a, 300);
    t.contient(await a.locator("#pe-visiteurs").inputValue(), "Sophie ROUX", "visiteurs repris à la modification");
    await a.locator("#pe-visiteurs").fill("Paul BLANC");
    await a.locator("#pe-ok").click(); await pause(a, 900);
    l = await attendus(a);
    t.ok((l.find((x) => x.nom === "Sophie ROUX") || {}).statut === "annule" && (l.find((x) => x.nom === "Paul BLANC") || {}).statut === "attendu", "visiteur retiré : annulé à l'accueil", JSON.stringify(l.map((x) => [x.nom, x.statut])));

    // Toute la journée : pas de visiteur (l'accueil attend à une heure précise).
    await a.locator("#es-perso-ajout").click(); await pause(a, 300);
    await a.locator("#pe-titre").fill("Journée de formation"); await a.locator("#pe-journee").check();
    await a.locator("#pe-visiteurs").fill("Marc DURAND");
    await a.locator("#pe-ok").click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "Indiquez l’heure du rendez-vous", "journée entière : refusé");
    await a.keyboard.press("Escape");
    t.sansErreur(a);

    // 3. L'accueil (agent de la protection) l'attend, le reçoit : Alice est prévenue.
    const AVANT = PROTECTION + `window.__perso = [{ id: "11111111-2222-4333-8444-555555555555", fid: "f1", titre: "Entretien avec un avocat", debut: "2026-11-10T21:00:00.000Z", journee: false }];
      window.__SEED.push({ collection: "securiteAttendus", id: "va1", data: { nom: "Paul BLANC", date: "2026-11-10T21:00:00.000Z", hote: "Alice MARTIN", hoteFid: "f1", objet: "Entretien avec un avocat", agendaPersoId: "11111111-2222-4333-8444-555555555555", statut: "attendu", source: "espace", fid: "f1", agent: "Alice MARTIN", at: "2026-11-10T19:00:00Z" } });`;
    const b = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", hash: "securite", avant: AVANT });
    await pause(b, 1000); await b.locator("#tab-btn-securite").click(); await pause(b, 500);
    t.contient(texte(await b.locator("#secu-attendus").innerText()), "voit Alice MARTIN", "l'accueil attend le visiteur d'Alice");
    await b.locator("#secu-attendus button", { hasText: "Arrivé" }).click(); await pause(b, 400);
    t.ok((await b.locator("#se-nom").inputValue()) === "Paul BLANC" && (await b.locator("#se-visite").inputValue()) === "Alice MARTIN", "entrée préremplie");
    await b.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(b, 1500);
    t.ok(await b.evaluate(() => window.__rpc.includes("annoncer_visiteur")), "Alice prévenue à l'arrivée");
    t.sansErreur(b);

    // 4. Rendez-vous supprimé : l'accueil n'attend plus personne.
    const c = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: AVANT });
    await pause(c, 900);
    const carteC = c.locator("#espace-main .card", { has: c.locator("h3", { hasText: /^Agenda$/ }) });
    await carteC.locator(".linkbtn", { hasText: "avocat" }).click(); await pause(c, 300);
    const sup = await c.locator("#dlg button", { hasText: "Supprimer" }).elementHandle(); await sup.click(); await pause(c, 100); await sup.click(); await pause(c, 900);
    t.egal(((await attendus(c)).find((x) => x.id === "va1") || {}).statut, "annule", "rendez-vous supprimé : visiteur annulé");

    // 5. Sans la mise à jour 50 : pas de champ.
    const s = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: "window.__sans50 = true;" });
    await pause(s, 800);
    await s.locator("#es-perso-ajout").click(); await pause(s, 300);
    t.egal(await s.locator("#pe-visiteurs").count(), 0, "sans le script : pas de visiteurs à annoncer");
    t.sansErreur(s);
  },
};
