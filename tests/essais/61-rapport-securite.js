// Rapport de sécurité de la semaine : affluence par heure, contrôles non conformes, personnes signalées venues,
// objets retenus ; consultable dans l'onglet Sécurité, en image ; posté tout seul le lundi au salon de la
// Direction (une fois par semaine, verrou meta/rapportSecu).
const { ouvrir, onglet, pause, texte } = require("../outils");

// Semaine 45 (2 au 8 novembre) : trois entrées, dont deux à 21 h ; Marc DURAND est interdit d'entrée depuis fin
// octobre ; un contrôle conforme, un faux document ; l'arme d'Hugo retenue. Une entrée de la semaine 46 ne compte pas.
const SEED = `window.__SEED.push(
  { collection: "securiteSignalements", id: "sg1", data: { nom: "Marc DURAND", motif: "interdit", actif: true, agent: "Bruno LEROY", at: "2026-10-30T10:00:00Z" } },
  { collection: "securiteEntrees", id: "e1", data: { nom: "Hugo MARCHAND", motif: "rdv", arrivee: "2026-11-03T20:15:00Z", sortie: "2026-11-03T21:30:00Z", pieceVue: true, photos: [], agent: "Alice MARTIN", at: "2026-11-03T20:15:00Z",
    consigne: [{ type: "poing", desc: "Glock 17", n: 1, retenu: { motif: "Arme non déclarée", at: "2026-11-03T21:00:00Z", par: "Alice MARTIN" } }] } },
  { collection: "securiteEntrees", id: "e2", data: { nom: "Léa PETIT", motif: "depot", arrivee: "2026-11-03T20:40:00Z", sortie: "2026-11-03T20:50:00Z", pieceVue: true, photos: [], agent: "Alice MARTIN", at: "2026-11-03T20:40:00Z" } },
  { collection: "securiteEntrees", id: "e3", data: { nom: "Marc DURAND", motif: "autre", arrivee: "2026-11-05T19:10:00Z", sortie: "2026-11-05T19:20:00Z", pieceVue: true, photos: [], agent: "Alice MARTIN", at: "2026-11-05T19:10:00Z" } },
  { collection: "securiteEntrees", id: "e4", data: { nom: "Paul NOUVEAU", motif: "rdv", arrivee: "2026-11-10T18:00:00Z", pieceVue: true, photos: [], agent: "Alice MARTIN", at: "2026-11-10T18:00:00Z" } },
  { collection: "securiteControles", id: "c1", data: { nom: "Léa PETIT", resultat: "conforme", motif: "entree", lieu: "Hall", date: "2026-11-03T20:41:00Z", photos: [], agent: "Alice MARTIN", at: "2026-11-03T20:41:00Z" } },
  { collection: "securiteControles", id: "c2", data: { nom: "Marc DURAND", resultat: "faux", motif: "suspect", lieu: "Hall", date: "2026-11-05T19:12:00Z", photos: [], agent: "Alice MARTIN", at: "2026-11-05T19:12:00Z" } });`;
const DIRECTION = (env) => `window.__discord = { webhooks: { direction: "${env.url}/__webhook/direction" } };`;
const FAIT = `window.__SEED.push({ collection: "meta", id: "rapportSecu", data: { semaine: "2026-S45", at: "2026-11-09T08:00:00Z" } });`;

module.exports = {
  nom: "Rapport de sécurité de la semaine",
  async lancer(env, t) {
    // Envoi automatique du lundi (ici mardi : la première session de la Direction de la semaine).
    const d = await ouvrir(env, { avant: SEED + DIRECTION(env) });
    await pause(d, 2000);
    const post = d.webhooks.find((w) => /Rapport de sécurité/.test(w.corps));
    t.ok(post && /semaine 45 : 3 entrées, 2 contrôles dont 1 non conforme, 1 personne signalée venue, 1 objet retenu/.test(post.corps), "rapport posté à la Direction", post ? post.corps.slice(0, 300) : d.webhooks.map((w) => w.corps.slice(0, 80)).join(" | "));
    t.ok(post && /filename="?rapport/i.test(post.corps) || (post && /\.png/.test(post.corps)), "avec l'image du rapport");
    const meta = await d.evaluate(() => (window.__rows.get("meta/rapportSecu") || {}).data);
    t.ok(meta && meta.semaine === "2026-S45" && meta.entrees === 3, "verrou de la semaine", JSON.stringify(meta));
    // Dans l'onglet : le rapport et son image.
    await onglet(d, "securite"); await pause(d, 400);
    await d.locator("#secu-semaine").click(); await pause(d, 400);
    const r = texte(await d.locator("#rs-resume").innerText());
    t.ok(/3 entrées \(3 personnes\), 2 contrôles dont 1 non conforme, 1 personne signalée venue, 1 objet retenu\. Heure la plus chargée : 21 h \(2 entrées\)/.test(r), "résumé de la semaine passée", r);
    await d.locator("#rs-image").click(); await pause(d, 1500);
    t.ok(await d.locator("#dlg img").first().evaluate((i) => i.naturalWidth > 0), "image du rapport");
    t.sansErreur(d);

    // Déjà posté cette semaine : rien de plus.
    const e = await ouvrir(env, { hash: "dashboard", avant: SEED + DIRECTION(env) + FAIT });
    await pause(e, 2000);
    t.ok(!e.webhooks.some((w) => /Rapport de sécurité/.test(w.corps)), "pas deux fois la même semaine");

    // Un agent de la protection consulte le rapport, sans le publier.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "securite", avant: `window.__SEED.find(r => r.id === "f1").data.grade = "Agent de sécurité";` + SEED });
    await pause(a, 1200);
    await a.locator("#tab-btn-securite").click(); await pause(a, 500);
    await a.locator("#secu-semaine").click(); await pause(a, 400);
    t.contient(texte(await a.locator("#rs-resume").innerText()), "3 entrées", "agent de la protection : le rapport");
    t.egal(await a.locator("#rs-publier").count(), 0, "agent : pas de publication");
    t.sansErreur(a);
  },
};
