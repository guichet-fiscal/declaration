/**
 * Guichet fiscal : copie automatique du registre dans Google Sheets.
 *
 * Installation (une fois) :
 *  1. Dans une feuille Google Sheets appartenant au serveur : Extensions → Apps Script.
 *  2. Remplacez tout le contenu par ce fichier, puis enregistrez.
 *  3. Rechargez la feuille : un menu « Guichet fiscal » apparaît.
 *  4. Menu Guichet fiscal → Enregistrer la clé d’export (clé créée dans le guichet, Réglages).
 *  5. Menu Guichet fiscal → Actualiser maintenant (Google demande alors l’autorisation).
 *  6. Menu Guichet fiscal → Actualisation automatique : chaque heure, ou chaque lundi.
 *
 * Après une mise à jour de ce fichier dans le dépôt, recollez-le dans Apps Script puis enregistrez.
 *
 * La clé d’export reste dans les propriétés du script : elle n’apparaît pas dans la feuille.
 */

// Adresse et clé publique du projet Supabase (les mêmes que dans config.js du site).
const SUPABASE_URL = "https://xdmhnymirvozmgddmgir.supabase.co";
const SUPABASE_KEY = "sb_publishable_nKgcY29nHjw4sc9rccVjYw_jmM08Izt";

const STATUTS_DECL = { soumise: "À valider", validee: "À payer", payee: "Payée", controle: "En contrôle", rejetee: "Rejetée" };
const STATUTS_DEM = { attente: "En attente", etude: "À l’étude", accordee: "Accordée", partielle: "Accordée en partie", refusee: "Refusée" };
const STATUTS_PEN = { due: "À payer", payee: "Payée", annulee: "Annulée" };
const NATURES = { vehicule: "Véhicule", equipement: "Équipement & moyens", salaires: "Budget salaires", fonctionnement: "Fonctionnement", autre: "Autre" };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Guichet fiscal")
    .addItem("Actualiser maintenant", "actualiser")
    .addSeparator()
    .addItem("Enregistrer la clé d’export", "enregistrerCle")
    .addItem("Actualisation automatique : chaque heure", "planifierChaqueHeure")
    .addItem("Actualisation automatique : chaque lundi", "planifierChaqueLundi")
    .addItem("Arrêter l’actualisation automatique", "arreterPlanification")
    .addToUi();
}

function enregistrerCle() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Clé d’export", "Collez la clé créée dans le guichet (Réglages → Sauvegardes et export → Suivi dans Google Sheets).", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const cle = r.getResponseText().trim();
  if (!cle) { ui.alert("Aucune clé saisie."); return; }
  PropertiesService.getScriptProperties().setProperty("CLE_EXPORT", cle);
  ui.alert("Clé enregistrée. Lancez maintenant « Actualiser maintenant ».");
}

function planifierChaqueHeure() {
  arreterPlanification();
  ScriptApp.newTrigger("actualiser").timeBased().everyHours(1).create();
  SpreadsheetApp.getActive().toast("La feuille se mettra à jour chaque heure.", "Guichet fiscal");
}

function planifierChaqueLundi() {
  arreterPlanification();
  ScriptApp.newTrigger("actualiser").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  SpreadsheetApp.getActive().toast("La feuille se mettra à jour chaque lundi vers 7 h.", "Guichet fiscal");
}

