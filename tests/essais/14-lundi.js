// Le lundi : heures de la semaine passée à saisir (liste « À traiter » de la Direction), et
// publication automatique du classement et du bilan du personnel sur Discord.
const { ouvrir, pause, texte } = require("../outils");

module.exports = {
  nom: "Lundi : heures à saisir et classement publié",
  async lancer(env, t) {
    // Mardi 17 novembre : la semaine 46 (tablette) n'est pas versée, Directeur Test n'a pas d'heures.
    const d = await ouvrir(env, { maintenant: "2026-11-17T10:00:00Z" });
    const todo = texte(await d.locator("#todo-card").innerText().catch(() => ""));
    t.contient(todo, "Heures de la semaine 46 à saisir", "la Direction voit les heures à saisir");
    t.contient(todo, "Directeur Test", "avec le nom de l'agent sans heures");
    t.ok(!/Alice|Bruno/.test(todo.split("à saisir")[1] || ""), "les agents déjà saisis n'y sont pas");
    await d.locator("#todo .linkbtn", { hasText: "Heures de la semaine 46" }).click(); await pause(d, 600);
    t.ok(await d.locator("#tab-payes").isVisible(), "le lien ouvre les payes");
    t.sansErreur(d);
    // Toutes les heures saisies : plus rien à signaler.
    const tout = 'window.__SEED.find(r => r.id === "2026-S46").data.saisie.f4 = { heures: 0 };';
    const e = await ouvrir(env, { maintenant: "2026-11-17T10:00:00Z", avant: tout });
    t.ok(!texte(await e.locator("#todo-card").innerText().catch(() => "")).includes("à saisir"), "plus d'alerte quand chacun a ses heures (0 compris)");
    // Semaine de la pointeuse : jamais d'alerte.
    const f = await ouvrir(env, {});
    t.ok(!texte(await f.locator("#todo-card").innerText().catch(() => "")).includes("Heures de la semaine"), "pas d'alerte pour une semaine de la pointeuse");
  },
};
