// Personnel : organigramme (niveaux d'après le barème, photos, fiche d'un clic ; aussi dans Mon espace)
// et tableau de service de la semaine (absences, rendez-vous, aujourd'hui en évidence, heures).
const { ouvrir, onglet, pause, texte } = require("../outils");

const GRADES = `
  window.__SEED.find(r => r.id === "f1").data.grade = "Agent service de la protection";
  window.__SEED.find(r => r.id === "f2").data.grade = "Responsable service de la protection";
  window.__SEED.find(r => r.id === "f4").data.grade = "Préfet de région";
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.payes = Object.assign({}, c.data.payes, { grades: [{ nom: "Agent service de la protection", taux: 3300 }, { nom: "Responsable service de la protection", taux: 3750 }, { nom: "Préfet de région", taux: 5000 }] }); }
  window.__SEED.push({ collection: "absences", id: "abs-ts", data: { fid: "f2", nom: "Bruno LEROY", du: "2026-11-10", au: "2026-11-11", motif: "Congé", statut: "prise_en_compte", par: "agent", at: "2026-11-09T10:00:00Z" } });
  window.__SEED.push({ collection: "agenda", id: "ev-ts", data: { titre: "Réunion de service", type: "reunion", debut: "2026-11-12T20:00:00Z", fin: "2026-11-12T21:00:00Z", audience: "tous", participants: [], statut: "prevu", at: "2026-11-09T10:00:00Z" } });`;

module.exports = {
  nom: "Personnel : organigramme et tableau de service",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel", avant: GRADES });
    await pause(d, 1200);
    await d.locator("#rh-espaces button", { hasText: "Organigramme" }).click(); await pause(d, 400);
    const niv = await d.locator("#rh-organigramme .orga-niv .orga-t strong").allInnerTexts();
    t.ok(niv[0] === "Préfet de région" && niv.indexOf("Responsable service de la protection") < niv.indexOf("Agent service de la protection"), "niveaux du plus haut au plus bas", niv.join(" | "));
    t.ok(await d.locator("#rh-organigramme .orga-p .avatar").count() >= 3, "une pastille par personne");
    await d.locator("#rh-organigramme .orga-p", { hasText: "Bruno LEROY" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg .dlg-title").first().innerText()), "Bruno LEROY", "clic : la fiche s'ouvre");
    await d.keyboard.press("Escape"); await pause(d, 300);

    await d.locator("#rh-espaces button", { hasText: "Tableau de service" }).click(); await pause(d, 400);
    const tab = texte(await d.locator("#ts-table").innerText());
    t.ok(/Toute l’équipe/.test(tab) && /Réunion de service/.test(tab) && /Absent/.test(tab), "semaine : réunion d'équipe et absence", tab.slice(0, 300));
    t.egal(await d.locator("#ts-table thead th.ts-auj").count(), 1, "aujourd'hui en évidence");
    t.egal(await d.locator("#ts-table tbody tr", { hasText: "Bruno LEROY" }).locator("td.ts-abs").count(), 4, "Bruno absent quatre jours de la semaine (deux absences)");
    t.contient(tab, "Heures", "colonne des heures pour la Direction");
    await d.locator("#rh-service button", { hasText: "Semaine suivante" }).click(); await pause(d, 300);
    t.ok(await d.locator("#ts-table tbody tr", { hasText: "Bruno LEROY" }).locator("td.ts-abs").count() === 1 && await d.locator("#ts-table thead th.ts-auj").count() === 0, "semaine suivante : la fin de son absence (lundi 16)");
    t.sansErreur(d);

    // Ressources humaines : pas de colonne des heures (la paye n'est pas à elles).
    const r = await ouvrir(env, { role: "rh", discord: "444444444444444444", nom: "RH Test", hash: "personnel", avant: GRADES });
    await pause(r, 1200);
    await r.locator("#rh-espaces button", { hasText: "Tableau de service" }).click(); await pause(r, 400);
    t.ok(!/Heures/.test(texte(await r.locator("#ts-table thead").innerText())), "RH : sans les heures");
    t.sansErreur(r);

    // Mon espace : l'organigramme depuis l'annuaire.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace", avant: GRADES });
    await pause(a, 1200);
    await a.locator("#es-orga").click(); await pause(a, 400);
    const na = await a.locator("#dlg .orga-niv .orga-t strong").allInnerTexts();
    t.ok(na[0] === "Préfet de région" && await a.locator("#dlg .orga-p.moi").count() === 1, "Mon espace : organigramme, vous en évidence", na.join(" | "));
    t.sansErreur(a);
  },
};
