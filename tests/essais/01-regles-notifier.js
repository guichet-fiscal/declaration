// Règles du service d'envoi (supabase/functions/notifier/regles.ts) : textes et destinataires.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { RACINE } = require("../outils");

module.exports = {
  nom: "Règles des notifications et des rappels",
  async lancer(env, t) {
    // regles.ts est du JavaScript simple : copié en .mjs pour l'importer sans outil de compilation.
    const f = path.join(os.tmpdir(), `regles-${process.pid}.mjs`);
    fs.copyFileSync(path.join(RACINE, "supabase/functions/notifier/regles.ts"), f);
    const R = await import(pathToFileURL(f).href);
    const now = new Date().toISOString();
    const foncs = new Map([["f1", { nom: "Alice", discordId: "111111111111111111" }], ["f2", { nom: "Bruno", discordId: "222222222222222222" }]]);

    // Message de l'encadrement : notification à l'agent, mention Discord sans le contenu.
    let r = R.personnel({ collection: "messagesAgents", id: "m", action: "INSERT", apres: { fid: "f1", de: "equipe", auteur: "Direction", texte: "Contenu privé", at: now } }, { foncs, site: "https://x/" });
    t.egal(r.agents[0].fids, ["f1"], "message : notification à l'agent concerné");
    t.ok(!r.discord[0].texte.includes("Contenu privé"), "message : le contenu ne part pas sur Discord");
    t.egal(r.discord[0].users, ["111111111111111111"], "message : l'agent est mentionné");
    // Sanction : pas de détail dans la notification.
    r = R.personnel({ collection: "messagesAgents", id: "m", action: "INSERT", apres: { fid: "f1", de: "equipe", texte: "Blâme pour…", sanction: "s1", at: now } }, { foncs });
    t.ok(!r.agents[0].msg.body.includes("Blâme"), "sanction : le motif n'apparaît pas dans la notification");
    // Rôle réglé sous la forme <@&ID>.
    r = R.personnel({ collection: "notesService", id: "n", action: "INSERT", apres: { titre: "Tenue", at: now } }, { foncs, rolePersonnel: "<@&123456789012345678>" });
    t.egal(r.discord[0].roles, ["123456789012345678"], "note de service : rôle des fonctionnaires réduit à son identifiant");
    // Paye versée : net par agent, retenues déduites.
    r = R.personnel({ collection: "payes", id: "2026-S45", action: "UPDATE", avant: { statut: "preparation" }, apres: { statut: "versee", lignes: [{ fid: "f1", verse: 61000 }], retenues: [{ fid: "f1", retenu: 1000 }] } }, { foncs });
    t.contient(r.agents[0].parFid.f1.body, "60 000 €", "paye : montant net versé à l'agent");

    // Rappels au choix, pas de 5 minutes.
    const pas = 300e3, t0 = Date.parse("2026-11-12T19:00:00Z");
    const ev = (id, debut, extra) => ({ collection: "agenda", id, data: Object.assign({ titre: "Réunion " + id, debut, audience: "tous", statut: "prevu" }, extra || {}) });
    const prefs = new Map([["f1", { defaut_min: 60, evenements: {} }], ["f2", { defaut_min: 30, evenements: { e3: 1440, e4: null } }], ["f3", { defaut_min: null, evenements: { e2: 30 } }]]);
    const res = R.rappelsChoisis([ev("e1", "2026-11-12T20:00:00Z"), ev("e2", "2026-11-12T19:30:00Z"), ev("e3", "2026-11-13T19:00:00Z"),
      ev("e4", "2026-11-12T20:00:00Z", { audience: "agents", participants: ["f2"] }), ev("e5", "2026-11-12T20:00:00Z", { statut: "annule" }),
      ev("e6", "2026-11-12T20:00:00Z", { reponses: { f1: { r: "non" } } })], ["f1", "f2", "f3", "f4"], prefs, t0, pas);
    const par = Object.fromEntries(res.map((x) => [x.msg.tag, x.fids]));
    t.egal(par["ag-rappel-e1"], ["f1", "f4"], "rappel habituel d'une heure (et 1 h par défaut sans réglage)");
    t.egal(par["ag-rappel-e2"], ["f2", "f3"], "rappel de 30 minutes, habituel ou propre au rendez-vous");
    t.egal(par["ag-rappel-e3"], ["f2"], "rappel la veille");
    t.ok(!par["ag-rappel-e4"] && !par["ag-rappel-e5"], "pas de rappel refusé ni pour un rendez-vous annulé");
    t.egal(par["ag-rappel-e6"], ["f4"], "pas de rappel pour qui a répondu « Absent »");
    const perso = R.rappelsPersoChoisis([{ id: "p1", fid: "f1", titre: "Notaire", debut: "2026-11-12T19:10:00Z", rappel_min: 10, journee: false },
      { id: "p2", fid: "f1", titre: "Trop tôt", debut: "2026-11-12T19:20:00Z", rappel_min: 10, journee: false }], t0, pas);
    t.egal(perso.map((x) => x.msg.tag), ["perso-p1"], "agenda personnel : rappel 10 minutes avant, au bon passage");
    fs.unlinkSync(f);
  },
};