function arreterPlanification() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "actualiser")
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function actualiser() {
  const cle = PropertiesService.getScriptProperties().getProperty("CLE_EXPORT");
  if (!cle) throw new Error("Clé d’export manquante : menu Guichet fiscal → Enregistrer la clé d’export.");
  if (SUPABASE_KEY.indexOf("COLLEZ") === 0) throw new Error("Renseignez SUPABASE_KEY en haut du script (clé publique du projet).");
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/export_registre", {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_KEY },
    payload: JSON.stringify({ p_cle: cle }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("Export refusé (" + res.getResponseCode() + ") : " + res.getContentText().slice(0, 300));
  const data = JSON.parse(res.getContentText());
  const reg = data.registre || [];
  const col = name => reg.filter(r => r.collection === name);
  const map = name => { const o = {}; col(name).forEach(r => { o[r.id] = r.data; }); return o; };
  const decisions = map("decisions"), arbitrages = map("arbitrages"), echeanciers = map("echeanciers");
  const no = (p, id) => p + "-" + String(id).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  const date = iso => (iso ? new Date(iso) : "");

  const declarations = col("declarations").map(r => {
    const d = r.data, dec = decisions[r.id], st = dec ? dec.statut : "soumise", e = echeanciers[r.id];
    const montant = dec && dec.montant != null ? dec.montant : d.total;
    let encaisse = st === "payee" ? montant : 0;
    if (st === "validee" && e && e.echeances) encaisse = e.echeances.filter(x => x.payee).reduce((s, x) => s + (x.montant || 0), 0);
    const exo = d.exoneration ? (d.exoneration.montantIS || 0) + (d.exoneration.montantCot || 0) : 0;
    return [no("DF", r.id), d.entrepriseNom, d.periode, d.ca, d.charges, d.masse, d.nbSalaries, d.resultat, d.impot, d.cotisations, d.majoration, exo, d.total, montant, encaisse,
      STATUTS_DECL[st] || st, d.enRetard ? "Oui" : "Non", e && e.echeances ? e.echeances.length + " fois" : "", date(d.depotAt), d.declarant || "", dec && dec.note ? dec.note : "",
      d.solde != null && d.solde !== "" ? d.solde : "", d.soldePreuve ? (d.soldePreuve.type === "lien" ? d.soldePreuve.url : "Capture dans le guichet") : ""];
  });
  ecrire("Déclarations", ["N°", "Entreprise", "Période", "Chiffre d’affaires", "Charges", "Masse salariale", "Salariés", "Résultat", "Impôt", "Cotisations", "Majoration", "Exonération", "Total calculé", "Montant retenu", "Encaissé", "Statut", "Retard", "Échéancier", "Déposée le", "Déclarant", "Observation", "Solde du compte déclaré", "Capture du solde"], declarations);

  ecrire("Entreprises", ["Nom", "Secteur", "Patron", "Active", "Ajoutée le"],
    col("entreprises").map(r => [r.data.nom, r.data.secteur || "", r.data.patron || "", r.data.actif === false ? "Non" : "Oui", date(r.data.createdAt)]));

  ecrire("Demandes", ["N°", "Service", "Nature", "Objet", "Quantité", "Demandé", "Urgence", "Statut", "Accordé", "Motif", "Reçue le", "Décidée le"],
    col("demandes").map(r => {
      const d = r.data, a = arbitrages[r.id], st = a ? a.statut : "attente";
      return [no("DM", r.id), d.service, NATURES[d.nature] || d.nature, d.objet, d.quantite || "", d.montant, d.urgence, STATUTS_DEM[st] || st,
        a && (st === "accordee" || st === "partielle") ? a.montantAccorde : 0, a && a.commentaire ? a.commentaire : "", date(d.recueAt), a ? date(a.at) : ""];
    }));

  const NATURES_PEN = { redressement: "Redressement fiscal", majoration: "Majoration pour paiement tardif", defaut: "Défaut de déclaration (semaine clôturée)" };
  ecrire("Pénalités", ["N°", "Entreprise", "Motif", "Montant", "Statut", "Infligée le", "Payée le", "Nature"],
    col("penalites").map(r => [no(r.data.type === "redressement" ? "AMR" : "PN", r.id), r.data.entrepriseNom, r.data.motif, r.data.montant, STATUTS_PEN[r.data.statut] || r.data.statut,
      date(r.data.createdAt), date(r.data.paidAt), NATURES_PEN[r.data.type] || "Pénalité"]));

  const lignesSal = [];
  col("declarations").forEach(r => {
    const d = r.data, sal = (d.detail && d.detail.salaries) || [];
    sal.forEach((x, i) => lignesSal.push([no("DF", r.id), d.entrepriseNom, d.periode, x.nom || "Salarié " + (i + 1), x.salaire, x.cotisation, x.taux / 100]));
  });
  ecrire("Salaires", ["Déclaration", "Entreprise", "Période", "Salarié", "Salaire", "Cotisation", "Taux effectif"], lignesSal);

  const lignesEch = [];
  col("echeanciers").forEach(r => (r.data.echeances || []).forEach(x => lignesEch.push([no("DF", r.id), r.data.entrepriseNom, x.n + "/" + r.data.echeances.length, date(x.date), x.montant, x.payee ? "Payée" : "À payer", date(x.paidAt)])));
  ecrire("Échéanciers", ["Déclaration", "Entreprise", "Échéance", "Date limite", "Montant", "État", "Payée le"], lignesEch);

  const NIVEAUX = { "declaration:relance": "Rappel de déclaration", "declaration:mise_en_demeure": "Mise en demeure de déclarer",
    "paiement:relance": "Relance de paiement", "paiement:mise_en_demeure": "Mise en demeure de payer" };
  ecrire("Relances", ["N°", "Entreprise", "Type", "Périodes ou somme", "Envoyée le", "Délai", "Par", "Acte"],
    col("relances").map(r => { const med = r.data.niveau === "mise_en_demeure";
      return [no(med ? "MED" : "RL", r.id), r.data.entrepriseNom, r.data.type === "declaration" ? "Déclaration manquante" : "Impayé",
        r.data.type === "declaration" ? (r.data.periodes || []).join(", ") : r.data.montant, date(r.data.at), date(r.data.echeance), r.data.byNom || "",
        NIVEAUX[r.data.type + ":" + (r.data.niveau || "relance")] || "Relance"]; }));

  const SAISIES = { satd: "Saisie à tiers détenteur", vente: "Saisie-vente des biens" };
  const STATUTS_SAISIE = { notifiee: "Notifiée", executee: "Exécutée", levee: "Mainlevée" };
  ecrire("Saisies", ["N°", "Entreprise", "Nature", "Tiers ou biens", "Somme saisie", "État", "Notifiée le", "Versement attendu le", "Exécutée le", "Recouvré", "Mise en demeure", "Par"],
    col("saisies").map(r => { const x = r.data;
      return [no("SA", r.id), x.entrepriseNom, SAISIES[x.type] || x.type, x.type === "vente" ? (x.biens || x.tiers || "") : (x.tiers || ""), x.montant,
        STATUTS_SAISIE[x.statut] || x.statut, date(x.at), date(x.echeance), date(x.executeeLe || x.leveeLe), x.recouvre || 0, x.medNo || "", x.byNom || ""]; }));

  const STATUTS_TJ = { transmis: "Transmis", saisie: "Saisie effectuée", condamnation: "Condamnation prononcée", regle: "Dette réglée", classe: "Classé sans suite" };
  const QUALIFS = { impaye: "Défaut de paiement", fraude: "Fraude fiscale", travail: "Travail dissimulé", opposition: "Opposition au contrôle", insolvabilite: "Organisation d’insolvabilité" };
  const MESURES = { saisie_comptes: "Saisie des comptes", saisie_biens: "Saisie des biens", fermeture: "Fermeture administrative", poursuites: "Poursuites pénales", interdiction: "Interdiction de gérer" };
  ecrire("Justice", ["N°", "Entreprise", "Dirigeant", "Somme à recouvrer", "Qualification", "Mesures sollicitées", "Destinataire", "Transmis le", "Par", "État", "Dernière suite", "Dénonciation obligatoire"],
    col("transmissions").map(r => { const t = r.data, s = (t.suites || [])[(t.suites || []).length - 1];
      return [no("TJ", r.id), t.entrepriseNom, t.patron || "", t.montant, (t.qualifs || []).map(q => QUALIFS[q] || q).join(", "), (t.mesures || []).map(m => MESURES[m] || m).join(", "),
        t.destinataire || "", date(t.at), t.byNom || "", STATUTS_TJ[t.statut] || t.statut, s ? (s.note || STATUTS_TJ[s.statut] || "") : "", t.denonciation ? "Oui" : "Non"]; }));

  ecrire("Attestations", ["N°", "Entreprise", "Délivrée le", "Valable jusqu’au", "État", "Par", "Motif de révocation"],
    col("attestations").map(r => { const a = r.data, now = new Date();
      return [no("AT", r.id), a.entrepriseNom, date(a.at), date(a.validUntil), a.revoqueeLe ? "Révoquée" : new Date(a.validUntil) > now ? "Valable" : "Expirée", a.byNom || "", a.motifRevocation || ""]; }));

  const CSTAT = { ouvert: "Instruction en cours", propose: "Proposition notifiée", recouvre: "Mis en recouvrement", sans_suite: "Classé sans suite" };
  const QUALIF = { bonne_foi: "Bonne foi", manquement: "Manquement délibéré (40 %)", fraude: "Manœuvres frauduleuses (80 %)", opposition: "Opposition au contrôle (100 %)" };
  ecrire("Contrôles", ["N°", "Entreprise", "Périodes", "Origine", "Inspecteur", "Statut", "Ouvert le", "Qualification", "Droits rappelés", "Majoration", "Total", "Pièces", "Conclusion"],
    col("controles").map(r => { const c = r.data;
      const pen = c.penaliteId ? col("penalites").find(x => x.id === c.penaliteId) : null;
      const etat = c.statut === "recouvre" && pen && pen.data.statut === "payee" ? "Soldé" : c.statut === "recouvre" && pen && pen.data.statut === "annulee" ? "Dégrevé" : CSTAT[c.statut] || c.statut;
      return [no("CF", r.id), c.entrepriseNom, (c.periodes || []).join(", "), c.origine || "", c.inspecteur || "", etat, date(c.ouvertLe), QUALIF[c.qualification] || "",
        c.droits || 0, c.majoration || 0, c.total || 0, (c.pieces || []).length, c.conclusion || ""]; }));

  ecrire("Clôtures", ["Période", "Clôturée le", "Par", "Déclarations déposées", "Attendues", "Montant des avis", "Encaissé à la clôture", "Reste à recouvrer"],
    col("clotures").map(r => { const b = r.data.bilan || {}; return [r.id, date(r.data.at), r.data.byNom || "", b.deposees, b.attendues, b.declare, b.encaisse, b.reste]; }));

  ecrire("Relevés de compte", ["N°", "Entreprise", "Solde relevé", "Relevé le", "Agent", "Capture", "Observation"],
    col("releves").map(r => { const x = r.data; return [no("RC", r.id), x.entrepriseNom, x.montant, date(x.at), x.agent || "", x.preuve ? (x.preuve.type === "lien" ? x.preuve.url : "Capture dans le guichet") : "", x.note || ""]; }));

  ecrire("Soupçons", ["N°", "Entreprise", "Sommes en cause", "Transmise le", "Par", "Périodes", "Faits"],
    col("soupcons").map(r => { const x = r.data; return [no("DS", r.id), x.entrepriseNom, x.montant, date(x.at), x.byNom || "", (x.ecarts || []).map(e => e.periode + " : +" + e.ecart).join(", "), x.faits || ""]; }));

  const OBJETS_PRET = { vehicule: "Achat de véhicule", local: "Local ou immobilier", stock: "Stock et matériel", tresorerie: "Trésorerie", autre: "Autre" };
  const STATUTS_PRET = { demande: "Demande", en_cours: "En cours", rembourse: "Remboursé", refuse: "Refusé", annule: "Annulé" };
  const lignesPret = [];
  ecrire("Prêts", ["N°", "Entreprise", "Objet", "Précision", "Capital", "Taux", "Échéances", "Total à rembourser", "Remboursé", "Reste dû", "Statut", "Demandé le", "Versé le", "Par", "Justificatif", "Exigibilité anticipée", "Motif"],
    col("prets").map(r => { const p = r.data, ech = p.echeances || [], verse = p.statut === "en_cours" || p.statut === "rembourse";
      const tot = ech.reduce((s, x) => s + (x.montant || 0), 0), paye = ech.filter(x => x.payee).reduce((s, x) => s + (x.montant || 0), 0);
      ech.forEach(x => lignesPret.push([no("PR", r.id), p.entrepriseNom, x.n + "/" + ech.length, date(x.date), x.montant, x.capital || 0, x.interets || 0, x.payee ? (x.anticipe ? "Payée (anticipé)" : "Payée") : "À payer", date(x.paidAt), x.note || ""]));
      return [no("PR", r.id), p.entrepriseNom, OBJETS_PRET[p.objet] || p.objet || "", p.precision || "", p.montant || 0, (p.taux || 0) / 100, ech.length, tot, verse ? paye : 0, verse ? Math.max(0, tot - paye) : 0,
        STATUTS_PRET[p.statut] || p.statut, date(p.demandeLe), date(p.verseLe), p.verseParNom || p.demandeParNom || "",
        p.justificatif ? (p.justificatif.preuve && p.justificatif.preuve.type === "lien" ? p.justificatif.preuve.url : "Fourni")
          : p.objet === "vehicule" && col("vehicules").some(x => x.data.pretId === r.id && x.data.facture && (x.data.statut === "service" || x.data.statut === "vendu")) ? "Véhicule au registre"
          : p.justifRequis ? "Attendu" : "Non exigé",
        date(p.exigibleLe), p.exigibleMotif || p.refusMotif || p.motifDemande || ""]; }));
  const CATS_VEH = { utilitaire: "Utilitaire ou fourgon", poids_lourd: "Poids lourd ou engin", service: "Véhicule de service", berline: "Berline ou citadine", suv: "SUV ou 4×4", moto: "Moto ou deux-roues", sportive: "Sportive", prestige: "Prestige ou supercar", aerien: "Hélicoptère ou avion", nautique: "Bateau" };
  const STATUTS_VEH = { service: "En service", vendu: "Vendu", requalifie: "Requalifié (véhicule personnel du dirigeant)", saisi: "Saisi" };
  const CONSTATS_VEH = { conforme: "Usage conforme", perso: "Usage personnel", conducteur: "Conducteur non autorisé", autre: "Autre irrégularité" };
  const lignesConstat = [];
  ecrire("Véhicules", ["N°", "Plaque", "Entreprise", "Modèle", "Catégorie", "Prix", "Acheté le", "Concession", "Usage", "Conducteurs autorisés", "Facture", "Dans les charges", "Déclaré par", "Statut", "Validé par la Direction", "Requalifié le", "À rembourser", "Remboursé le", "Vendu le", "Prix de vente", "Acheteur"],
    col("vehicules").map(r => { const v = r.data, rq = v.requalification || {}, vt = v.vente || {};
      (v.constats || []).forEach(x => lignesConstat.push([no("VS", r.id), v.plaque, v.entrepriseNom, date(x.at), x.lieu || "", x.agent || "", x.conducteur || "", CONSTATS_VEH[x.type] || x.type || "", x.note || ""]));
      return [no("VS", r.id), v.plaque, v.entrepriseNom, v.modele || "", CATS_VEH[v.categorie] || v.categorie || "", v.prix || 0, date(v.achatLe), v.concession || "", v.usage || "", (v.conducteurs || []).join(", "),
        v.facture ? (v.facture.type === "lien" ? v.facture.url : "Capture dans le guichet") : "Attendue", v.dansCharges ? "Oui" : "Non",
        { entreprise: "Entreprise", concession: "Concession", police: "Constat de police", agent: "Agent" }[v.source] || "Entreprise", STATUTS_VEH[v.statut] || v.statut || "",
        v.validation ? v.validation.motif || "Oui" : "", date(rq.at), rq.montant || "", date(rq.rembourseLe), date(vt.at), vt.prix != null ? vt.prix : "", vt.acheteur ? vt.acheteur + (vt.dirigeant ? " (dirigeant ou proche)" : "") : ""]; }));
  ecrire("Contrôles de police", ["Véhicule", "Plaque", "Entreprise", "Date", "Lieu", "Agent", "Conducteur", "Constat", "Observations"], lignesConstat);

  ecrire("Remboursements de prêts", ["Prêt", "Entreprise", "Échéance", "Date limite", "Montant", "Dont capital", "Dont intérêts", "État", "Payée le", "Note"], lignesPret);

  ecrire("Journal", ["Date", "Auteur", "Action", "Type", "Dossier"],
    (data.journal || []).map(j => [date(j.at), j.auteur || "", j.action, j.collection, j.doc_id]));

  ecrire("Résumé", ["Élément", "Valeur"], [
    ["Dernière actualisation", new Date(data.genere_le)],
    ["Entreprises", col("entreprises").length],
    ["Déclarations", declarations.length],
    ["Demandes de moyens", col("demandes").length],
    ["Pénalités", col("penalites").length],
    ["Relances", col("relances").length],
    ["Attestations délivrées", col("attestations").length],
    ["Semaines clôturées", col("clotures").length],
    ["Contrôles fiscaux", col("controles").length],
    ["Saisies", col("saisies").length],
    ["Dossiers transmis à la justice", col("transmissions").length],
    ["Relevés de compte", col("releves").length],
    ["Déclarations de soupçon", col("soupcons").length],
    ["Prêts accordés", col("prets").filter(r => r.data.statut === "en_cours" || r.data.statut === "rembourse").length],
    ["Demandes de prêt en attente", col("prets").filter(r => r.data.statut === "demande").length],
    ["Véhicules de société en service", col("vehicules").filter(r => r.data.statut === "service").length],
    ["Véhicules requalifiés", col("vehicules").filter(r => r.data.statut === "requalifie").length]
  ]);
}

function ecrire(nom, entete, lignes) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(nom) || ss.insertSheet(nom);
  sh.clearContents();
  const valeurs = [entete].concat(lignes.map(l => l.map(v => (v === null || v === undefined ? "" : v))));
  sh.getRange(1, 1, valeurs.length, entete.length).setValues(valeurs);
  sh.getRange(1, 1, 1, entete.length).setFontWeight("bold");
  sh.setFrozenRows(1);
}
