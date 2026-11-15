// Sécurité : consigne des armes et objets déposés à l'entrée, rendus à la sortie ; sortie sans les rendre :
// « Non récupérés » dans l'onglet et dans « À traiter » de la Direction, jusqu'à ce qu'ils soient rendus.
const { ouvrir, pause, texte, lignes } = require("../outils");

const PROTECTION = `window.__SEED.find(r => r.id === "f1").data.grade = "Agent service de la protection";`;

module.exports = {
  nom: "Sécurité : consigne des armes et objets",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "securite", avant: PROTECTION });
    await pause(a, 1000); await a.locator("#tab-btn-securite").click(); await pause(a, 500);

    // 1. Entrée avec une arme de poing et un couteau.
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").fill("Hugo MARCHAND");
    await a.locator("#se-consigne-plus").click();
    await a.locator("#se-consigne .consigne-r").nth(0).locator("input").first().fill("Glock 17");
    await a.locator("#se-consigne-plus").click();
    await a.locator("#se-consigne .consigne-r").nth(1).locator("select").selectOption("blanche");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 900);
    const e = (await lignes(a, "securiteEntrees"))[0] || {};
    t.ok(JSON.stringify(e.consigne) === JSON.stringify([{ type: "poing", desc: "Glock 17", n: 1 }, { type: "blanche", desc: "", n: 1 }]), "consigne enregistrée avec l'entrée", JSON.stringify(e.consigne));
    const ticket = "C-" + e.id.slice(-4).toUpperCase();
    t.contient(texte(await a.locator("#secu-consigne-l").innerText()), `${ticket} · Hugo MARCHAND`, "liste « En consigne » avec le ticket");

    // 2. Sortie sans les rendre : demandé, puis « Non récupérés ».
    await a.locator("#secu-main li", { hasText: "Hugo MARCHAND" }).filter({ has: a.locator("button", { hasText: "Sortie" }) }).locator("button", { hasText: "Sortie" }).click(); await pause(a, 300);
    t.contient(texte(await a.locator("#dlg").innerText()), "Arme de poing (Glock 17), Arme blanche", "à la sortie : objets en consigne rappelés");
    await a.locator("#so-garder").click(); await pause(a, 800);
    const e2 = (await lignes(a, "securiteEntrees"))[0] || {};
    t.ok(!!e2.sortie && !e2.consigneRendue, "sortie notée, objets toujours en consigne");
    t.contient(texte(await a.locator("#secu-consigne-l").innerText()), "Non récupérés", "non récupérés signalés");

    // 3. Rendus plus tard.
    await a.locator("#secu-consigne-l button", { hasText: "Rendus" }).click(); await pause(a, 800);
    const e3 = (await lignes(a, "securiteEntrees"))[0] || {};
    t.ok(!!(e3.consigneRendue && e3.consigneRendue.at), "objets rendus notés");
    t.egal(await a.locator("#secu-consigne-l").count(), 0, "plus rien en consigne");

    // 4. Entrée avec consigne, sortie avec les objets rendus d'un coup.
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").fill("Lina PEREZ");
    await a.locator("#se-consigne-plus").click();
    await a.locator("#se-consigne .consigne-r select").selectOption("telephone");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 900);
    await a.locator("#secu-main li", { hasText: "Lina PEREZ" }).filter({ has: a.locator("button", { hasText: "Sortie" }) }).locator("button", { hasText: "Sortie" }).click(); await pause(a, 300);
    await a.locator("#so-rendre").click(); await pause(a, 800);
    const l = (await lignes(a, "securiteEntrees")).find((x) => x.nom === "Lina PEREZ") || {};
    t.ok(!!l.sortie && !!(l.consigneRendue && l.consigneRendue.at), "sortie et objets rendus ensemble");
    t.sansErreur(a);

    // 5. La Direction voit les objets non récupérés dans « À traiter ».
    const NR = `window.__SEED.push({ collection: "securiteEntrees", id: "en9XyZ", data: { nom: "Paul LEGRAND", motif: "livraison", arrivee: "2026-11-10T15:00:00Z", sortie: "2026-11-10T16:00:00Z", consigne: [{ type: "longue", desc: "", n: 1 }], pieceVue: true, photos: [], at: "2026-11-10T15:00:00Z" } });`;
    const d = await ouvrir(env, { hash: "dashboard", avant: NR });
    await pause(d, 1000);
    t.contient(texte(await d.locator("#todo").innerText()), "Consigne : objets non récupérés", "À traiter : objets non récupérés");
    t.sansErreur(d);
  },
};
