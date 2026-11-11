// Échéances du personnel : fin de période d'essai (durée lue dans le contrat), fin de CDD, objectifs ;
// décision sur l'essai (concluant ou prolongé) gardée sur la fiche.
const { ouvrir, pause, texte, lignes } = require("../outils");

const SEED = `window.__SEED.push(
  { collection: "contratsTravail", id: "c2", data: { fid: "f2", nom: "Bruno LEROY", ref: "CT-BRU", type: "CDD", fin: "2026-11-14", priseFonctions: "2026-11-08", essai: "deux semaines", statut: "signe", at: "2026-11-08T10:00:00Z" } },
  { collection: "contratsTravail", id: "c4", data: { fid: "f4", nom: "Directeur Test", ref: "CT-DIR", type: "CDI", priseFonctions: "2026-10-30", essai: "15 jours", statut: "a_signer", at: "2026-10-30T10:00:00Z" } },
  { collection: "entretiens", id: "en9", data: { fid: "f2", nom: "Bruno LEROY", type: "suivi", date: "2026-11-01", statut: "partage", objectifs: [{ id: "o1", texte: "Saisir les relevés de la semaine", echeance: "2026-11-12", etat: "en_cours" }], at: "2026-11-01T10:00:00Z" } });`;

module.exports = {
  nom: "Échéances du personnel",
  async lancer(env, t) {
    const d = await ouvrir(env, { avant: SEED });
    const todo = texte(await d.locator("#todo-card").innerText());
    t.ok(/Fins de période d’essai ou de CDD/.test(todo) && /Alice MARTIN : essai terminé/.test(todo), "« À traiter » : fins d'essai et de CDD", todo.slice(0, 300));
    await d.locator("#todo .linkbtn", { hasText: "période d’essai" }).click(); await pause(d, 600);
    t.ok(await d.locator("#rh-bord").isVisible(), "le lien ouvre le tableau de bord du personnel");
    const bord = texte(await d.locator("#rh-bord").innerText());
    t.contient(bord, "Fin de la période d’essai de Alice MARTIN : terminée depuis 24 jours : à confirmer", "essai d'une semaine terminé, sans décision");
    t.contient(bord, "Fin de la période d’essai de Directeur Test : dans 4 jours", "essai de « 15 jours » compté depuis la prise de fonctions");
    t.contient(bord, "Fin du CDD de Bruno LEROY : dans 4 jours", "fin de CDD dans la semaine");
    t.ok(!/période d’essai de Bruno/.test(bord), "essai de « deux semaines » pas encore dans la fenêtre");
    t.contient(bord, "1 objectif à échéance dans les 7 jours", "objectif à échéance");

    // Décision : essai concluant.
    await d.locator("#rh-bord .linkbtn", { hasText: "Alice MARTIN" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Une semaine", "la fenêtre rappelle la durée au contrat");
    await d.locator("#dlg button", { hasText: "Essai concluant" }).click(); await pause(d, 600);
    const f1 = (await lignes(d, "fonctionnaires")).find((f) => f.id === "f1");
    t.ok(f1 && f1.essai && f1.essai.statut === "concluant" && f1.essai.par, "décision gardée sur la fiche", JSON.stringify(f1 && f1.essai));
    t.contient(texte(await d.locator("#dlg").innerText()), "Période d’essai concluante", "la fiche affiche l'essai concluant");
    await d.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(d, 400);
    t.ok(!/Alice MARTIN/.test(texte(await d.locator("#rh-bord").innerText()).split("À surveiller")[1] || ""), "plus d'alerte pour Alice");

    // Prolongation au-delà de la semaine : l'alerte s'arrête, la fiche dit la nouvelle date.
    await d.locator("#rh-bord .linkbtn", { hasText: "Directeur Test" }).click(); await pause(d, 400);
    await d.locator("#es-prolonge").fill("2026-11-25");
    await d.locator("#dlg button", { hasText: "Prolonger" }).click(); await pause(d, 600);
    t.contient(texte(await d.locator("#dlg").innerText()), "prolongée jusqu’au", "la fiche dit la prolongation");
    t.sansErreur(d);

    // RH : mêmes échéances dans son tableau de bord.
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel", avant: SEED });
    await r.locator("#rh-espaces button", { hasText: "Tableau de bord" }).click(); await pause(r, 400);
    t.contient(texte(await r.locator("#rh-bord").innerText()), "Fin du CDD de Bruno LEROY", "RH : les échéances aussi");
    t.sansErreur(r);
  },
};
