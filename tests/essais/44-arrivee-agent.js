// Personnel : dossier d'arrivée d'un agent (grade du barème, Discord, contrat signé, photo, carte remise) sur
// sa fiche, vue « Arrivée incomplète » et point « À surveiller » du tableau de bord.
const { ouvrir, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Personnel : dossier d'arrivée d'un agent",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel" });
    await pause(d, 1200);
    // Vue « Arrivée incomplète ».
    await d.locator("#rh-seg button", { hasText: "Arrivée incomplète" }).click(); await pause(d, 300);
    const l = texte(await d.locator("#rh-list").innerText());
    t.ok(/Alice MARTIN/.test(l) && /À faire : .*carte/.test(l), "vue « Arrivée incomplète » avec ce qui manque", l.slice(0, 300));

    // Fiche : la liste, puis « Marquer remise » pour la carte.
    await d.locator("#rh-list .linkbtn", { hasText: "Alice MARTIN" }).first().click(); await pause(d, 400);
    const a = texte(await d.locator("#ag-arrivee").innerText());
    t.ok(/Compte Discord sur la fiche/.test(a) && /Contrat de travail signé/.test(a) && /Carte professionnelle remise · à télécharger/.test(a), "fiche : liste d'arrivée", a.slice(0, 400));
    await d.locator("#ag-carte-remise").click(); await pause(d, 700);
    const f1 = (await lignes(d, "fonctionnaires")).find((x) => x.id === "f1") || {};
    t.ok(!!f1.carteRemiseLe, "carte notée remise sur la fiche");
    t.ok(/Carte professionnelle remise · le /.test(texte(await d.locator("#ag-arrivee").innerText())), "la carte passe en « fait »");
    t.sansErreur(d);
  },
};
