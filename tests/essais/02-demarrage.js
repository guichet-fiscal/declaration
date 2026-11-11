// Chaque rôle ouvre le guichet sans erreur, et chaque onglet qu'il voit s'affiche sans erreur.
const { ouvrir, pause, texte } = require("../outils");

const COMPTES = [
  ["direction", "999999999999999999", "Directeur Test"],
  ["inspecteur", "333333333333333333", "Inspecteur Test"],
  ["lecture", "444444444444444444", "Lecture Test"],
  ["rh", "916695949978525766", "RH Test"],
  ["agent", "111111111111111111", "Alice"],
];

module.exports = {
  nom: "Démarrage et onglets de chaque rôle",
  async lancer(env, t) {
    for (const [role, discord, nom] of COMPTES) {
      const p = await ouvrir(env, { role, discord, nom });
      t.ok(await p.locator("#gate").isHidden(), `${role} : le guichet s'ouvre`);
      const onglets = await p.$$eval(".tab", (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.tab));
      t.ok(onglets.length > 0, `${role} : au moins un onglet`, JSON.stringify(onglets));
      const lents = [];
      for (const o of onglets) {
        const t0 = Date.now();
        const grp = await p.locator(`#tab-btn-${o}`).getAttribute("data-grp");
        if (grp && !(await p.locator(`#tab-btn-${o}`).isVisible())) await p.locator(`#grp-${grp}`).click({ timeout: 2000 }).catch(() => {});
        // Un rôle à un seul onglet n'a pas de barre d'onglets : le panneau est déjà ouvert.
        await p.locator(`#tab-btn-${o}`).click({ timeout: 2000 }).catch(() => {});
        await pause(p, 300);
        if (!(await p.locator(`#tab-${o}`).isVisible())) lents.push(o);
        if (Date.now() - t0 > 4000) lents.push(o + " (lent)");
      }
      t.egal(lents, [], `${role} : chaque onglet s'ouvre`);
      t.sansErreur(p, `${role} : aucun onglet en erreur (${onglets.join(", ")})`);
      if (role === "agent") t.egal(onglets, ["espace"], "agent : seul l'onglet Mon espace");
      if (role === "rh") t.ok(onglets.includes("personnel") && !onglets.includes("payes"), "RH : Personnel sans les payes");
      if (role === "direction") t.ok(onglets.length >= 10, "Direction : tous les onglets", String(onglets.length));
    }
    // Compte sans fiche ni rôle : refusé avec une explication.
    const z = await ouvrir(env, { role: "agent", discord: "555555555555555555", nom: "Inconnu" });
    t.ok(texte(await z.locator("#gate").innerText()).length > 20, "compte inconnu : message d'accès refusé");
  },
};
