// Arrêtés préfectoraux : un agent RH rédige depuis un modèle (périmètre de protection), ajoute un article de la
// bibliothèque, remplit les paramètres, signe et transmet au préfet ; le préfet signe depuis sa session (À
// traiter), l'arrêté part sur Discord en images. Un autre membre de la Direction ne peut pas signer à sa place ;
// le préfet peut renvoyer un projet au rédacteur.
const { ouvrir, pause, texte, lignes } = require("../outils");

const EQUIPE = `
  window.__SEED.push({ collection: "fonctionnaires", id: "f8", data: { nom: "Mathys MARQUINA", grade: "Secrétaire général de la zone de défense et de sécurité de Paris", discordId: "916695949978525766", actif: true, at: "2026-10-10T10:00:00Z" } });
  window.__SEED.push({ collection: "fonctionnaires", id: "f9", data: { nom: "Maël BERGERON", grade: "Préfet de police", discordId: "328947555771613184", actif: true, at: "2026-10-10T10:00:00Z" } });`;
const arretes = (p) => lignes(p, "arretes");

module.exports = {
  nom: "Arrêtés préfectoraux : rédaction, double signature",
  async lancer(env, t) {
    // 1. Les RH rédigent.
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "Mathys MARQUINA", hash: "personnel", avant: EQUIPE });
    await pause(r, 900);
    await r.locator("#rh-espaces button", { hasText: "Arrêtés" }).click(); await pause(r, 400);
    await r.locator("#arr-nouveau").click(); await pause(r, 300);
    await r.locator('#arr-modeles [data-modele="perimetre"]').click(); await pause(r, 500);
    t.egal(await r.locator("#arr-numero").inputValue(), "8", "numérotation de 2026 reprise à 00008");
    t.egal(await r.locator("#arr-visas textarea").count(), 5, "visas du modèle");
    t.egal(await r.locator("#arr-prefet").inputValue(), "f9", "préfet proposé");
    t.egal(await r.locator("#arr-q-redacteur").inputValue(), "Le secrétaire général de la zone de défense et de sécurité de Paris", "qualité du rédacteur tirée de sa fiche");
    // Paramètres manquants : signature refusée.
    await r.locator("#arr-signer").click(); await pause(r, 200);
    t.contient(texte(await r.locator("#dlg .err").last().innerText()), "Complétez d’abord", "paramètres à remplir avant de signer");
    await r.locator("#arr-p-evenement").fill("le match PSG – OM");
    await r.locator("#arr-p-lieu").fill("au Parc des Princes (Paris 16e)");
    await r.locator("#arr-p-debut").fill("2026-11-21T18:00");
    await r.locator("#arr-p-fin").fill("2026-11-22T02:00");
    await r.locator("#arr-p-perimetre").fill("l’avenue du Parc des Princes, la rue Claude-Farrère et le boulevard d’Auteuil");
    await pause(r, 200);
    // Changer de modèle : les paramètres restent, visas et articles changent ; puis retour au périmètre.
    const changer = async (k) => { await r.locator("#arr-changer-modele").click(); await r.locator("#arr-changer-modele").click(); await pause(r, 300); await r.locator(`[data-modele="${k}"]`).click(); await pause(r, 500); };
    await changer("drones");
    t.ok((await r.locator("#arr-p-lieu").inputValue()) === "au Parc des Princes (Paris 16e)" && (await r.locator("#arr-visas textarea").count()) === 6 && /survol/.test(await r.locator("#arr-objet").inputValue()),
      "autre modèle : paramètres gardés, visas et objet du modèle");
    await changer("perimetre");
    // Un article de la bibliothèque : placé avant l'exécution et les voies de recours.
    await r.locator('[data-ajout="arr-articles"]').selectOption("lib:drones"); await pause(r, 300);
    const arts = await r.locator("#arr-articles textarea").evaluateAll((l) => l.map((x) => x.value));
    t.ok(arts.length === 11 && /drone/.test(arts[8]) && /exécution/.test(arts[9]), "article « drones » ajouté avant l'exécution", arts.map((x) => x.slice(0, 30)).join(" | "));
    t.contient(texte(await r.locator("#arr-manque").innerText()), "Tous les paramètres", "paramètres complets");
    await r.locator("#arr-voir-apercu").click(); await pause(r, 2500);
    t.ok((await r.locator("#arr-apercu canvas").count()) >= 2, "aperçu en pages A4");
    await r.locator("#arr-signer").click(); await pause(r, 1500);
    const a1 = (await arretes(r))[0] || {};
    t.ok(a1.statut === "a_signer" && a1.annee === 2026 && a1.numero === 8 && a1.redacteur && a1.redacteur.fid === "f8" && a1.redacteur.signeLe && a1.prefet && a1.prefet.fid === "f9" && !a1.prefet.signeLe,
      "signé par le rédacteur, transmis au préfet", JSON.stringify({ s: a1.statut, n: a1.numero, r: a1.redacteur, p: a1.prefet }).slice(0, 400));
    t.ok(/Parc des Princes/.test(a1.params && a1.params.lieu) && a1.articles.some((x) => /drone/.test(x.texte)), "paramètres et articles gardés");
    t.ok(await r.locator("#arr-pages canvas").first().isVisible({ timeout: 4000 }).catch(() => false), "fenêtre de l'arrêté : aperçu");
    t.egal(await r.locator("#arr-signer-prefet").count(), 0, "le rédacteur ne signe pas à la place du préfet");
    t.sansErreur(r);

    // 2. Un autre membre de la Direction : pas de signature pour le préfet.
    const d = await ouvrir(env, { hash: "personnel", avant: EQUIPE + `window.__SEED.push({ collection: "arretes", id: "${a1.id}", data: ${JSON.stringify(Object.assign({}, a1, { id: undefined }))} });` });
    await pause(d, 900);
    await d.locator("#rh-espaces button", { hasText: "Arrêtés" }).click(); await pause(d, 400);
    await d.locator("#arr-liste .linkbtn").first().click(); await pause(d, 600);
    t.egal(await d.locator("#arr-signer-prefet").count(), 0, "Direction : pas de « Signer » pour un autre que le préfet choisi");
    t.sansErreur(d);

    // 3. Le préfet signe depuis sa session ; publication sur Discord.
    const salons = `window.__discord = { webhooks: { entreprises: "${env.url}/__webhook/entreprises" } };`;
    const p = await ouvrir(env, { discord: "328947555771613184", nom: "Préfet de police | Maël BERGERON", hash: "dashboard",
      avant: EQUIPE + salons + `window.__SEED.push({ collection: "arretes", id: "${a1.id}", data: ${JSON.stringify(Object.assign({}, a1, { id: undefined }))} });` });
    await pause(p, 1200);
    const todo = texte(await p.locator("#todo").innerText().catch(() => ""));
    t.contient(todo, "Arrêté préfectoral à signer", "À traiter : l'arrêté attend sa signature");
    await p.locator("#todo .linkbtn", { hasText: "Arrêté préfectoral à signer" }).first().click(); await pause(p, 800);
    t.contient(texte(await p.locator("#dlg").innerText()), "Votre signature est attendue", "fenêtre de signature");
    await p.locator("#arr-signer-prefet").click(); await pause(p, 4000);
    const a2 = (await arretes(p))[0] || {};
    t.ok(a2.statut === "signe" && a2.prefet && a2.prefet.signeLe && a2.publieLe, "signé par le préfet et publié", JSON.stringify({ s: a2.statut, p: a2.prefet, pub: a2.publieLe }).slice(0, 300));
    const w = p.webhooks.find((x) => /entreprises/.test(x.url)) || { corps: "" };
    t.ok(/Arrêté préfectoral n° 2026-00008/.test(w.corps) && /arrete-2026-00008-page-1\.jpg/.test(w.corps), "Discord : message et pages en images", w.corps.slice(0, 300));
    const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("#arr-pdf").click()]);
    t.egal(dl.suggestedFilename(), "arrete-2026-00008.pdf", "PDF de l'arrêté signé");
    t.contient(texte(await p.locator("#dlg").innerText()), "à l’occasion du match PSG – OM", "« de le » contracté en « du »");
    t.sansErreur(p);

    // 4. Le préfet renvoie un autre projet au rédacteur, avec ce qu'il faut revoir.
    const a3 = Object.assign({}, a1, { id: undefined, numero: 9 });
    const q = await ouvrir(env, { discord: "328947555771613184", nom: "Préfet de police | Maël BERGERON", hash: "personnel", avant: EQUIPE + `window.__SEED.push({ collection: "arretes", id: "ar9", data: ${JSON.stringify(a3)} });` });
    await pause(q, 900);
    await q.locator("#rh-espaces button", { hasText: "Arrêtés" }).click(); await pause(q, 400);
    await q.locator("#arr-a-moi .linkbtn").click(); await pause(q, 600);
    await q.locator("#arr-renvoyer").click(); await q.locator("#arr-renvoi-motif").fill("Préciser les voies fermées à l’article 1er."); await q.locator("#arr-renvoi-motif-ok").click(); await pause(q, 1000);
    const a4 = (await arretes(q)).find((x) => x.id === "ar9") || {};
    t.ok(a4.statut === "brouillon" && a4.renvoi && /voies fermées/.test(a4.renvoi.motif) && !a4.redacteur.signeLe, "renvoyé au rédacteur, sa signature retirée", JSON.stringify(a4.renvoi));
    t.sansErreur(q);
  },
};
