// Sauvegarde de la semaine : publiée une fois par semaine dans le salon des sauvegardes (à défaut, de la
// Direction), en fichier compressé ; un fichier compressé se restaure tel quel.
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ouvrir, onglet, pause, texte } = require("../outils");

module.exports = {
  nom: "Sauvegarde de la semaine sur Discord",
  async lancer(env, t) {
    const salons = (x) => `window.__discord = { webhooks: { ${x} } };`;
    const dir = `direction: "${env.url}/__webhook/direction"`, sav = `sauvegardes: "${env.url}/__webhook/sauvegardes"`;
    const deSauvegarde = (p) => p.webhooks.filter((w) => /Sauvegarde du registre/.test(w.corps));

    // 1. Sans salon des sauvegardes : salon de la Direction, fichier .json.gz, notée pour la semaine.
    const d = await ouvrir(env, { avant: salons(dir) });
    await pause(d, 1500);
    let posts = deSauvegarde(d);
    t.egal(posts.length, 1, "une sauvegarde publiée");
    t.ok(posts[0] && posts[0].url.includes("/direction"), "dans le salon de la Direction, à défaut de salon des sauvegardes");
    t.ok(posts[0] && /filename="guichet-fiscal-sauvegarde-2026-11-10\.json\.gz"/.test(posts[0].corps), "fichier compressé joint", (posts[0] || {}).corps ? posts[0].corps.slice(0, 200) : "");
    const meta = await d.evaluate(() => [(window.__rows.get("meta/sauvegardeAuto") || {}).data, (window.__rows.get("meta/sauvegarde") || {}).data]);
    t.ok(meta[0] && meta[0].semaine === "2026-S46" && meta[0].dossiers > 5 && meta[1] && meta[1].auto === true, "notée pour la semaine, et comme dernière sauvegarde", JSON.stringify(meta));
    t.sansErreur(d);

    // 2. Salon des sauvegardes réglé : c'est lui ; déjà faite cette semaine : rien ; décochée : rien.
    const e = await ouvrir(env, { avant: salons(`${dir}, ${sav}`) });
    await pause(e, 1500);
    posts = deSauvegarde(e);
    t.ok(posts.length === 1 && posts[0].url.includes("/sauvegardes"), "dans le salon des sauvegardes quand il est réglé");
    const deja = 'window.__SEED.push({ collection: "meta", id: "sauvegardeAuto", data: { semaine: "2026-S46", at: "2026-11-09T10:00:00Z" } });';
    const f = await ouvrir(env, { avant: salons(dir) + deja });
    await pause(f, 1500);
    t.egal(deSauvegarde(f).length, 0, "une seule par semaine");
    const g = await ouvrir(env, { avant: salons(dir).replace("} };", "}, auto: { sauvegardes: false } };") });
    await pause(g, 1500);
    t.egal(deSauvegarde(g).length, 0, "rien si la publication est décochée");
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", avant: salons(dir) });
    await pause(i, 1500);
    t.egal(deSauvegarde(i).length, 0, "l'Inspection ne publie pas la sauvegarde");

    // 3. Restaurer un fichier compressé.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "sauvegarde-"));
    const sauvegarde = { format: "guichet-fiscal-sauvegarde", version: 1, exportedAt: "2026-11-09T10:00:00Z", totaux: { entreprises: 1, declarations: 0, demandes: 0 },
      collections: { entreprises: { essaiGz: { nom: "Entreprise du fichier compressé", statut: "active" } } } };
    const gz = path.join(dossier, "guichet-fiscal-sauvegarde-2026-11-09.json.gz");
    fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(sauvegarde)));
    await onglet(d, "reglages");
    await d.locator("#set-tab-sauvegardes").click(); await pause(d, 300);
    await d.locator("#b-file").setInputFiles(gz); await pause(d, 800);
    t.contient(texte(await d.locator("#dlg").innerText().catch(() => "")), "Restaurer 1 élément", "le fichier compressé s'ouvre pour la restauration");
    await d.locator("#dlg button", { hasText: "Annuler" }).click(); await pause(d, 300);
    const pasBon = path.join(dossier, "autre.json.gz");
    fs.writeFileSync(pasBon, zlib.gzipSync("pas une sauvegarde"));
    await d.locator("#b-file").setInputFiles(pasBon); await pause(d, 600);
    t.contient(texte(await d.locator("#b-msg").innerText()), "n’est pas une sauvegarde", "un autre fichier compressé est refusé");
    fs.rmSync(dossier, { recursive: true, force: true });
  },
};
