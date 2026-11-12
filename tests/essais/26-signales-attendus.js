// Sécurité, mise à jour 42 : personnes signalées (alerte à l'entrée, par le nom ou le numéro), visiteurs
// attendus (depuis l'onglet ou un rendez-vous de l'agenda, personne visitée prévenue), sorties oubliées
// (bandeau, « Tout clore », À traiter de la Direction), main courante de fin de service.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const grades = (a, b) => `window.__SEED.find(r => r.id === "f1").data.grade = "${a}"; window.__SEED.find(r => r.id === "f2").data.grade = "${b}";`;
const PROTECTION = grades("Agent service de la protection", "Responsable service de la protection");
// Une entrée de 15 h (heure de Paris : 16 h) sans sortie, à 21 h 30 : oubliée.
const OUBLI = `window.__SEED.push({ collection: "securiteEntrees", id: "eo1", data: { nom: "Paul LEGRAND", qualite: "Livreur", motif: "livraison", arrivee: "2026-11-10T15:00:00Z", pieceVue: true, photos: [], agent: "Alice MARTIN", at: "2026-11-10T15:00:00Z" } });`;
const SIGNALE = `window.__SEED.push({ collection: "securiteSignalements", id: "sg1", data: { nom: "Marc VIDAL", numero: "X4RT8BN12", motif: "interdit", consigne: "Refuser l'entrée et prévenir la Direction.", actif: true, agent: "Bruno LEROY", at: "2026-11-09T20:00:00Z", photos: [] } });`;

