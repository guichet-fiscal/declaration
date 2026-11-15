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

    // 5. Arme à ne pas rendre, dès l'entrée : retenue avec un motif, pas proposée à la sortie.
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").fill("Marc DURAND");
    await a.locator("#se-consigne-plus").click();
    await a.locator("#se-consigne .consigne-r").nth(0).locator("input").first().fill("AK-47");
    await a.locator("#se-consigne .consigne-r").nth(0).locator("select").selectOption("longue");
    await a.locator("#se-consigne .consigne-ret-cb").check();
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 300);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "pourquoi l’objet ne sera pas rendu", "motif obligatoire pour retenir");
    await a.locator("#se-consigne .consigne-ret-motif").fill("Arme de guerre sans autorisation");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 900);
    const m = (await lignes(a, "securiteEntrees")).find((x) => x.nom === "Marc DURAND") || {};
    t.ok(m.consigne && m.consigne[0].retenu && m.consigne[0].retenu.motif === "Arme de guerre sans autorisation" && !!m.consigne[0].retenu.par, "objet retenu enregistré", JSON.stringify(m.consigne));
    t.contient(texte(await a.locator("#secu-retenus-l").innerText()), "Arme longue (AK-47), motif : Arme de guerre sans autorisation", "liste « Objets retenus »");
    await a.locator("#secu-main li", { hasText: "Marc DURAND" }).filter({ has: a.locator("button", { hasText: "Sortie" }) }).locator("button", { hasText: "Sortie" }).click(); await pause(a, 800);
    const m2 = (await lignes(a, "securiteEntrees")).find((x) => x.nom === "Marc DURAND") || {};
    t.ok(!!m2.sortie && !m2.consigneRendue, "sortie sans proposer de rendre l'objet retenu");
    t.ok(!/Marc DURAND/.test(texte(await a.locator("#secu-consigne-l").innerText().catch(() => ""))), "pas « non récupéré » : il est retenu");
    await a.locator("#secu-retenus-l button", { hasText: "Remise" }).click(); await pause(a, 300);
    await a.locator("#sm-qui").selectOption("police"); await a.locator("#sm-note").fill("Pris en charge par la BAC");
    await a.locator("#sm-ok").click(); await pause(a, 800);
    const m3 = (await lignes(a, "securiteEntrees")).find((x) => x.nom === "Marc DURAND") || {};
    t.ok(m3.consigneRemise && m3.consigneRemise.a === "police" && m3.consigneRemise.note === "Pris en charge par la BAC", "remise à la police notée", JSON.stringify(m3.consigneRemise));
    t.egal(await a.locator("#secu-retenus-l").count(), 0, "plus rien à remettre");

    // 6. Retenu à la sortie : un téléphone rendu, un couteau retenu.
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").fill("Léa MOREAU");
    await a.locator("#se-consigne-plus").click(); await a.locator("#se-consigne .consigne-r select").selectOption("telephone");
    await a.locator("#se-consigne-plus").click(); await a.locator("#se-consigne .consigne-r").nth(1).locator("select").selectOption("blanche");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 900);
    await a.locator("#secu-main li", { hasText: "Léa MOREAU" }).filter({ has: a.locator("button", { hasText: "Sortie" }) }).locator("button", { hasText: "Sortie" }).click(); await pause(a, 300);
    await a.locator("#so-retenir").click(); await pause(a, 300);
    await a.locator("#dlg .rl-pick label", { hasText: "Arme blanche" }).click();
    await a.locator("#sr-motif").fill("Couteau signalé dans une agression");
    await a.locator("#sr-ok").click(); await pause(a, 800);
    t.contient(texte(await a.locator("#dlg").innerText()), "Retenus, ne sont pas rendus : Arme blanche, motif : Couteau signalé dans une agression", "sortie : le reste est proposé, le retenu rappelé");
    await a.locator("#so-rendre").click(); await pause(a, 800);
    const lm = (await lignes(a, "securiteEntrees")).find((x) => x.nom === "Léa MOREAU") || {};
    t.ok(!!lm.sortie && !!(lm.consigneRendue && lm.consigneRendue.at) && lm.consigne[1].retenu && !lm.consigne[0].retenu, "téléphone rendu, couteau retenu", JSON.stringify(lm.consigne));
    t.sansErreur(a);

    // 7. La Direction voit les objets non récupérés dans « À traiter ».
    const NR = `window.__SEED.push({ collection: "securiteEntrees", id: "en9XyZ", data: { nom: "Paul LEGRAND", motif: "livraison", arrivee: "2026-11-10T15:00:00Z", sortie: "2026-11-10T16:00:00Z", consigne: [{ type: "longue", desc: "", n: 1 }], pieceVue: true, photos: [], at: "2026-11-10T15:00:00Z" } });
      window.__SEED.push({ collection: "securiteEntrees", id: "en8AbC", data: { nom: "Marc DURAND", motif: "autre", arrivee: "2026-11-10T15:00:00Z", sortie: "2026-11-10T16:00:00Z", consigne: [{ type: "longue", desc: "AK-47", n: 1, retenu: { motif: "Arme de guerre", at: "2026-11-10T15:00:00Z", par: "Alice" } }], pieceVue: true, photos: [], at: "2026-11-10T15:00:00Z" } });`;
    const d = await ouvrir(env, { hash: "dashboard", avant: NR });
    await pause(d, 1000);
    const td = texte(await d.locator("#todo").innerText());
    t.ok(/Consigne : objets non récupérés C-9XYZ Paul LEGRAND/.test(td) && !/non récupérés[^\n]*Marc DURAND/.test(td), "À traiter : objets non récupérés (pas l'objet retenu)", td.slice(0, 500));
    t.contient(td, "Consigne : objets retenus à remettre", "À traiter : objets retenus à remettre");
    t.sansErreur(d);
  },
};
