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

    // Lundi 16 novembre au soir : classement et bilan du personnel de la semaine 46, une seule fois.
    const salons = `window.__discord = { webhooks: { agents: "${env.url}/__webhook/agents", direction: "${env.url}/__webhook/direction" } };`;
    const lundi = "2026-11-16T19:00:00Z";
    const g = await ouvrir(env, { maintenant: lundi, avant: salons });
    t.egal(g.webhooks.filter((w) => w.url.includes("/agents")).length, 0, "pas de classement tant qu'il manque des heures");
    const h = await ouvrir(env, { maintenant: lundi, avant: salons + tout });
    await pause(h, 1500);
    const posts = h.webhooks.filter((w) => w.url.includes("/agents"));
    t.egal(posts.length, 1, "classement publié une fois au salon des agents");
    const corps = (posts[0] || {}).corps || "";
    t.contient(corps, "Bilan du personnel · semaine 46", "avec le bilan du personnel");
    t.contient(corps, "Podium", "et le podium");
    t.ok(/files\[0\]/.test(corps) && /classement/i.test(corps), "l'image du classement est jointe", corps.slice(0, 200));
    const meta = await h.evaluate(() => (window.__rows.get("meta/classement") || {}).data || null);
    t.egal(meta && meta.semaine, "2026-S46", "la publication est notée (meta/classement)");
    t.sansErreur(h);
    // Déjà publié, ou publication décochée : rien.
    const deja = 'window.__SEED.push({ collection: "meta", id: "classement", data: { semaine: "2026-S46", at: "2026-11-16T18:00:00Z" } });';
    const i = await ouvrir(env, { maintenant: lundi, avant: salons + tout + deja });
    t.egal(i.webhooks.filter((w) => w.url.includes("/agents")).map((w) => w.corps.slice(0, 80)), [], "pas de seconde publication");
    const j = await ouvrir(env, { maintenant: lundi, avant: salons.replace("} };", "}, auto: { classement: false } };") + tout });
    t.egal(j.webhooks.filter((w) => w.url.includes("/agents")).length, 0, "rien si la publication automatique est décochée");
  },
};