module.exports = {
  nom: "Sécurité : personnes signalées, visiteurs attendus, sorties oubliées, main courante",
  async lancer(env, t) {
    // 1. Responsable de la protection.
    const r = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", hash: "securite", avant: PROTECTION + OUBLI });
    await pause(r, 1000); await r.locator("#tab-btn-securite").click(); await pause(r, 500);
    let txt = texte(await r.locator("#secu-main").innerText());
    t.ok(/1 personne notée dans les locaux depuis plus de 3 h/.test(txt) && /Depuis plus de 3 h/.test(txt), "sortie oubliée : bandeau et pastille", txt.slice(0, 300));

    // Signaler une personne.
    await r.locator("#secu-main .seg button", { hasText: "Signalés" }).click(); await pause(r, 300);
    await r.locator("#secu-signaler").click(); await pause(r, 300);
    await r.locator("#ss-nom").fill("Marc VIDAL");
    await r.locator("#ss-numero").fill("X4RT8BN12");
    await r.locator("#ss-consigne").fill("Refuser l'entrée et prévenir la Direction.");
    await r.locator("#dlg button", { hasText: "Signaler" }).click(); await pause(r, 900);
    const sg = (await lignes(r, "securiteSignalements"))[0] || {};
    t.ok(sg.nom === "Marc VIDAL" && sg.motif === "interdit" && sg.actif === true && sg.agent === "Bruno LEROY", "signalement enregistré", JSON.stringify(sg).slice(0, 200));
    t.contient(texte(await r.locator("#secu-signales").innerText()), "Interdit d’entrée", "liste des signalés");

    // Entrée de la personne signalée : alerte, puis second clic pour passer outre.
    await r.locator("#secu-entree").click(); await pause(r, 300);
    await r.locator("#se-nom").fill("Marc Vidal"); await pause(r, 200);
    t.contient(texte(await r.locator("#dlg .secu-signal").innerText()), "Interdit d’entrée : Marc VIDAL", "alerte au nom (autre casse)");
    await r.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(r, 300);
    t.ok((await r.locator("#dlg button", { hasText: "Interdit d’entrée : enregistrer quand même" }).count()) === 1 && !(await lignes(r, "securiteEntrees")).some((e) => e.nom === "Marc Vidal"), "premier clic : rien d'enregistré");
    await r.locator("#dlg button", { hasText: "enregistrer quand même" }).click(); await pause(r, 900);
    t.ok((await lignes(r, "securiteEntrees")).some((e) => e.nom === "Marc Vidal"), "second clic : entrée notée");
    // Même numéro sous un autre nom : alerte aussi.
    await r.locator("#secu-controle").click(); await pause(r, 300);
    await r.locator("#sc-nom").fill("Marco VIDALI");
    await r.locator("#sc-numero").fill("x4rt 8bn12"); await pause(r, 200);
    t.ok(await r.locator("#dlg .secu-signal").isVisible(), "alerte par le numéro de la pièce");
    await r.locator("#dlg button", { hasText: "Annuler" }).click(); await pause(r, 300);

    // Visiteur attendu : annoncé, puis arrivé ; Alice est prévenue.
    await r.locator("#secu-main .seg button", { hasText: "Entrées" }).click(); await pause(r, 300);
    await r.locator("#secu-attendu").click(); await pause(r, 300);
    await r.locator("#sa-nom").fill("Claire DUVAL");
    await r.locator("#sa-qualite").fill("Avocate");
    await r.locator("#sa-hote").fill("Alice MARTIN"); await pause(r, 100);
    t.contient(texte(await r.locator("#dlg").innerText()), "Alice MARTIN sera prévenu(e)", "hôte reconnu dans l'annuaire");
    await r.locator("#dlg button", { hasText: "Annoncer le visiteur" }).click(); await pause(r, 900);
    t.contient(texte(await r.locator("#secu-attendus").innerText()), "Claire DUVAL · Avocate", "liste des visiteurs attendus");
    await r.locator("#secu-attendus button", { hasText: "Arrivé" }).click(); await pause(r, 400);
    t.ok((await r.locator("#se-nom").inputValue()) === "Claire DUVAL" && (await r.locator("#se-visite").inputValue()) === "Alice MARTIN", "entrée préremplie depuis la visite");
    await r.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(r, 1500);
    const att = (await lignes(r, "securiteAttendus"))[0] || {};
    t.ok(att.statut === "arrive" && !!att.entree && att.hoteFid === "f1", "visite close à l'arrivée", JSON.stringify(att).slice(0, 220));
    t.ok(await r.evaluate(() => window.__rpc.includes("annoncer_visiteur")) && (await lignes(r, "messagesAgents")).some((m) => m.fid === "f1" && /Claire DUVAL/.test(m.texte)), "Alice prévenue dans son espace");

    // Tout clore : deux clics.
    await r.locator("#secu-clore").click(); await pause(r, 200);
    await r.locator("#secu-clore").click(); await pause(r, 1200);
    const eo = (await lignes(r, "securiteEntrees")).find((e) => e.id === "eo1") || {};
    t.ok(!!eo.sortie && eo.sortieOubliee === true, "entrée oubliée close");
    t.egal(await r.locator(".secu-bandeau").count(), 0, "bandeau parti");

    // Main courante : image, puis remise comme rapport.
    await r.locator("#secu-courante").click(); await pause(r, 300);
    t.contient(texte(await r.locator("#dlg").innerText()), "contrôle", "résumé de la période");
    await r.locator("#dlg button", { hasText: "Voir l’image" }).click(); await pause(r, 1500);
    t.ok(await r.locator("#dlg img.avis-preview").count() === 1, "main courante en image");
    await r.locator("#dlg button", { hasText: "Retour au dossier" }).click(); await pause(r, 300);
    await r.locator("#dlg button", { hasText: "Remettre comme rapport" }).click(); await pause(r, 900);
    const mc = (await lignes(r, "securiteRapports")).find((x) => x.type === "main_courante") || {};
    t.ok(/Entrée de Claire DUVAL/.test(mc.recit || "") && /Sortie de Paul LEGRAND/.test(mc.recit || ""), "rapport de main courante", (mc.recit || "").slice(0, 300));
    t.sansErreur(r);

    // 2. Agent : voit le signalement et l'alerte, sans pouvoir signaler ni tout clore.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "securite", avant: PROTECTION + OUBLI + SIGNALE });
    await pause(a, 1000); await a.locator("#tab-btn-securite").click(); await pause(a, 500);
    t.ok(await a.locator(".secu-bandeau").isVisible() && await a.locator("#secu-clore").count() === 0, "agent : bandeau sans « Tout clore »");
    await a.locator("#secu-main .seg button", { hasText: "Signalés" }).click(); await pause(a, 300);
    t.ok(/Marc VIDAL/.test(texte(await a.locator("#secu-main").innerText())) && await a.locator("#secu-signaler").count() === 1, "agent : liste et bouton pour signaler");
    // Le signalement d'un autre : ni modifier, ni lever, ni supprimer.
    await a.locator("#secu-signales .linkbtn", { hasText: "Marc VIDAL" }).click(); await pause(a, 300);
    t.egal(await a.locator("#dlg button", { hasText: /Modifier|Lever le signalement|Supprimer/ }).count(), 0, "agent : signalement d'un autre en lecture");
    await a.keyboard.press("Escape"); await pause(a, 200);
    // Il signale lui-même une personne.
    await a.locator("#secu-signaler").click(); await pause(a, 300);
    await a.locator("#ss-nom").fill("Léo MARCHAND"); await a.locator("#ss-motif").selectOption("autre");
    await a.locator("#ss-consigne").fill("Comportement agressif à l'accueil, à surveiller.");
    await a.locator("#dlg button", { hasText: "Signaler" }).click(); await pause(a, 900);
    const sa = (await lignes(a, "securiteSignalements")).find((x) => x.nom === "Léo MARCHAND") || {};
    t.ok(sa.fid === "f1" && sa.agent === "Alice MARTIN" && sa.actif === true, "agent : signalement enregistré à son nom", JSON.stringify(sa).slice(0, 160));
    await a.locator("#secu-signales .linkbtn", { hasText: "Léo MARCHAND" }).click(); await pause(a, 300);
    t.ok(await a.locator("#dlg button", { hasText: "Modifier" }).count() === 1 && await a.locator("#dlg button", { hasText: "Lever le signalement" }).count() === 0, "agent : modifie le sien, sans le lever");
    await a.keyboard.press("Escape"); await pause(a, 200);
    await a.locator("#secu-controle").click(); await pause(a, 300);
    await a.locator("#sc-nom").fill("VIDAL Marc"); await pause(a, 200);
    t.ok(await a.locator("#dlg .secu-signal").isVisible(), "agent : alerte au contrôle");
    t.sansErreur(a);

    // 3. Direction : À traiter, et visiteurs d'un rendez-vous de l'agenda.
    const d = await ouvrir(env, { hash: "dashboard", avant: OUBLI });
    await pause(d, 1200);
    t.contient(texte(await d.locator("#todo").innerText()), "Sortie oubliée au registre des entrées", "À traiter : sortie oubliée");
    await onglet(d, "personnel");
    await d.locator("#rh-espaces button", { hasText: "Agenda" }).click(); await pause(d, 400);
    await d.locator("#rh-agenda button", { hasText: "Nouveau rendez-vous" }).click(); await pause(d, 300);
    await d.locator("#ev-titre").fill("Rendez-vous avec le notaire"); await d.locator("#ev-date").fill("2026-11-12");
    await d.locator("#ev-aud").selectOption("encadrement");
    await d.locator("#ev-visiteurs").fill("Hélène ROUX, Yves PETIT");
    await d.locator("#dlg button", { hasText: "Ajouter à l’agenda" }).click(); await pause(d, 1200);
    let at = await lignes(d, "securiteAttendus");
    const ev = (await lignes(d, "agenda")).find((e) => e.titre === "Rendez-vous avec le notaire") || {};
    t.ok(at.length === 2 && at.every((x) => x.agendaId === ev.id && x.statut === "attendu" && x.hoteFid === "f4" && x.source === "agenda"), "deux visiteurs attendus, liés au rendez-vous", JSON.stringify(at).slice(0, 300));
    // Rendez-vous annulé : visites annulées.
    await d.locator("#rh-agenda").getByText("Rendez-vous avec le notaire").first().click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Annuler le rendez-vous" }).click(); await pause(d, 200);
    await d.locator("#dlg button", { hasText: "Confirmer l’annulation" }).click(); await pause(d, 1200);
    at = await lignes(d, "securiteAttendus");
    t.ok(at.length === 2 && at.every((x) => x.statut === "annule"), "rendez-vous annulé : visites annulées");
    t.sansErreur(d);
  },
};
