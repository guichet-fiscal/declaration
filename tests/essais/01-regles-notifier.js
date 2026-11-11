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
    // Mise à jour 36 : demandes, entretiens, contrat signé par l'agent.
    const ctx36 = { foncs: new Map([["f1", { nom: "Alice", discordId: "111111111111111111" }]]), site: "https://x/" };
    const at36 = new Date().toISOString();
    const dmd = R.personnel({ collection: "demandesAgents", id: "da1", action: "INSERT", apres: { fid: "f1", nom: "Alice", type: "conge", objet: "Repos", du: "2026-11-20", au: "2026-11-21", statut: "envoyee", at: at36 } }, ctx36);
    t.ok(dmd && dmd.equipe && dmd.equipe.type === "personnel" && /Congé : Repos/.test(dmd.equipe.body) && dmd.discord[0].canal === "direction", "demande d'un agent : encadrement et salon Direction", JSON.stringify(dmd));
    const rep = R.personnel({ collection: "demandesAgents", id: "da1", action: "UPDATE", avant: { fid: "f1", statut: "envoyee" }, apres: { fid: "f1", type: "conge", objet: "Repos", statut: "refusee", reponse: "Effectif trop juste" } }, ctx36);
    t.ok(rep && rep.agents[0].type === "a_message" && rep.agents[0].msg.title === "Demande refusée" && /Effectif/.test(rep.agents[0].msg.body), "réponse : notification à l'agent");
    t.ok(rep && rep.discord[0].canal === "personnel" && !/refus|❌/i.test(rep.discord[0].texte) && rep.discord[0].users[0] === "111111111111111111", "réponse : mention sur Discord sans dire le résultat");
    t.egal(R.personnel({ collection: "demandesAgents", id: "da1", action: "UPDATE", avant: { statut: "envoyee" }, apres: { fid: "f1", statut: "annulee" } }, ctx36), null, "demande annulée par l'agent : rien");
    const ent = R.personnel({ collection: "entretiens", id: "en1", action: "UPDATE", avant: { statut: "brouillon" }, apres: { fid: "f1", type: "recadrage", statut: "partage" } }, ctx36);
    t.ok(ent && ent.agents[0].fids[0] === "f1" && !/recadrage/i.test(ent.discord[0].texte), "entretien partagé : l'agent est prévenu, sans le type sur Discord");
    t.egal(R.personnel({ collection: "entretiens", id: "en1", action: "INSERT", apres: { fid: "f1", statut: "brouillon" } }, ctx36), null, "entretien en brouillon : rien");
    const com = R.personnel({ collection: "entretiens", id: "en1", action: "UPDATE", avant: { statut: "partage", commentaireAgent: "" }, apres: { fid: "f1", nom: "Alice", type: "suivi", statut: "partage", commentaireAgent: "Merci" } }, ctx36);
    t.ok(com && com.equipe && /Merci/.test(com.equipe.body), "commentaire de l'agent : l'encadrement est prévenu");
    const sig = R.personnel({ collection: "contratsTravail", id: "ct1", action: "UPDATE", avant: { statut: "a_signer" }, apres: { nom: "Alice", statut: "signe", signeParAgent: true } }, ctx36);
    t.ok(sig && sig.equipe && sig.discord[0].canal === "direction", "contrat signé par l'agent : encadrement et salon Direction");
    t.egal(R.personnel({ collection: "contratsTravail", id: "ct1", action: "UPDATE", avant: { statut: "a_signer" }, apres: { statut: "signe" } }, ctx36), null, "contrat signé par les RH : rien");
    // Échéances du personnel : durée d'essai lue dans le contrat, une semaine avant et le jour même.
    t.egal(["Une semaine", "15 jours", "deux semaines", "1 mois", "Période d’essai : 3 jours renouvelable", "à voir"].map(R.essaiJours), [7, 15, 14, 30, 3, null], "durée d'essai lue dans le texte du contrat");
    const rowsE = [
      { collection: "fonctionnaires", id: "f1", data: { nom: "Alice" } },
      { collection: "fonctionnaires", id: "f2", data: { nom: "Bruno" } },
      { collection: "fonctionnaires", id: "f3", data: { nom: "Chloé", essai: { statut: "concluant" } } },
      { collection: "contratsTravail", id: "c1", data: { fid: "f1", priseFonctions: "2026-11-10", essai: "Une semaine", at: "2026-11-10T10:00:00Z" } },
      { collection: "contratsTravail", id: "c2", data: { fid: "f2", priseFonctions: "2026-10-01", essai: "1 mois", type: "CDD", fin: "2026-11-24", at: "2026-10-01T10:00:00Z" } },
      { collection: "contratsTravail", id: "c3", data: { fid: "f3", priseFonctions: "2026-11-10", essai: "Une semaine", at: "2026-11-10T10:00:00Z" } },
      { collection: "entretiens", id: "e1", data: { fid: "f1", objectifs: [{ texte: "Relevés", echeance: "2026-11-17", etat: "en_cours" }, { texte: "Fait", echeance: "2026-11-17", etat: "atteint" }] } }];
    const h17 = Date.parse("2026-11-17T09:30:00Z");
    const ech = R.echeancesPersonnel(rowsE, h17 - 3600e3, h17, "https://x/");
    t.ok(ech && ech.equipe.type === "personnel" && /Fin de la période d’essai de Alice aujourd’hui/.test(ech.discord.texte) && /Fin du CDD de Bruno dans une semaine/.test(ech.discord.texte) && /Objectif de Alice à échéance aujourd’hui : Relevés/.test(ech.discord.texte), "fin d'essai le jour même, fin de CDD une semaine avant, objectif du jour", JSON.stringify(ech));
    t.ok(ech && !/Chloé/.test(ech.discord.texte) && !/Fait/.test(ech.discord.texte), "ni essai déjà concluant, ni objectif atteint");
    t.egal(R.echeancesPersonnel(rowsE, h17, h17 + 3600e3, ""), null, "rien en dehors de l'heure du rappel");
    // Lundi soir : heures de la semaine passée pas encore saisies.
    t.egal([R.semaineDe(Date.parse("2026-11-16T19:00:00Z")), R.semaineDe(Date.parse("2026-11-15T23:30:00Z")), R.semaineDe(Date.parse("2026-11-15T22:30:00Z")), R.semaineDe(Date.parse("2027-01-01T12:00:00Z"))],
      ["2026-S47", "2026-S47", "2026-S46", "2026-S53"], "semaine ISO comptée à Paris (lundi 0 h 30 à Paris = semaine suivante, dimanche 23 h 30 = encore la semaine)");
    const foncsL = new Map([["f1", { nom: "Alice" }], ["f2", { nom: "Bob" }], ["f3", { nom: "Chloé", actif: false }]]);
    const lundi = Date.parse("2026-11-16T19:00:00Z");
    const l1 = R.heuresLundi([{ id: "2026-S46", data: { saisie: { f1: { heures: 12 }, f2: { heures: "" } } } }], foncsL, lundi, "https://x/");
    t.ok(l1 && /Bob/.test(l1.push.body) && !/Alice|Chloé/.test(l1.push.body) && l1.push.type === "delais", "lundi : seul l'agent en service sans heures est signalé", JSON.stringify(l1));
    t.ok(l1 && l1.discord.canal === "direction" && l1.discord.auto === "alertesEquipe" && /semaine 46/.test(l1.discord.texte), "lundi : message au salon de la Direction");
    t.egal(R.heuresLundi([{ id: "2026-S46", data: { statut: "versee" } }], foncsL, lundi, ""), null, "lundi : rien si la paye est versée");
    t.egal(R.heuresLundi([{ id: "2026-S46", data: { saisie: { f1: { heures: 3 }, f2: { heures: 0 } } } }], foncsL, lundi, ""), null, "lundi : rien si chacun a ses heures (0 compris)");
    t.egal(R.heuresLundi([], foncsL, Date.parse("2026-11-09T19:00:00Z"), ""), null, "lundi : rien pour les semaines de la pointeuse");
    fs.unlinkSync(f);
  },
};
