// Demandes réservées à la Direction (FIPN, GIGN) : vues par la Direction seulement, jamais sur Discord
// (accusé de réception, décision, bilan, sauvegarde), ni saisissables par l'Inspection.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const RESERVE = `
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main");
    c.data.services = ["Police nationale", "Gendarmerie", "SAMU", "FIPN", "GIGN"]; c.data.servicesReserves = ["FIPN", "GIGN"]; }
  window.__SEED.push({ collection: "demandes", id: "dfipn", data: { service: "FIPN", objet: "Fusils d'assaut", nature: "materiel", lignes: [{ designation: "Fusil d'assaut", quantite: 4, prixUnitaire: 50000 }], montant: 200000, urgence: "prioritaire", demandeur: "Chef FIPN", recueAt: "2026-11-10T10:00:00Z", periode: "2026-11", createdAt: "2026-11-10T10:00:00Z" } });
  window.__SEED.push({ collection: "demandes", id: "dpol", data: { service: "Police nationale", objet: "Gilets", nature: "materiel", lignes: [{ designation: "Gilet pare-balles", quantite: 2, prixUnitaire: 10000 }], montant: 20000, urgence: "normale", demandeur: "Chef PN", recueAt: "2026-11-10T11:00:00Z", periode: "2026-11", createdAt: "2026-11-10T11:00:00Z" } });`;

module.exports = {
  nom: "Demandes réservées à la Direction (FIPN, GIGN)",
  async lancer(env, t) {
    const discord = `window.__discord = { webhooks: { services: "${env.url}/__webhook/services", direction: "${env.url}/__webhook/direction" }, auto: { demandes: true, decisions: true } };`;
    const d = await ouvrir(env, { hash: "svc", avant: RESERVE + discord });
    await pause(d, 1200);
    const services = (p) => p.webhooks.filter((w) => /__webhook\/services/.test(w.url || "") || w.salon === "services");

    // Sauvegarde de la semaine publiée à l'ouverture : sans la demande réservée.
    const sav = d.webhooks.filter((w) => /Sauvegarde du registre/.test(w.corps));
    t.ok(sav.length === 1 && /\b1 demandes\)/.test(sav[0].corps), "sauvegarde sur Discord : sans la demande du FIPN", sav.length ? sav[0].corps.slice(0, 260) : "aucune");
    // Direction : les deux demandes, celle du FIPN marquée « Réservée ».
    const liste = texte(await d.locator("#dem-table").innerText());
    t.ok(/Fusils d'assaut/.test(liste) && /Gilets/.test(liste) && /Réservée/.test(liste), "Direction : demande du FIPN visible, marquée réservée", liste.slice(0, 300));

    // Décision sur la demande réservée : pas de case « Publier », rien sur Discord.
    await d.locator("#dem-table .linkbtn", { hasText: "Fusils d'assaut" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Direction seulement", "fiche : visibilité indiquée");
    t.egal(await d.locator("#dlg-pub").count(), 0, "pas de case pour publier la décision");
    for (const b of await d.locator("#dlg button", { hasText: /^Tout$/ }).all()) await b.click();
    await d.locator("#dlg button.ink", { hasText: "Accorder" }).click(); await pause(d, 1200);
    t.egal(services(d).length, 0, "décision réservée : rien publié dans le salon des services");
    const arb = (await lignes(d, "arbitrages")).find((x) => x.id === "dfipn") || {};
    t.egal(arb.statut, "accordee", "décision enregistrée");
    await d.locator("#seg-dem button[data-f=accordees]").click(); await pause(d, 300);
    await d.locator("#dem-table .linkbtn", { hasText: "Fusils d'assaut" }).click(); await pause(d, 400);
    t.ok(await d.locator("#dlg button", { hasText: "Copier le texte" }).count() === 0, "pas de texte à coller sur Discord");
    await d.locator("#dlg button", { hasText: "Décision en image" }).click(); await pause(d, 600);
    t.egal(await d.locator("#dlg button", { hasText: /Publier/ }).count(), 0, "image de la décision : pas de bouton Publier");
    await d.keyboard.press("Escape"); await pause(d, 300);

    // Témoin : la décision d'une demande ordinaire part bien sur Discord.
    await d.locator("#seg-dem button[data-f=attente]").click(); await pause(d, 300);
    await d.locator("#dem-table .linkbtn", { hasText: "Gilets" }).click(); await pause(d, 400);
    t.egal(await d.locator("#dlg-pub").count(), 1, "demande ordinaire : case Publier proposée");
    await d.locator("#dlg-pub").check();
    for (const b of await d.locator("#dlg button", { hasText: /^Tout$/ }).all()) await b.click();
    await d.locator("#dlg button.ink", { hasText: "Accorder" }).click(); await pause(d, 1500);
    const sv = services(d);
    t.ok(sv.length === 1 && /Gilets/.test(sv[0].corps) && !/FIPN|Fusil/.test(sv[0].corps), "demande ordinaire publiée, sans rien du FIPN", sv.map((w) => (w.corps || "").slice(0, 120)).join(" | "));

    // Saisie par la Direction d'une demande du GIGN : avertissement, pas d'accusé de réception sur Discord.
    await onglet(d, "demande");
    await d.locator("#m-service").fill("GIGN"); await pause(d, 200);
    t.contient(texte(await d.locator("#m-reserve").innerText()), "réservée à la Direction", "formulaire : demande réservée annoncée");
    await d.locator("#m-arts .art-row input").nth(0).fill("Bouclier balistique");
    await d.locator("#m-arts .art-row input").nth(1).fill("3");
    await d.locator("#m-arts .art-row input").nth(2).fill("15000");
    await d.locator("#form-dem button[type=submit]").click(); await pause(d, 1500);
    const gign = (await lignes(d, "demandes")).find((x) => x.service === "GIGN");
    t.ok(!!gign, "demande du GIGN enregistrée par la Direction");
    t.egal(services(d).length, 1, "aucun accusé de réception publié pour le GIGN");

    // Réglages : la case « Réservé à la Direction » suit la liste.
    await onglet(d, "reglages");
    await d.evaluate(() => { const b = document.querySelector('#set-tab-services, [data-sg="services"]'); if (b) b.click(); }); await pause(d, 400);
    const coches = await d.evaluate(() => [...document.querySelectorAll("#env-editor input[data-svc-r]")].filter((i) => i.checked).map((i) => i.dataset.svcR));
    t.egal(coches.join(","), "FIPN,GIGN", "réglages : FIPN et GIGN cochés");
    t.sansErreur(d);

    // Inspection : ni la demande, ni le service, et la saisie est refusée.
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", hash: "svc", avant: RESERVE });
    await pause(i, 1200);
    const li = texte(await i.locator("#dem-table").innerText());
    t.ok(/Gilets/.test(li) && !/Fusils|FIPN/.test(li), "Inspection : la demande du FIPN n'apparaît pas", li.slice(0, 200));
    await onglet(i, "demande");
    const opts = await i.evaluate(() => [...document.querySelectorAll("#svc-options option")].map((o) => o.value));
    t.ok(opts.includes("Gendarmerie") && !opts.includes("FIPN") && !opts.includes("GIGN"), "Inspection : FIPN et GIGN absents de la liste des services", opts.join(","));
    await i.locator("#m-service").fill("FIPN");
    await i.locator("#m-arts .art-row input").nth(0).fill("Casque");
    await i.locator("#m-arts .art-row input").nth(1).fill("1");
    await i.locator("#m-arts .art-row input").nth(2).fill("1000");
    await i.locator("#form-dem button[type=submit]").click(); await pause(i, 600);
    t.contient(texte(await i.locator("#m-err").innerText()), "réservées à la Direction", "Inspection : saisie refusée");
    t.ok(!(await lignes(i, "demandes")).some((x) => x.service === "FIPN" && x.objet !== "Fusils d'assaut"), "rien d'enregistré");
    t.sansErreur(i);
  },
};
