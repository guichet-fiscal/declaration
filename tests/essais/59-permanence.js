// Tableau de permanence (Personnel → Disponibilités) : pour chaque heure de la soirée, combien de
// fonctionnaires sont disponibles, s'il y a un agent de la protection et un encadrant ; une case ouvre qui peut
// couvrir ; le tableau de bord RH signale les heures de ce soir sans protection ou sans encadrant.
const { ouvrir, pause, texte } = require("../outils");

// Mardi 10 novembre (21 h 30 à Paris). Alice (protection) : 21 h – 23 h ; Directeur Test (encadrant) : 22 h – minuit ;
// Bruno : 20 h – 21 h.
const SEED = `window.__SEED.find(r => r.id === "f1").data.grade = "Agent de sécurité";
  window.__SEED.find(r => r.id === "f4").data.grade = "Directeur des finances publiques";
  const D = (fid, nom, hebdo) => window.__SEED.push({ collection: "rh", id: "dispo-" + fid, data: { type: "disponibilites", fid, nom, hebdo, ponctuelles: [], note: "", majLe: "2026-11-09T10:00:00Z" } });
  D("f1", "Alice MARTIN", [{ j: 2, de: "21:00", a: "23:00" }]); D("f4", "Directeur Test", [{ j: 2, de: "22:00", a: "00:00" }]); D("f2", "Bruno LEROY", [{ j: 2, de: "20:00", a: "21:00" }]);`;

module.exports = {
  nom: "Tableau de permanence",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel", avant: SEED });
    await pause(d, 900);
    await d.locator("#rh-espaces button", { hasText: "Disponibilités" }).click(); await pause(d, 400);
    const c = (h) => d.locator(`#perm-table [data-pc="2026-11-10|${h}"]`);
    t.ok(/1 dispo\s*sans encadrant/.test(texte(await c(21).innerText())), "21 h : Alice seule, sans encadrant", texte(await c(21).innerText()));
    t.ok(/2 dispo\s*1 prot\. · 1 enc\./.test(texte(await c(22).innerText())) && await c(22).evaluate((b) => b.parentElement.classList.contains("perm-ok")), "22 h : protection et encadrant");
    t.ok(/1 dispo\s*sans protection/.test(texte(await c(23).innerText())), "23 h : sans protection", texte(await c(23).innerText()));
    t.ok(/0 dispo\s*personne/.test(texte(await c(24).innerText())) && await c(24).evaluate((b) => b.parentElement.classList.contains("perm-bad")), "minuit : personne");
    t.ok(await c(20).evaluate((b) => b.parentElement.classList.contains("perm-passe")), "20 h : heure passée, en retrait");
    t.contient(texte(await d.locator("#perm-resume").innerText()), "sans agent de la protection", "résumé de la semaine");
    // Qui peut couvrir la protection à 23 h ?
    await c(23).click(); await pause(d, 400);
    const dlg = texte(await d.locator("#dlg").innerText());
    t.ok(/Disponibles \(1\)\s*Directeur Test/.test(dlg) && /Pour couvrir la protection\s*Alice MARTIN\s*Agent de sécurité\s*Pas disponible/.test(dlg) && !/Pour couvrir l’encadrement/.test(dlg), "case : disponibles et qui solliciter", dlg.slice(0, 500));
    await d.keyboard.press("Escape"); await pause(d, 200);
    // Soirée plus courte : le réglage reste dans ce navigateur.
    await d.locator("#perm-a").selectOption("23"); await pause(d, 300);
    t.egal(await d.locator("#perm-table tbody tr").count(), 3, "soirée de 20 h à 23 h : trois lignes");
    await d.locator("#perm-a").selectOption("25"); await pause(d, 300);
    t.sansErreur(d);

    // Tableau de bord RH : ce soir.
    await d.locator("#rh-espaces button", { hasText: "Tableau de bord" }).click(); await pause(d, 400);
    const bord = texte(await d.locator("#rh-bord").innerText());
    t.ok(/Ce soir : 2 heures sans agent de la protection, 2 sans encadrant/.test(bord) && /protection : 23 h, 0 h · encadrement : 21 h, 0 h/.test(bord), "À surveiller : les heures de ce soir", bord.slice(0, 900));
    t.sansErreur(d);
  },
};
