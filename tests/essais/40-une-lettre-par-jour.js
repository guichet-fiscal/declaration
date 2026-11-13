// Recouvrement : une lettre par jour et par entreprise. Le dernier envoi est sur chaque ligne ; une entreprise
// contactée aujourd'hui (relance, mise en demeure, rappel, à la main ou automatique) attend demain ;
// « Rappeler » à portée de main pour les lettres en attente, et « Rappeler d'un coup ».
const { ouvrir, onglet, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const PLUS = `
  window.__SEED.find(r => r.collection === "relances" && r.id === "r4").data.echeance = "2026-11-12T10:00:00Z";
  window.__SEED.find(r => r.collection === "relances" && r.id === "r6").data.echeance = "2026-11-12T10:00:00Z";
  E("e7", "Atlas Sécurité");
  for (const k of ["2026-S41", "2026-S42", "2026-S43", "2026-S44", "2026-S45"])
    D("de7" + k, "e7", "Atlas Sécurité", k, k === "2026-S44" ? 5000 : 0, k === "2026-S45" ? "2026-11-10T12:00:00Z" : k === "2026-S44" ? "2026-11-03T12:00:00Z" : "2026-10-27T12:00:00Z");
  E("e8", "Bastion Armement");
  for (const k of ["2026-S41", "2026-S42", "2026-S43", "2026-S44", "2026-S45"])
    D("de8" + k, "e8", "Bastion Armement", k, k === "2026-S44" ? 7000 : 0, k === "2026-S45" ? "2026-11-10T12:00:00Z" : k === "2026-S44" ? "2026-11-03T12:00:00Z" : "2026-10-27T12:00:00Z");
  R("r9", "e8", "Bastion Armement", "paiement", "relance", "2026-11-08T10:00:00Z", "2026-11-12T10:00:00Z", { items: [{ kind: "decl", id: "de82026-S44", ref: "DF-V", label: "Avis", montant: 7000 }], montant: 7000 });
  R("r8", "e7", "Atlas Sécurité", "paiement", "relance", "2026-11-09T10:00:00Z", "2026-11-12T10:00:00Z", { items: [{ kind: "decl", id: "de72026-S44", ref: "DF-W", label: "Avis", montant: 5000 }], montant: 5000 });
`;
const ligne = (d, liste, nom) => d.locator(`${liste} > li`, { hasText: nom }).first();
const fermer = async (d) => { if (await d.locator("#dlg").isVisible()) { await d.keyboard.press("Escape"); await pause(d, 300); } };

module.exports = {
  nom: "Recouvrement : une lettre par jour et par entreprise",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + PLUS });
    await pause(d, 800);
    await onglet(d, "recouvrement"); await pause(d, 400);

    // 1. Club 77 a reçu sa mise en demeure ce matin : « Fait aujourd'hui », rappel possible demain.
    t.contient(texte(await d.locator("#rc-auj-l").innerText()), "11:00 Club 77 · Mise en demeure de payer", "fait aujourd'hui : Club 77 à 11:00");
    const club = ligne(d, "#rc-attente-l", "Club 77");
    const tc = texte(await club.innerText());
    t.ok(/Dernier envoi à l’entreprise : aujourd’hui à 11:00/.test(tc) && /Rappeler la mise en demeure : demain/.test(tc), "Club 77 : dernier envoi et « demain »", tc);
    t.egal(await club.locator(".rc-renvoi").count(), 0, "Club 77 : pas de bouton Rappeler aujourd'hui");

    // 2. Atlas Sécurité, relancée hier : « Rappeler la relance » ; une fois rappelée, plus avant demain.
    const atlas = ligne(d, "#rc-attente-l", "Atlas Sécurité");
    t.contient(texte(await atlas.innerText()), "Dernier envoi à l’entreprise : hier à 11:00", "Atlas : dernier envoi hier");
    await atlas.locator(".rc-renvoi", { hasText: "Rappeler la relance" }).click(); await pause(d, 700); await fermer(d);
    const r8 = (await lignes(d, "relances")).find((r) => r.id === "r8") || {};
    t.egal((r8.rappels || []).length, 1, "rappel noté sur la relance");
    const ta = texte(await ligne(d, "#rc-attente-l", "Atlas Sécurité").innerText());
    t.ok(/Rappeler la relance : demain/.test(ta) && /Rappelée aujourd’hui à 21:30/.test(ta), "Atlas : rappelée aujourd'hui, prochain demain", ta);
    t.contient(texte(await d.locator("#rc-auj-l").innerText()), "Atlas Sécurité · Rappel : relance de paiement", "fait aujourd'hui : le rappel d'Atlas");

    // 3. Rappeler d'un coup : Vanguard et Bastion (Club 77 et Atlas, déjà contactées, n'y sont pas).
    await d.locator("#rc-rappel-groupe").click(); await pause(d, 300);
    const dlg = texte(await d.locator("#dlg").innerText());
    t.ok(/Bastion Armement/.test(dlg) && /Vanguard Armurerie/.test(dlg) && !/Club 77/.test(dlg) && !/Atlas/.test(dlg), "rappel groupé : les deux lettres non rappelées aujourd'hui", dlg.slice(0, 300));
    t.contient(texte(await d.locator("#rg-preview").innerText()), "Ces entreprises ont reçu une lettre", "aperçu du message");
    await d.locator("#dlg button", { hasText: "Enregistrer et copier le message" }).click(); await pause(d, 800); await fermer(d);
    const rel = await lignes(d, "relances");
    t.ok(["r6", "r9"].every((id) => ((rel.find((r) => r.id === id) || {}).rappels || []).length === 1), "rappel noté sur les deux lettres");

    // 4. Taxi G7 : la mise en demeure part ; ensuite, Taxi G7 attend demain.
    const taxi = ligne(d, "#rc-afaire-l", "Taxi G7");
    await taxi.locator("button", { hasText: "Envoyer la mise en demeure" }).click(); await pause(d, 700); await fermer(d);
    t.egal((await lignes(d, "relances")).filter((r) => r.entrepriseId === "e1").length, 2, "mise en demeure enregistrée");
    t.ok(!/Taxi G7/.test(texte(await d.locator("#rc-afaire-l").innerText().catch(() => ""))), "Taxi G7 n'est plus dans « À faire »");
    t.contient(texte(await d.locator("#rc-auj-l").innerText()), "Taxi G7 · Mise en demeure de payer", "fait aujourd'hui : Taxi G7");
    t.contient(texte(await ligne(d, "#rc-attente-l", "Taxi G7").innerText()), "Rappeler la mise en demeure : demain", "Taxi G7 : rappel demain");
    t.sansErreur(d);

    // 5. Le lendemain : Club 77 peut être rappelée.
    const n = await ouvrir(env, { hash: "dashboard", avant: SEED + PLUS, maintenant: "2026-11-11T09:00:00Z" });
    await pause(n, 800);
    await onglet(n, "recouvrement"); await pause(n, 400);
    const c2 = ligne(n, "#rc-attente-l", "Club 77");
    t.ok(/hier à 11:00/.test(texte(await c2.innerText())) && (await c2.locator(".rc-renvoi").count()) === 1, "le lendemain : « Rappeler » de nouveau");
    t.sansErreur(n);
  },
};
