// Heure de Paris quel que soit le navigateur : un navigateur qui se dit en UTC (LibreWolf, Firefox avec
// « resistFingerprinting ») ou à New York saisit et affiche les heures de Paris. Signalé le 12 nov. :
// une permanence ouverte à 21 h 30 apparaissait à 22 h 30 chez les patrons.
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");

const JETON = "0123456789abcdef0123456789abcdef0123";
const ENT = `window.__SEED.push({ collection: "entreprises", id: "e1", data: { nom: "Taxi G7", secteur: "Transport", patron: "Jean Dupont", actif: true, createdAt: "2026-10-01T10:00:00Z" } });
  window.__jetons = { "${JETON}": "e1" };`;
const SLOT = `window.__SEED.push({ collection: "creneaux", id: "c1", data: { debut: "2026-11-11T20:30:00Z", fin: "2026-11-11T20:45:00Z", lieu: "Préfecture de police", statut: "ouvert", permanence: "p1", at: "2026-11-10T10:00:00Z" } });`;

module.exports = {
  nom: "Heure de Paris, même dans un navigateur réglé sur UTC",
  async lancer(env, t) {
    // 1. La Direction, navigateur en UTC : permanence de 21 h 30 à 22 h → 20 h 30 UTC (heure d'hiver).
    const d = await ouvrir(env, { hash: "dashboard", avant: ENT, fuseau: "UTC" });
    t.egal(await d.evaluate(() => window.__gfFuseau || "natif"), "UTC", "fuseau du navigateur repéré");
    await onglet(d, "convocations");
    await d.locator("#cr-ouvrir").click(); await pause(d, 300);
    await d.locator("#cr-date").fill("2026-11-12");
    await d.locator("#cr-hd").fill("21:30"); await d.locator("#cr-hf").fill("22:00"); await d.locator("#cr-hf").dispatchEvent("change"); await pause(d, 100);
    t.contient(texte(await d.locator("#dlg").innerText()), "de 21:30 à 22:00", "aperçu à l'heure de Paris");
    await d.locator("#dlg button", { hasText: "Ouvrir les créneaux" }).click(); await pause(d, 1200);
    const cr = (await lignes(d, "creneaux")).filter((c) => c.debut && c.debut.startsWith("2026-11-12")).map((c) => c.debut).sort();
    t.egal(cr, ["2026-11-12T20:30:00.000Z", "2026-11-12T20:45:00.000Z"], "créneaux enregistrés à 21 h 30 et 21 h 45 de Paris");
    t.contient(texte(await d.locator("#creneaux").innerText()), "21:30", "liste de la Direction à l'heure de Paris");
    // Horloge (20 h 30 UTC le 10 nov.) : 21 h 30 à Paris.
    t.egal(await d.evaluate(() => { const x = new Date(); return [x.getHours(), x.getMinutes()].join(":"); }), "21:30", "heure courante de Paris");
    t.sansErreur(d);

    // 2. Le patron, navigateur à New York : le créneau de 20 h 30 UTC se lit 21:30.
    const p = await ouvrir(env, { hash: "espace=" + JETON, avant: ENT + SLOT, fuseau: "America/New_York" });
    await pause(p, 1200);
    const carte = texte(await p.locator("#pt-creneaux").innerText());
    t.ok(/21:30/.test(carte) && !/15:30/.test(carte), "espace entreprise : 21:30 de Paris", carte.slice(0, 200));
    t.sansErreur(p);

    // 3. Relevé collé après la correction (13 nov., 21 h à Paris), navigateur en UTC : les heures de la tablette
    // sont celles de Paris, sans avance ; le relevé porte « heureParis ».
    const r = await ouvrir(env, { hash: "dashboard", avant: ENT, fuseau: "UTC", maintenant: "2026-11-13T20:00:00Z" });
    await onglet(r, "reglages"); await r.locator("#set-tab-recouvrement").click(); await pause(r, 300);
    t.egal(await r.locator("#bl-dec").inputValue(), "0", "avance de la tablette : 0 h depuis la correction");
    await onglet(r, "entreprises");
    await r.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(r, 500);
    await r.locator('#dlg .fiche-tabs button[data-ft="compte"]').click(); await pause(r, 200);
    await r.locator("#dlg button:visible", { hasText: /Relevé de compte|Nouveau relevé/ }).first().click(); await pause(r, 400);
    await r.evaluate((txt) => { const dt = new DataTransfer(); dt.setData("text/plain", txt); document.querySelector("#dlg .rv-zone").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); },
      "250 000 €\nCourse client\n13/11 20:40 +5 000 €\nAchat carburant\n13/11 19:10 -1 000 €");
    await pause(r, 600);
    if (!(await r.locator("#rv-montant").inputValue())) await r.locator("#rv-montant").fill("250000");
    await r.locator("#dlg button", { hasText: "Enregistrer le relevé" }).click(); await pause(r, 1200);
    const rv = (await lignes(r, "releves"))[0] || {};
    t.ok(rv.heureParis === true && rv.decalageH === 0 && (rv.mouvements || []).map((m) => m.t).join(",") === "2026-11-13T19:40:00.000Z,2026-11-13T18:10:00.000Z", "relevé : heures de Paris, sans avance", JSON.stringify(rv).slice(0, 300));
    t.sansErreur(r);

    // 4. Navigateur à Paris : rien ne change (Date d'origine).
    const q = await ouvrir(env, { hash: "dashboard", avant: ENT });
    t.egal(await q.evaluate(() => window.__gfFuseau || "natif"), "natif", "à Paris, Date d'origine");
  },
};
