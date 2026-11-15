// Contrôle de cohérence : le guichet relit le registre (enveloppe et payes au-delà du budget, demande accordée
// sans montant, entreprise et compte Discord en double…), le signale dans « À traiter » avec une liste qui
// ouvre chaque dossier, et le publie une fois par semaine au salon de la Direction.
const { ouvrir, onglet, pause, texte } = require("../outils");

const ANOMALIES = `
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.enveloppesMois = { "2026-11": { "Préfecture": 50000 } }; }
  window.__SEED.push({ collection: "demandes", id: "dsal1", data: { service: "Préfecture", objet: "Budget salaire", nature: "salaires", montant: 50000, urgence: "normale", demandeur: "Direction", recueAt: "2026-11-02T20:00:00Z", periode: "2026-11", createdAt: "2026-11-02T20:00:00Z" } });
  window.__SEED.push({ collection: "arbitrages", id: "dsal1", data: { statut: "accordee", montantAccorde: 50000, at: "2026-11-02T20:00:00Z" } });
  window.__SEED.push({ collection: "demandes", id: "dzero1", data: { service: "Police", objet: "Gilets pare-balles", montant: 5000, urgence: "normale", demandeur: "Chef de la police", recueAt: "2026-11-09T20:00:00Z", createdAt: "2026-11-09T20:00:00Z" } });
  window.__SEED.push({ collection: "arbitrages", id: "dzero1", data: { statut: "accordee", at: "2026-11-09T21:00:00Z" } });
  window.__SEED.push({ collection: "fonctionnaires", id: "f5", data: { nom: "Bruno LEROY BIS", grade: "Agent administratif", discordId: "222222222222222222", actif: true, at: "2026-11-01T10:00:00Z" } });
  for (const [id, nom] of [["e1", "Garage Bastide"], ["e2", "garage bastide"]]) window.__SEED.push({ collection: "entreprises", id, data: { nom, secteur: "Commerce", patron: "Patron", actif: true, createdAt: "2026-10-01T10:00:00Z", debutActivite: "2026-S41" } });`;
const DIRECTION = (env) => `window.__discord = { webhooks: { direction: "${env.url}/__webhook/direction" } };`;
const posts = (p) => p.webhooks.filter((w) => /Contrôle de cohérence/.test(w.corps));

module.exports = {
  nom: "Contrôle de cohérence du registre",
  async lancer(env, t) {
    // 1. Registre sans incohérence : rien dans « À traiter », rien publié ; « Rien à signaler » depuis les réglages.
    const a = await ouvrir(env, { avant: DIRECTION(env) });
    await pause(a, 1500);
    t.ok(!/Contrôle de cohérence/.test(texte(await a.locator("#todo-card").innerText().catch(() => ""))), "rien dans « À traiter » quand tout se tient");
    t.egal(posts(a).length, 0, "rien publié quand il n'y a rien à vérifier");
    const meta0 = await a.evaluate(() => (window.__rows.get("meta/coherence") || {}).data);
    t.ok(meta0 && meta0.semaine === "2026-S46" && meta0.points === 0, "contrôle de la semaine noté", JSON.stringify(meta0));
    await onglet(a, "reglages");
    await a.locator("#set-tab-sauvegardes").click(); await pause(a, 300);
    await a.locator("#b-coherence").click(); await pause(a, 300);
    t.contient(texte(await a.locator("#dlg").innerText()), "Rien à signaler", "réglages : contrôle lancé à la main");
    t.sansErreur(a);

    // 2. Registre avec des incohérences.
    const d = await ouvrir(env, { avant: DIRECTION(env) + ANOMALIES });
    await pause(d, 1500);
    const todo = texte(await d.locator("#todo").innerText());
    t.ok(/Contrôle de cohérence : 5 points à vérifier/.test(todo), "« À traiter » : 5 points", todo.slice(0, 600));
    await d.locator("#todo .linkbtn", { hasText: "Contrôle de cohérence" }).click(); await pause(d, 400);
    const l = texte(await d.locator("#coh-l").innerText());
    for (const [re, quoi] of [[/Enveloppe Préfecture dépassée ce mois-ci.*64 500 € engagés pour 50 000 € prévus/, "enveloppe dépassée"],
      [/Payes de novembre 2026 au-delà du budget.*64 500 € versés pour 50 000 € de budget/, "payes au-delà de la demande « salaires »"],
      [/Demande DM-DZERO1 accordée sans montant/, "demande accordée sans montant"],
      [/Même compte Discord sur 2 fiches.*Bruno LEROY, Bruno LEROY BIS|Même compte Discord sur 2 fiches.*Bruno LEROY BIS, Bruno LEROY/, "compte Discord en double"],
      [/Entreprise en double : Garage Bastide/i, "entreprise en double"]]) t.ok(re.test(l), quoi, l.slice(0, 700));
    await d.locator("#coh-l li", { hasText: "accordée sans montant" }).locator("button", { hasText: "Ouvrir" }).click(); await pause(d, 400);
    t.contient(texte(await d.locator("#dlg").innerText()), "Gilets pare-balles", "« Ouvrir » : la demande");

    // Publication de la semaine au salon de la Direction, une seule fois.
    const p = posts(d);
    t.egal(p.length, 1, "publié au salon de la Direction");
    t.ok(p[0] && /5 points à vérifier/.test(p[0].corps) && /Entreprise en double/.test(p[0].corps), "message : les points", p[0] ? p[0].corps.slice(0, 400) : "");
    const meta = await d.evaluate(() => (window.__rows.get("meta/coherence") || {}).data);
    t.ok(meta && meta.semaine === "2026-S46" && meta.points === 5, "noté pour la semaine", JSON.stringify(meta));
    t.sansErreur(d);

    const deja = `window.__SEED.push({ collection: "meta", id: "coherence", data: { semaine: "2026-S46", at: "2026-11-09T10:00:00Z", points: 5 } });`;
    const e = await ouvrir(env, { avant: DIRECTION(env) + ANOMALIES + deja });
    await pause(e, 1500);
    t.egal(posts(e).length, 0, "une seule publication par semaine");
    const f = await ouvrir(env, { avant: DIRECTION(env).replace("} };", "}, auto: { coherence: false } };") + ANOMALIES });
    await pause(f, 1500);
    t.egal(posts(f).length, 0, "rien si la publication est décochée");
  },
};
