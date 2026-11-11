// Onglet Personnel de l'encadrement : messagerie, agenda, absences, notes de service, droits par rôle,
// et sanctions de la Direction visibles dans son propre espace.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Personnel : messagerie, agenda, absences, notes",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel" });
    await d.locator("#rh-espaces button", { hasText: "Messagerie" }).click(); await pause(d, 400);
    await d.locator("#rh-fil textarea").fill("Bonsoir Bruno, je vérifie vos heures."); await d.locator("#rh-fil .fil-ecrire button").click(); await pause(d, 800);
    t.ok((await lignes(d, "messagesAgents")).some((m) => m.de === "equipe" && m.fid === "f2"), "réponse envoyée à Bruno");
    t.egal((await lignes(d, "messagesAgents")).find((m) => m.id === "m2").luEquipe, true, "message de Bruno marqué lu");

    await d.locator("#rh-espaces button", { hasText: "Agenda" }).click(); await pause(d, 400);
    await d.locator("#rh-agenda button", { hasText: "Nouveau rendez-vous" }).click(); await pause(d, 300);
    await d.locator("#ev-titre").fill("Formation tablette"); await d.locator("#ev-type").selectOption("formation"); await d.locator("#ev-date").fill("2026-11-18");
    await d.locator("#ev-aud").selectOption("agents"); await d.locator(".ev-inv", { hasText: "Bruno LEROY" }).locator("input").check();
    await d.locator("#dlg button", { hasText: "Ajouter à l’agenda" }).click(); await pause(d, 600);
    const ev = (await lignes(d, "agenda")).find((e) => e.titre === "Formation tablette");
    t.egal(ev && ev.participants, ["f2"], "rendez-vous créé pour Bruno seul");

    await d.locator("#rh-espaces button", { hasText: "Absences" }).click(); await pause(d, 300);
    await d.locator("#rh-absences button", { hasText: "Prendre en compte" }).first().click(); await pause(d, 500);
    t.egal((await lignes(d, "absences")).find((a) => a.id === "a1").statut, "prise_en_compte", "absence prise en compte");

    await d.locator("#rh-espaces button", { hasText: "Notes de service" }).click(); await pause(d, 300);
    await d.locator("#rh-notes button", { hasText: "Nouvelle note" }).click(); await pause(d, 300);
    await d.locator("#ns-titre").fill("Tenue de service"); await d.locator("#ns-texte").fill("La tenue est obligatoire."); await d.locator("#dlg button", { hasText: "Publier la note" }).click(); await pause(d, 500);
    t.ok((await lignes(d, "notesService")).some((n) => n.titre === "Tenue de service"), "note de service publiée");
    t.sansErreur(d, "Direction : aucune erreur");

    // Droits : les RH publient des notes, l'Inspection non.
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel" });
    await r.locator("#rh-espaces button", { hasText: "Notes de service" }).click(); await pause(r, 300);
    t.egal(await r.locator("#rh-notes button", { hasText: "Nouvelle note" }).count(), 1, "RH : peut publier une note");
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", hash: "personnel" });
    await i.locator("#rh-espaces button", { hasText: "Notes de service" }).click(); await pause(i, 300);
    t.egal(await i.locator("#rh-notes button", { hasText: "Nouvelle note" }).count(), 0, "Inspection : ne publie pas de note");
    t.sansErreur(r, "RH : aucune erreur"); t.sansErreur(i, "Inspection : aucune erreur");

    // La Direction voit ses propres sanctions dans Mon espace.
    const s = await ouvrir(env, { avant: 'window.__SEED.push({ collection: "sanctions", id: "s4", data: { fid: "f4", nom: "Directeur Test", type: "avertissement", statut: "vigueur", motif: "Retard", at: "2026-11-10T19:00:00Z" } });' });
    await onglet(s, "espace");
    t.contient(texte(await s.locator("#espace-main").innerText()), "Mes sanctions", "Direction : ses sanctions dans Mon espace");
  },
};
