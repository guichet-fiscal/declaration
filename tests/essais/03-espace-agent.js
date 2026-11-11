// Mon espace d'un fonctionnaire : payes, bulletin, conversation, réponse à l'agenda, absence, téléphone.
const { ouvrir, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Mon espace d'un fonctionnaire",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    const page = texte(await a.locator("#tab-espace").innerText());
    t.contient(page, "Alice MARTIN", "son nom en tête");
    t.contient(page, "Mes payes", "carte des payes");
    t.contient(page, "Nouvelles heures de service", "note de service visible");
    // Bulletin d'une paye versée.
    await a.locator(".es-payes tr.cliquable").first().click(); await pause(a, 1500);
    t.ok(await a.locator("#dlg").isVisible(), "le bulletin s'ouvre");
    await a.keyboard.press("Escape"); await pause(a, 300);
    // Message à l'encadrement.
    await a.locator(".fil-ecrire textarea").fill("Bonsoir, je serai absente samedi."); await a.locator(".fil-ecrire button").click(); await pause(a, 800);
    t.ok((await a.evaluate(() => window.__rpc)).includes("envoyer_message"), "message envoyé à l'encadrement");
    // Réponse à un rendez-vous.
    await a.locator(".es-col-d .seg button", { hasText: "Présent" }).first().click(); await pause(a, 700);
    const rep = await a.evaluate(() => window.__rows.get("agenda/e1").data.reponses);
    t.egal(rep.f1 && rep.f1.r, "oui", "réponse « Présent » enregistrée");
    // Absence signalée.
    await a.locator("#es-abs-du").fill("2026-11-14"); await a.locator("#es-abs-au").fill("2026-11-15"); await a.locator("#es-abs-motif").fill("Week-end en famille");
    await a.locator("button", { hasText: "Signaler l’absence" }).click(); await pause(a, 800);
    t.ok((await lignes(a, "absences")).some((x) => x.fid === "f1" && x.du === "2026-11-14"), "absence enregistrée");
    t.sansErreur(a);
    // Sanction en vigueur : rubrique « Mes sanctions ».
    const b = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno",
      avant: 'window.__SEED.push({ collection: "sanctions", id: "s9", data: { fid: "f2", nom: "Bruno LEROY", type: "blame", motif: "Retards répétés.", statut: "vigueur", ref: "SD-TEST01", at: "2026-11-10T19:00:00Z", effets: {} } });' });
    t.contient(texte(await b.locator("#espace-main").innerText()), "Mes sanctions", "sanction visible par l'agent concerné");
    t.sansErreur(b);
    // Téléphone : pas de défilement horizontal.
    const m = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", largeur: 390, hauteur: 844 });
    t.egal(await m.evaluate(() => document.documentElement.scrollWidth), 390, "téléphone : la page tient en largeur");
    t.sansErreur(m);
  },
};
