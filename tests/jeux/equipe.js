// Jeu d’essai « équipe » : trois fiches (Alice, Bruno, Directeur Test), payes S44 à S46, contrat, messages,
// rendez-vous, note de service et absence. Noms inventés.
window.__SEED = [
  { collection: "config", id: "main", data: { budgetInitial: 80000000 } },
  { collection: "fonctionnaires", id: "f1", data: { nom: "Alice MARTIN", grade: "Agent administratif", discordId: "111111111111111111", actif: true, at: "2026-10-10T10:00:00Z" } },
  { collection: "fonctionnaires", id: "f2", data: { nom: "Bruno LEROY", grade: "Agent administratif", discordId: "222222222222222222", actif: true, at: "2026-10-10T10:00:00Z" } },
  { collection: "fonctionnaires", id: "f4", data: { nom: "Directeur Test", grade: "Agent administratif", discordId: "999999999999999999", actif: true, at: "2026-10-10T10:00:00Z" } },
  { collection: "payes", id: "2026-S44", data: { semaine: "2026-S44", statut: "versee", verseeLe: "2026-11-02T10:00:00Z", coef: 1, lignes: [
      { fid: "f1", nom: "Alice MARTIN", grade: "Agent administratif", taux: 3500, heures: 9, heuresPayees: 9, salaire: 31500, prime: 0, brut: 31500, verse: 31500, reste: 0 },
      { fid: "f2", nom: "Bruno LEROY", grade: "Agent administratif", taux: 3500, heures: 4, heuresPayees: 4, salaire: 14000, prime: 0, brut: 14000, verse: 14000, reste: 0 }], rappels: [], retenues: [] } },
  { collection: "payes", id: "2026-S45", data: { semaine: "2026-S45", statut: "versee", verseeLe: "2026-11-09T10:00:00Z", coef: 1, lignes: [
      { fid: "f1", nom: "Alice MARTIN", grade: "Agent administratif", taux: 3500, heures: 16, heuresPayees: 16, salaire: 56000, prime: 5000, primeNom: "Présence haute", primeSeuil: 15, brut: 61000, verse: 61000, reste: 0 }],
      rappels: [{ rid: "r1", fid: "f1", nom: "Alice MARTIN", semaine: "2026-S44", verse: 3500, du: 3500 }], retenues: [] } },
  { collection: "payes", id: "2026-S46", data: { semaine: "2026-S46", statut: "preparation", saisie: { f1: { heures: 11.5 }, f2: { heures: 6 } } } },
  { collection: "rappels", id: "r1", data: { fid: "f1", nom: "Alice MARTIN", semaine: "2026-S44", heures: 1, montant: 3500, statut: "verse", motif: "Heure oubliée", at: "2026-11-05T09:00:00Z" } },
  { collection: "contratsTravail", id: "c1", data: { fid: "f1", nom: "Alice MARTIN", ref: "CT-ABC123", type: "CDI", signeLe: "2026-11-10", priseFonctions: "2026-10-10", poste: "Agent administratif", taux: 3500, heures: 20, horaires: "21H – 23H", essai: "Une semaine", statut: "signe", salarieSigneLe: "2026-11-10", at: "2026-11-10T10:00:00Z", modele: {} } },
  { collection: "messagesAgents", id: "m1", data: { fid: "f1", nom: "Alice MARTIN", de: "equipe", auteur: "Directeur Test", auteurRole: "direction", texte: "Bonjour Alice, pensez à signaler vos absences de la semaine prochaine.", at: "2026-11-10T18:00:00Z", luAgent: false } },
  { collection: "messagesAgents", id: "m2", data: { fid: "f2", nom: "Bruno LEROY", de: "agent", auteur: "Bruno LEROY", texte: "Bonsoir, mes heures de la semaine 45 me semblent fausses.", at: "2026-11-10T19:30:00Z", luEquipe: false } },
  { collection: "agenda", id: "e1", data: { titre: "Réunion de service", type: "reunion", debut: "2026-11-12T20:00:00Z", fin: "2026-11-12T21:00:00Z", lieu: "Préfecture, salle 2", description: "Point sur la tablette et les heures.", audience: "tous", participants: [], reponseDemandee: true, reponses: {}, statut: "prevu", at: "2026-11-10T10:00:00Z", byNom: "Directeur Test" } },
  { collection: "agenda", id: "e2", data: { titre: "Point encadrement", type: "reunion", debut: "2026-11-13T20:00:00Z", fin: "2026-11-13T21:00:00Z", audience: "encadrement", participants: [], reponseDemandee: false, statut: "prevu", at: "2026-11-10T10:00:00Z" } },
  { collection: "notesService", id: "n1", data: { titre: "Nouvelles heures de service", texte: "À partir de cette semaine, les heures se relèvent sur la tablette en jeu.\nMerci de prévenir de vos absences dans votre espace.", epinglee: true, at: "2026-11-10T09:00:00Z", auteur: "Directeur Test" } },
  { collection: "absences", id: "a1", data: { fid: "f2", nom: "Bruno LEROY", du: "2026-11-14", au: "2026-11-16", motif: "Examens", statut: "signalee", par: "agent", auteur: "Bruno LEROY", at: "2026-11-10T12:00:00Z" } }
];
