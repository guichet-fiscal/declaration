// Créneaux de paiement : la Direction ouvre une permanence (onglet Convocations) ; le patron réserve un
// créneau depuis son espace entreprise, puis l'annule ; la Direction voit le rendez-vous du jour.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const JETON = "0123456789abcdef0123456789abcdef0123";
const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });
  window.__jetons = { "${JETON}": "e1" };`;
const SLOTS = `
  window.__SEED.push({ collection: "creneaux", id: "c1", data: { debut: "2026-11-11T20:00:00Z", fin: "2026-11-11T20:15:00Z", lieu: "Préfecture de police, guichet des impôts et cotisations", statut: "ouvert", permanence: "p1", at: "2026-11-10T10:00:00Z" } });
  window.__SEED.push({ collection: "creneaux", id: "c2", data: { debut: "2026-11-11T20:15:00Z", fin: "2026-11-11T20:30:00Z", lieu: "Préfecture de police, guichet des impôts et cotisations", statut: "ouvert", permanence: "p1", at: "2026-11-10T10:00:00Z" } });
  window.__SEED.push({ collection: "creneaux", id: "c3", data: { debut: "2026-11-11T20:30:00Z", fin: "2026-11-11T20:45:00Z", statut: "ouvert", permanence: "p1", entrepriseId: "e9", entrepriseNom: "Autre SARL", objet: "Avis", at: "2026-11-10T10:00:00Z" } });`;
const AUJ = `window.__SEED.push({ collection: "creneaux", id: "c4", data: { debut: "2026-11-10T21:00:00Z", fin: "2026-11-10T21:15:00Z", statut: "ouvert", permanence: "p0", entrepriseId: "e1", entrepriseNom: "Taxi G7", objet: "Avis de la semaine 45", reserveLe: "2026-11-10T12:00:00Z", at: "2026-11-09T10:00:00Z" } });`;

module.exports = {
  nom: "Créneaux de paiement : permanence, réservation par l'entreprise",
  async lancer(env, t) {
    // 1. La Direction ouvre une permanence d'une heure, créneaux de 15 minutes.
    const d = await ouvrir(env, { hash: "dashboard", avant: ENT + AUJ });
    await pause(d, 1000);
    t.contient(texte(await d.locator("#todo").innerText()), "Rendez-vous de paiement aujourd’hui", "À traiter : rendez-vous du jour");
    await onglet(d, "convocations");
    t.contient(texte(await d.locator("#creneaux").innerText()), "Taxi G7", "liste : le rendez-vous de Taxi G7");
    await d.locator("#cr-ouvrir").click(); await pause(d, 300);
    await d.locator("#cr-date").fill("2026-11-12");
    await d.locator("#cr-hd").fill("21:00"); await d.locator("#cr-hf").fill("22:00"); await d.locator("#cr-hf").dispatchEvent("change"); await pause(d, 100);
    t.contient(texte(await d.locator("#dlg").innerText()), "4 créneaux de 15 minutes", "aperçu de la permanence");
    await d.locator("#dlg button", { hasText: "Ouvrir les créneaux" }).click(); await pause(d, 1500);
    const cr = (await lignes(d, "creneaux")).filter((c) => c.debut && c.debut.startsWith("2026-11-12"));
    t.ok(cr.length === 4 && cr.every((c) => c.statut === "ouvert" && !c.entrepriseId) && new Set(cr.map((c) => c.permanence)).size === 1, "quatre créneaux ouverts, une permanence", JSON.stringify(cr.map((c) => c.debut)));
    // Libérer le créneau de Taxi G7 (deux clics).
    const li = d.locator("#creneaux li", { hasText: "Taxi G7" });
    await li.locator("button", { hasText: "Libérer" }).click(); await pause(d, 150);
    await li.locator("button", { hasText: "Confirmer" }).click(); await pause(d, 900);
    t.ok(!(await lignes(d, "creneaux")).find((c) => c.id === "c4").entrepriseId, "créneau libéré");
    t.sansErreur(d);

    // 2. Le patron, depuis son espace : les créneaux libres (pas celui d'une autre entreprise), réserve, annule.
    const p = await ouvrir(env, { role: "direction", hash: "espace=" + JETON, avant: ENT + SLOTS });
    await pause(p, 1200);
    const carte = texte(await p.locator("#pt-creneaux").innerText());
    t.ok(/Rendez-vous pour payer/.test(carte) && !/Autre SARL/.test(carte) && (await p.locator("#pt-creneaux .pt-cr button").count()) === 2, "deux créneaux libres, l'autre entreprise invisible", carte.slice(0, 200));
    await p.locator("#pt-creneaux .pt-cr button").first().click(); await pause(p, 300);
    await p.locator("#pc-precis").fill("Avec le comptable");
    await p.locator("#dlg button", { hasText: "Réserver ce créneau" }).click(); await pause(p, 1000);
    const c1 = (await lignes(p, "creneaux")).find((c) => c.id === "c1");
    t.ok(c1.entrepriseId === "e1" && /Avec le comptable/.test(c1.objet), "créneau réservé avec l'objet", JSON.stringify(c1).slice(0, 200));
    t.ok(await p.locator("#pt-mes-rdv li").count() === 1 && await p.locator("#pt-creneaux .pt-cr button").count() === 1, "son rendez-vous affiché, un créneau libre restant");
    await p.locator("#pt-mes-rdv button", { hasText: "Annuler" }).click(); await pause(p, 150);
    await p.locator("#pt-mes-rdv button", { hasText: "Confirmer l’annulation" }).click(); await pause(p, 1000);
    t.ok(!(await lignes(p, "creneaux")).find((c) => c.id === "c1").entrepriseId && await p.locator("#pt-mes-rdv").count() === 0, "rendez-vous annulé, créneau rendu");
    t.sansErreur(p);

    // 3. Sans la mise à jour 43 : pas de carte, l'espace marche.
    const q = await ouvrir(env, { role: "direction", hash: "espace=" + JETON, avant: ENT + SLOTS + "window.__sans43 = true;" });
    await pause(q, 1000);
    t.ok(await q.locator("#pt-creneaux").count() === 0 && await q.locator("#pt-pay, #portail .card").count() > 0, "sans le script : espace sans la carte");
    t.sansErreur(q);
  },
};
