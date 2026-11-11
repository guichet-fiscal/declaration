// Annuaire de l'équipe : encadrement d'abord, recherche, lien Discord ; dans Mon espace et Personnel.
const { ouvrir, onglet, pause, texte } = require("../outils");

const roles = 'window.__roles = { "999999999999999999": "direction", "916695949978525766": "rh" };';

module.exports = {
  nom: "Annuaire de l'équipe",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: roles });
    const carte = a.locator("#espace-main .card", { has: a.locator("h3", { hasText: "Annuaire" }) });
    t.contient(texte(await carte.innerText()), "Direction", "l'encadrement apparaît dans la carte");
    await a.locator("#es-annuaire").click(); await pause(a, 300);
    const tout = texte(await a.locator("#dlg").innerText());
    t.contient(tout, "Alice MARTIN (vous)", "l'agent se repère dans l'annuaire");
    t.contient(tout, "Bruno LEROY", "toute l'équipe est listée");
    await a.locator("#annu-dlg-q").fill("leroy"); await pause(a, 200);
    t.ok(!texte(await a.locator("#dlg").innerText()).includes("Alice MARTIN"), "la recherche filtre");
    t.ok((await a.locator('#dlg a[href^="https://discord.com/users/"]').count()) >= 1, "lien vers le profil Discord");
    t.sansErreur(a);
    const d = await ouvrir(env, { hash: "personnel", avant: roles });
    await d.locator("#rh-espaces button", { hasText: "Annuaire" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#rh-annuaire").innerText()), "fonctionnaire", "Personnel : rubrique Annuaire");
    t.sansErreur(d);
    const x = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", avant: "window.__sans36 = true;" });
    t.egal(await x.locator("#es-annuaire").count(), 0, "sans le script 36 : pas d'annuaire dans l'espace");
  },
};
