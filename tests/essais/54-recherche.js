// Recherche rapide (Ctrl + K) étendue : agents (matricule de la carte), contrats de travail, personnes passées
// à la sécurité, tickets de consigne ; ouverte aussi aux RH et aux agents de la protection, chacun dans son
// périmètre.
const { ouvrir, pause, texte } = require("../outils");

const SECU = `window.__SEED.push({ collection: "securiteEntrees", id: "en7QrSt", data: { nom: "Hugo MARCHAND", motif: "rendez-vous", arrivee: "2026-11-10T18:00:00Z", numero: "X4RT12345", consigne: [{ type: "poing", desc: "Glock 17", n: 1 }], pieceVue: true, photos: [], at: "2026-11-10T18:00:00Z" } });`;
const PROTECTION = `window.__SEED.find(r => r.id === "f1").data.grade = "Agent service de la protection";`;
const chercher = async (p, q) => { await p.keyboard.press("Control+k"); await pause(p, 300); await p.locator("#q-in").fill(q); await pause(p, 300); return texte(await p.locator("#q-list").innerText()); };

module.exports = {
  nom: "Recherche rapide étendue",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SECU });
    await pause(d, 900);
    let l = await chercher(d, "Alice");
    t.ok(/Fonctionnaire\s*Alice MARTIN/i.test(l) && /Carte professionnelle\s*PP-\d{6} · Alice MARTIN/i.test(l), "agent et matricule de sa carte", l.slice(0, 400));
    l = await chercher(d, "CT-ABC123");
    t.ok(/Contrat de travail\s*CT-ABC123/i.test(l), "contrat de travail par sa référence", l);
    await d.keyboard.press("Escape"); await pause(d, 200);
    l = await chercher(d, "C-QRST");
    t.contient(l, "C-QRST · Hugo MARCHAND", "ticket de consigne");
    await d.keyboard.press("Enter"); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Hugo MARCHAND", "Entrée : ouvre l'entrée");
    await d.keyboard.press("Escape"); await pause(d, 200);
    l = await chercher(d, "X4RT12345");
    t.ok(/Personne \(sécurité\)\s*Hugo MARCHAND/i.test(l), "personne retrouvée par son numéro de pièce", l);
    t.sansErreur(d);

    // RH : son périmètre (personnel et sécurité), pas les entreprises.
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel", avant: SECU });
    await pause(r, 900);
    t.ok(await r.locator("#btn-search").isVisible(), "RH : bouton Rechercher");
    l = await chercher(r, "Hugo");
    t.ok(/Personne \(sécurité\)\s*Hugo MARCHAND/i.test(l), "RH : personne passée à la sécurité", l);
    l = await chercher(r, "sem");
    t.ok(!/Semaine/.test(l), "RH : pas les semaines fiscales", l.slice(0, 200));
    t.sansErreur(r);

    // Agent de la protection : la sécurité ; agent sans accès à la sécurité : pas de recherche.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: PROTECTION + SECU });
    await pause(a, 900);
    t.ok(await a.locator("#btn-search").isVisible(), "agent de la protection : bouton Rechercher");
    l = await chercher(a, "Hugo");
    t.contient(l, "Hugo MARCHAND", "agent : personne retrouvée");
    const b = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: SECU });
    await pause(b, 900);
    t.ok(!(await b.locator("#btn-search").isVisible()), "agent sans accès à la sécurité : pas de recherche");
  },
};
