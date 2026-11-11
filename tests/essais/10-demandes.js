// Demandes des agents : envoi, annulation, réponse de l'encadrement, congé accepté inscrit en absence.
const { ouvrir, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Demandes des agents",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    const carte = a.locator("#espace-main .card", { has: a.locator("h3", { hasText: "Mes demandes" }) });
    t.contient(texte(await carte.innerText()), "Aucune demande", "carte « Mes demandes » vide");
    await a.locator("#es-dag-ajout").click(); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "Envoyer la demande" }).click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "objet", "objet obligatoire");
    await a.locator("#dag-objet").fill("Congé de fin d’année"); await a.locator("#dag-du").fill("2026-12-24"); await a.locator("#dag-au").fill("2026-12-20");
    await a.locator("#dlg button", { hasText: "Envoyer la demande" }).click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "dates", "dates du congé vérifiées");
    await a.locator("#dag-au").fill("2026-12-26"); await a.locator("#dag-motif").fill("Fêtes en famille.");
    await a.locator("#dlg button", { hasText: "Envoyer la demande" }).click(); await pause(a, 900);
    t.ok((await lignes(a, "demandesAgents")).some((d) => d.type === "conge" && d.du === "2026-12-24" && d.statut === "envoyee"), "demande de congé envoyée");
    // Une deuxième, annulée.
    await a.locator("#es-dag-ajout").click(); await pause(a, 300);
    await a.locator("#dag-type").selectOption("document"); t.ok(await a.locator("#dag-du").isHidden(), "pas de dates pour un document");
    await a.locator("#dag-objet").fill("Attestation d’emploi"); await a.locator("#dlg button", { hasText: "Envoyer la demande" }).click(); await pause(a, 900);
    const ann = await carte.locator("li", { hasText: "Attestation" }).locator("button", { hasText: "Annuler" }).elementHandle();
    await ann.click(); await pause(a, 100); await ann.click(); await pause(a, 900);
    t.egal((await lignes(a, "demandesAgents")).find((d) => d.objet === "Attestation d’emploi").statut, "annulee", "demande annulée par l'agent");
    t.sansErreur(a);
    // L'encadrement répond (même registre que l'agent).
    const etat = await a.evaluate(() => JSON.stringify([...window.__rows.values()].filter((r) => r.collection === "demandesAgents")));
    const d = await ouvrir(env, { hash: "personnel", avant: `window.__SEED.push(...${etat});` });
    await d.locator("#rh-espaces button", { hasText: "Demandes" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#rh-demandes").innerText()), "En attente (1)", "une demande en attente");
    await d.locator("#rh-demandes button", { hasText: "Répondre" }).click(); await pause(d, 300);
    await d.locator("#dlg button", { hasText: "Refuser" }).click(); await pause(d, 200);
    t.contient(texte(await d.locator("#dlg .err").innerText()), "Expliquez", "un refus demande une explication");
    await d.locator("#dag-rep").fill("Accordé, bonnes fêtes."); await d.locator("#dlg button", { hasText: "Accepter" }).click(); await pause(d, 900);
    const dem = (await lignes(d, "demandesAgents")).find((x) => x.type === "conge");
    t.ok(dem.statut === "acceptee" && dem.reponse === "Accordé, bonnes fêtes." && dem.absence, "demande acceptée avec la réponse");
    const abs = (await lignes(d, "absences")).find((x) => x.demande === dem.id);
    t.ok(abs && abs.du === "2026-12-24" && abs.au === "2026-12-26" && abs.statut === "prise_en_compte", "congé inscrit dans les absences");
    t.sansErreur(d);
    // Sans le script 36.
    const x = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", avant: "window.__sans36 = true;" });
    t.contient(texte(await x.locator("#espace-main").innerText()), "mise à jour 36", "sans le script 36 : la carte l'explique");
    t.egal(await x.locator("#es-dag-ajout").count(), 0, "sans le script 36 : pas de bouton");
  },
};
