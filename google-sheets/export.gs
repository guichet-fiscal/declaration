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
      d.solde != null && d.solde !== "" ? d.solde : "", d.soldePreuve ? (d.soldePreuve.type === "lien" ? d.soldePreuve.url : "Capture dans le guichet") : "",
      d.mecenat ? Number(d.mecenat.montant) || 0 : "", d.compensation ? Number(d.compensation.montant) || 0 : ""];
  });
  ecrire("Déclarations", ["N°", "Entreprise", "Période", "Chiffre d’affaires", "Charges", "Masse salariale", "Salariés", "Résultat", "Impôt", "Cotisations", "Majoration", "Exonération", "Total calculé", "Montant retenu", "Encaissé", "Statut", "Retard", "Échéancier", "Déposée le", "Déclarant", "Observation", "Solde du compte déclaré", "Capture du solde", "Réduction des partenaires", "Compensation (contrats)"], declarations);

  ecrire("Entreprises", ["Nom", "Secteur", "Patron", "Active", "Ajoutée le"],
    col("entreprises").map(r => [r.data.nom, r.data.secteur || "", r.data.patron || "", r.data.actif === false ? "Non" : "Oui", date(r.data.createdAt)]));

  // Budget des services publics au mois, comme dans le guichet : le mois choisi à la saisie ; une demande
  // rattachée à une semaine (avant le passage au mois) va au mois du jeudi de cette semaine ; les plus
  // anciennes, au mois de leur accord ou de leur réception.
  const conf = (col("config").find(r => r.id === "main") || { data: {} }).data;
  const pad2 = n => String(n).padStart(2, "0");
  const semaineDe = iso => {
    const d = new Date(iso || Date.now());
    if (conf.periodicite === "mois") return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = t.getUTCFullYear();
    return y + "-S" + pad2(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7));
  };
  const moisDate = iso => { const d = new Date(iso || Date.now()); return d.getFullYear() + "-" + pad2(d.getMonth() + 1); };
  const moisDe = k => {
    if (!k) return "";
    if (/^\d{4}-\d{2}$/.test(k)) return k;
    const m = /^(\d{4})-S(\d{2})$/.exec(k);
    if (!m) return k;
    const j4 = new Date(Date.UTC(+m[1], 0, 4)), lundi = new Date(j4.getTime() - ((j4.getUTCDay() + 6) % 7) * 864e5 + (+m[2] - 1) * 7 * 864e5);
    const jeudi = new Date(lundi.getTime() + 3 * 864e5);
    return jeudi.getUTCFullYear() + "-" + pad2(jeudi.getUTCMonth() + 1);
  };
  const accorde = a => (a && (a.statut === "accordee" || a.statut === "partielle") ? Number(a.montantAccorde) || 0 : 0);
  const moisDem = (d, a) => d.periode ? moisDe(d.periode) : moisDate(accorde(a) && a.at ? a.at : d.recueAt || d.createdAt);
  const lignesDem = d => (Array.isArray(d.lignes) && d.lignes.length ? d.lignes : null);
  const env = {};
  const lignesArt = [];
  // Payes de la Préfecture : une demande « budget salaires » reprise dans une paye ne compte qu'une fois (par la paye).
  const payesV = col("payes").filter(r => r.data.statut === "versee");
  const repris = {}; payesV.forEach(r => { if (r.data.reprise && r.data.reprise.demandeId) repris[r.data.reprise.demandeId] = r.id; });
  ecrire("Demandes", ["N°", "Service", "Unité", "Nature", "Objet", "Mois", "Articles", "Demandé", "Urgence", "Statut", "Accordé", "Motif", "Reçue le", "Décidée le", "Bon de commande", "Demandeur"],
    col("demandes").map(r => {
      const d = r.data, a = arbitrages[r.id], st = a ? a.statut : "attente", k = moisDem(d, a), sv = d.service || "Autre", ls = lignesDem(d);
      const x = env[sv + "|" + k] = env[sv + "|" + k] || { service: sv, k: k, n: 0, demande: 0, accorde: 0, attente: 0 };
      x.n++; x.demande += Number(d.montant) || 0; if (!repris[r.id]) x.accorde += accorde(a); if (st === "attente" || st === "etude") x.attente += Number(d.montant) || 0;
      // Articles : une ligne par article, avec la décision article par article quand elle existe.
      const al = a && Array.isArray(a.lignes) ? a.lignes : [];
      (ls || [{ designation: d.objet || "Demande", quantite: 1, prixUnitaire: Number(d.montant) || 0 }]).forEach((l, i) => {
        const z = al[i] && String(al[i].designation) === String(l.designation) ? al[i] : null, pu = l.prixUnitaire == null || l.prixUnitaire === "" ? "" : Number(l.prixUnitaire);
        const zq = z ? Number(z.quantite) || 0 : "", zp = z && z.prixUnitaire != null ? Number(z.prixUnitaire) : "", etat = !z ? "" : !(zq > 0 && zp > 0) ? "Refusé" : (zq < (Number(z.quantiteDemandee) || 0) || (z.prixDemande != null && zp < Number(z.prixDemande))) ? "Réduit" : "Accordé";
        lignesArt.push([no("DM", r.id), sv, k, l.designation, Number(l.quantite) || 0, pu, pu === "" ? "" : (Number(l.quantite) || 0) * pu, zq, zp, z ? (zq || 0) * (zp || 0) : "", etat || STATUTS_DEM[st] || st, z && z.motif ? z.motif : ""]);
      });
      return [no("DM", r.id), d.service, d.unite || "", NATURES[d.nature] || d.nature, d.objet, k, ls ? ls.length : "", d.montant, d.urgence, STATUTS_DEM[st] || st,
        accorde(a), (a && a.commentaire ? a.commentaire : "") + (repris[r.id] ? (a && a.commentaire ? " · " : "") + "Reprise dans la paye " + repris[r.id] : ""), date(d.recueAt), a ? date(a.at) : "", d.reference || "", d.demandeur || ""];
    }));
  ecrire("Articles des demandes", ["Demande", "Service", "Mois", "Article", "Quantité demandée", "Prix demandé", "Total demandé", "Quantité accordée", "Prix retenu", "Accordé", "Décision", "Motif"], lignesArt);
  ecrire("Catalogue des prix", ["Article", "Catégorie", "Prix de référence", "Note", "Ajouté par", "Ajouté le"],
    col("catalogue").map(r => [r.data.designation, r.data.categorie || "", Number(r.data.prix) || 0, r.data.note || "", r.data.byNom || "", date(r.data.at)])
      .sort((x, y) => String(x[1]).localeCompare(String(y[1])) || String(x[0]).localeCompare(String(y[0]))));
  // Plafonds réglés mois par mois ; un mois sans plafonds propres reprend ceux du dernier mois réglé.
  // Tant qu'aucun mois n'est réglé, les anciens plafonds par semaine valent pour leur mois, × 4,33.
  const parMois = (() => {
    if (conf.enveloppesMois && typeof conf.enveloppesMois === "object") return conf.enveloppesMois;
    const out = {}, w = conf.enveloppesSemaines && typeof conf.enveloppesSemaines === "object" ? conf.enveloppesSemaines : {};
    Object.keys(w).sort().forEach(k => { if (!/-S\d{2}$/.test(k) || !w[k] || typeof w[k] !== "object") return; const caps = {}; Object.keys(w[k]).forEach(sv => { if (Number(w[k][sv]) > 0) caps[sv] = Math.round(Number(w[k][sv]) * 4.33); }); out[moisDe(k)] = caps; });
    return out;
  })();
  const plafondsDe = k => {
    if (parMois[k]) return parMois[k];
    const avant = Object.keys(parMois).filter(x => /^\d{4}-\d{2}$/.test(x) && x < k).sort().pop();
    return avant ? parMois[avant] : conf.enveloppes || {};
  };
  const plafond = (sv, k) => { const e = plafondsDe(k) || {}; const c = Object.keys(e).find(x => x.toLowerCase() === String(sv).toLowerCase()); return c ? Number(e[c]) || 0 : ""; };
  Object.keys(parMois).forEach(k => Object.keys(parMois[k] || {}).forEach(sv => { if (!env[sv + "|" + k]) env[sv + "|" + k] = { service: sv, k: k, n: 0, demande: 0, accorde: 0, attente: 0 }; }));
  // Achats sous contrat d'un service (hors achats financés par une demande) : une commande compte dès sa
  // signature sur le mois choisi, un marché à chaque paiement sur le mois du paiement.
  const envDe = (sv, k) => {
    const cle = Object.keys(env).find(x => x.toLowerCase() === (sv + "|" + k).toLowerCase());
    return cle ? env[cle] : (env[sv + "|" + k] = { service: sv, k: k, n: 0, demande: 0, accorde: 0, attente: 0 });
  };
  col("contrats").forEach(r => {
    const c = r.data, sv = c.acheteur && c.acheteur.type === "service" ? c.acheteur.service : "";
    if (!sv || c.demandeId || c.statut === "projet" || c.statut === "annule") return;
    if (c.type === "commande") { if (c.periode && c.statut !== "resilie") { const x = envDe(sv, moisDe(c.periode)); x.achete = (x.achete || 0) + (Number(c.montant) || 0); } }
    else (c.paiements || []).forEach(p => { const x = envDe(sv, moisDate(p.at)); x.achete = (x.achete || 0) + (Number(p.montant) || 0); });
  });
  // Payes versées : imputées sur l'enveloppe du service des payes, au mois de leur semaine.
  const payeConf = conf.payes && typeof conf.payes === "object" ? conf.payes : {}, svcPaye = payeConf.service || "Préfecture";
  const payeTot = d => (d.lignes || []).reduce((t, l) => t + (Number(l.verse) || 0), 0) + (d.rappels || []).reduce((t, x) => t + (Number(x.verse) || 0), 0) - (d.retenues || []).reduce((t, x) => t + (Number(x.retenu) || 0), 0);
  payesV.forEach(r => { const x = envDe(svcPaye, r.data.mois || moisDe(r.id)); x.payes = (x.payes || 0) + payeTot(r.data); });
  // Trop-perçus remboursés directement : rendus au budget du mois de la semaine concernée.
  const tropPercus = col("rappels").filter(r => r.data.origine === "retenue");
  tropPercus.forEach(r => { const rb = (r.data.remboursements || []).reduce((t, x) => t + (Number(x.montant) || 0), 0); if (rb) { const x = envDe(svcPaye, moisDe(r.data.semaine)); x.payes = (x.payes || 0) - rb; } });
  // Rappels versés à part (hors d'une paye) : comptés au mois de leur versement.
  col("rappels").forEach(r => { if (r.data.origine === "retenue") return; (r.data.aPart || []).forEach(a => { if (!a.le) return; const x = envDe(svcPaye, moisDate(a.le)); x.payes = (x.payes || 0) + (Number(a.montant) || 0); }); });
  ecrire("Enveloppes", ["Mois", "Service", "Demandes", "Demandé", "Accordé", "En attente", "Acheté sous contrat", "Payes versées", "Plafond", "Reste"],
    Object.keys(env).map(k => env[k]).sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : a.service.localeCompare(b.service)))
      .map(x => { const p = plafond(x.service, x.k), achete = x.achete || 0, py = x.payes || 0; return [x.k, x.service, x.n, x.demande, x.accorde, x.attente, achete, py, p, p === "" ? "" : p - x.accorde - achete - py]; }));

  // Payes des fonctionnaires, agent par agent, et rappels de salaire (dus ou versés).
  const lignesPaye = [], heures = h => Math.round((Number(h) || 0) * 100) / 100;
  payesV.slice().sort((a, b) => (a.id < b.id ? 1 : -1)).forEach(r => {
    const d = r.data, coef = d.coef == null ? 1 : Number(d.coef);
    (d.lignes || []).forEach(l => lignesPaye.push([r.id, d.mois || moisDe(r.id), l.nom || "", l.grade || "", l.heuresPointees == null ? "" : heures(l.heuresPointees), heures(l.heures), heures(l.heuresPayees), Number(l.taux) || 0, Number(l.brut) || 0, Number(l.verse) || 0, Math.max(0, (Number(l.brut) || 0) - (Number(l.verse) || 0)), coef, "Paye", date(d.verseeLe), d.verseeParNom || ""]));
    (d.rappels || []).forEach(x => lignesPaye.push([r.id, d.mois || moisDe(r.id), x.nom || "", "", "", "", "", "", Number(x.du) || 0, Number(x.verse) || 0, "", "", "Rappel de la semaine " + x.semaine, date(d.verseeLe), d.verseeParNom || ""]));
    (d.retenues || []).forEach(x => lignesPaye.push([r.id, d.mois || moisDe(r.id), x.nom || "", "", "", "", "", "", "", -(Number(x.retenu) || 0), "", "", "Trop-perçu retenu (semaine " + x.semaine + ")", date(d.verseeLe), d.verseeParNom || ""]));
  });
  ecrire("Payes", ["Semaine", "Mois", "Agent", "Grade", "Heures pointées", "Heures retenues", "Heures payées", "Taux horaire", "Paye due", "Versé", "Reste en rappel", "Prorata", "Nature", "Versée le", "Par"], lignesPaye);
  const docsRap = {}; col("rappels").forEach(r => { docsRap[r.id] = r.data; });
  const verseRap = {}; payesV.forEach(r => (r.data.rappels || []).forEach(x => { verseRap[x.rid] = (verseRap[x.rid] || 0) + (Number(x.verse) || 0); }));
  col("rappels").forEach(r => { if (r.data.origine === "retenue") return; (r.data.aPart || []).forEach(a => { verseRap[r.id] = (verseRap[r.id] || 0) + (Number(a.montant) || 0); }); });
  const lignesRap = [];
  payesV.forEach(r => (r.data.lignes || []).forEach(l => { const reste = Math.round((Number(l.brut) || 0) - (Number(l.verse) || 0)); if (reste <= 0) return; const id = "auto-" + r.id + "-" + l.fid, o = docsRap[id], v = verseRap[id] || 0;
    lignesRap.push([l.nom || "", r.id, "Prorata de la paye", reste, v, o && o.annule ? 0 : Math.max(0, reste - v), o && o.annule ? "Annulé" : reste - v <= 0 ? "Versé" : "Dû", date(r.data.verseeLe)]); }));
  col("rappels").forEach(r => { if (String(r.id).indexOf("auto-") === 0 || r.data.origine === "retenue") return; const d = r.data, m = Number(d.montant) || 0, v = verseRap[r.id] || 0;
    lignesRap.push([d.nom || "", d.semaine || "", d.motif || "", m, v, d.statut === "annule" ? 0 : Math.max(0, m - v), d.statut === "annule" ? "Annulé" : m - v <= 0 ? "Versé" : "Dû", date(d.at)]); });
  ecrire("Rappels de salaire", ["Agent", "Semaine concernée", "Motif", "Montant", "Versé", "Reste dû", "État", "Né le"], lignesRap);
  const retenuTp = {}; payesV.forEach(r => (r.data.retenues || []).forEach(x => { retenuTp[x.rid] = (retenuTp[x.rid] || 0) + (Number(x.retenu) || 0); }));
  ecrire("Trop-perçus", ["Agent", "Semaine concernée", "Motif", "Versé en trop", "Retenu sur les payes", "Remboursé", "Reste à retenir", "État", "Noté le"],
    tropPercus.map(r => { const d = r.data, m = Number(d.montant) || 0, rt = retenuTp[r.id] || 0, rb = (d.remboursements || []).reduce((t, x) => t + (Number(x.montant) || 0), 0), reste = d.statut === "annule" ? 0 : Math.max(0, m - rt - rb);
      return [d.nom || "", d.semaine || "", d.motif || "", m, rt, rb, reste, d.statut === "annule" ? "Annulé" : reste <= 0 ? "Régularisé" : "À retenir", date(d.at)]; }));
  ecrire("Pointages", ["Agent", "Compte Discord", "Début", "Fin", "Durée (h)", "Source", "Corrections", "Annulé"],
    col("pointages").map(r => { const d = r.data, a = d.debut ? new Date(d.debut) : null, b = d.fin ? new Date(d.fin) : null;
      return [d.nom || "", d.discordId || "", a || "", b || "en cours", a && b ? heures((b - a) / 3600e3) : "", d.source === "direction" ? "Saisi par la Direction" : "Pointeuse", (d.corrections || []).map(c => c.motif).join(" · "), d.annule ? "Oui" : ""]; })
      .sort((x, y) => (x[2] < y[2] ? 1 : -1)));

  const NATURES_PEN = { redressement: "Redressement fiscal", majoration: "Majoration pour paiement tardif", defaut: "Défaut de déclaration (semaine clôturée)", convocation: "Absence à une convocation" };
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
    "paiement:relance": "Relance de paiement", "paiement:mise_en_demeure": "Mise en demeure de payer", "echeance:rappel": "Rappel avant la date limite" };
  ecrire("Relances", ["N°", "Entreprise", "Type", "Périodes ou somme", "Envoyée le", "Délai", "Par", "Acte"],
    col("relances").map(r => { const med = r.data.niveau === "mise_en_demeure";
      return [no(med ? "MED" : "RL", r.id), r.data.entrepriseNom, r.data.type === "echeance" ? "Rappel avant la date limite" : r.data.type === "declaration" ? "Déclaration manquante" : "Impayé",
        r.data.type !== "paiement" ? (r.data.periodes || []).join(", ") : r.data.montant, date(r.data.at), date(r.data.echeance), r.data.byNom || "",
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

  ecrire("Relevés de compte", ["N°", "Entreprise", "Solde relevé", "Relevé le", "Agent", "Mouvements lus", "RIB", "Capture", "Observation"],
    col("releves").map(r => { const x = r.data; return [no("RC", r.id), x.entrepriseNom, x.montant, date(x.at), x.agent || "", (x.mouvements || []).length, x.rib || "", x.preuve ? (x.preuve.type === "lien" ? x.preuve.url : "Capture dans le guichet") : "", x.note || ""]; }));

  // Mouvements lus sur les relevés (un mouvement vu sur deux relevés apparaît deux fois).
  ecrire("Mouvements des comptes", ["Relevé", "Entreprise", "Date", "Libellé", "Montant"],
    col("releves").reduce((t, r) => t.concat((r.data.mouvements || []).map(m => [no("RC", r.id), r.data.entrepriseNom, date(m.t), m.libelle || "", Number(m.montant) || 0])), []));

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

  const MOTIFS_CV = { collecte: "Collecte des impôts", controle: "Contrôle fiscal", audition: "Audition", autre: "Autre motif" };
  const ETATS_CV = { convoquee: "Convoquée", honoree: "Honorée", absente: "Absence", annulee: "Annulée" };
  const QUALITES_CV = { patron: "Patron", coffre: "Personne ayant accès au coffre", representant: "Autre représentant" };
  ecrire("Convocations", ["N°", "Entreprise", "Motif", "Rendez-vous", "Lieu", "Convoqué", "À collecter", "Transporteur", "État", "Présent", "Qualité", "Collecté", "Sanction", "Convoquée par", "Le"],
    col("convocations").map(r => {
      const c = r.data, s = c.sanction || null;
      return [no("CV", r.id), c.entrepriseNom, c.motif === "autre" && c.objet ? c.objet : MOTIFS_CV[c.motif] || c.motif, date(c.date), c.lieu || "", c.convoque || "",
        c.motif === "collecte" ? c.montant : "", c.transporteurNom || "", (c.collecte && c.collecte.enCours ? "Encaissement en cours" : ETATS_CV[c.statut] || c.statut),
        c.presence ? c.presence.nom || "" : "", c.presence ? QUALITES_CV[c.presence.qualite] || "" : "", c.collecte && !c.collecte.enCours ? c.collecte.montant : "",
        s ? (s.dispense ? "Dispensée : " + (s.motif || "") : s.montant) : (c.statut === "absente" ? "À décider" : ""), c.byNom || "", date(c.at)];
    }));

  const TYPES_CT = { commande: "Commande", cadre: "Marché à prix unitaire" };
  const CATS_CT = { vehicules: "Véhicules", armement: "Armement", equipement: "Équipement", transport_fonds: "Transport de fonds", reparations: "Réparations et dépannage", services: "Prestations de services", autre: "Autre" };
  const ETATS_CT = { projet: "Projet", signe: "Signé", livre: "Livré, à payer", paye: "Payé", en_cours: "En cours", termine: "Terminé", resilie: "Résilié", annule: "Abandonné" };
  const acheteurCt = c => (c.acheteur && c.acheteur.type === "service" ? c.acheteur.service : "Préfecture (Trésor)");
  const payeCt = c => (c.paiements || []).reduce((t, p) => t + (Number(p.montant) || 0), 0);
  const lignesPaiementCt = [];
  ecrire("Contrats", ["N°", "Fournisseur", "Acheteur", "Type", "Catégorie", "Objet", "Montant", "Prix unitaire", "Unité", "Plafond", "Payé sur", "État", "Payé", "Préparé par", "Signé le", "Signé par", "Début", "Fin", "Livraison constatée le", "Résiliation"],
    col("contrats").map(r => {
      const c = r.data, cadre = c.type === "cadre", sv = c.acheteur && c.acheteur.type === "service" ? c.acheteur.service : "";
      (c.paiements || []).forEach((p, i) => lignesPaiementCt.push([no("CT", r.id) + "-" + (i + 1), no("CT", r.id), c.fournisseurNom || "", acheteurCt(c), p.montant, p.periode || semaineDe(p.at), date(p.at), p.mode === "impot" ? "Déduction sur ses impôts" : "Versement du Trésor", p.byNom || "",
        p.convocations || p.versements ? (function (n) { return n + " collecte" + (n > 1 ? "s" : ""); })((p.convocations || []).length + (p.versements || []).length) : cadre ? (p.quantite || 1) + " " + (c.unite || "prestation") + ((p.quantite || 1) > 1 ? "s" : "") : c.objet || "Commande", p.note || ""]));
      return [no("CT", r.id), c.fournisseurNom || "", acheteurCt(c), TYPES_CT[c.type] || c.type || "", CATS_CT[c.categorie] || c.categorie || "", c.objet || "",
        cadre ? "" : c.montant, cadre ? c.prixUnitaire : "", cadre ? c.unite || "" : "", cadre && c.plafond ? c.plafond : "",
        sv ? (c.demandeId ? "Demande " + no("DM", c.demandeId) : cadre ? "Enveloppe " + sv + " (mois du paiement)" : "Enveloppe " + sv + " · " + moisDe(c.periode || "")) : "Trésor",
        ETATS_CT[c.statut] || c.statut || "", payeCt(c), c.byNom || "", date(c.signeLe), c.signeParNom || "", date(c.debut), date(c.fin),
        c.livraison ? date(c.livraison.at) : "", c.resiliation ? (c.resiliation.livraisonRefusee ? "Livraison refusée : " : "") + (c.resiliation.motif || "") : ""];
    }));
  ecrire("Paiements des contrats", ["Ordre", "Contrat", "Bénéficiaire", "Acheteur", "Montant", "Semaine", "Payé le", "Mode", "Par", "Objet", "Observation"], lignesPaiementCt);

  const ETATS_CP = { projet: "Projet", signee: "Signée", resiliee: "Résiliée", annulee: "Abandonnée" };
  const ETATS_PS = { a_valider: "À valider", validee: "Validée", refusee: "Refusée", annulee: "Annulée" };
  const offertPs = x => Math.max(0, (Number(x.valeur) || 0) - (Number(x.paye) || 0));
  const prestations = col("prestations");
  ecrire("Conventions", ["N°", "Entreprise", "Objet", "Services", "Avantages", "Début", "Fin", "Réduction d’impôt", "Réduction par période", "État", "Prestations validées", "Offert", "Préparée par", "Signée le", "Signée par", "Signataire de l’entreprise", "Résiliation"],
    col("conventions").map(r => {
      const c = r.data, ps = prestations.filter(x => x.data.conventionId === r.id && x.data.statut === "validee"), fin = c.fin ? new Date(new Date(c.fin).getTime() + 864e5) : null;
      const etat = c.statut === "signee" && fin && fin < new Date() ? "Arrivée à terme" : ETATS_CP[c.statut] || c.statut || "";
      return [no("CP", r.id), c.entrepriseNom || "", c.objet || "", c.services && c.services.length ? c.services.join(", ") : "Tous les services publics",
        (c.avantages || []).map(a => a.prestation + " (" + (a.mode === "remise" ? "remise de " + a.valeur + " %" : a.mode === "tarif" ? "prix fixe de " + a.valeur : "gratuit") + ")").join(", "),
        date(c.debut), date(c.fin), !c.mecenat ? "Non" : Number(c.forfait) > 0 ? "Montant fixe" : (Number(c.taux) || 0) / 100, c.mecenat && Number(c.forfait) > 0 ? Number(c.forfait) : "", etat, ps.length, ps.reduce((t, x) => t + offertPs(x.data), 0),
        c.byNom || "", date(c.signeLe), c.signeParNom || "", c.signataire || "", c.resiliation ? c.resiliation.motif || "" : ""];
    }));
  ecrire("Prestations offertes", ["N°", "Convention", "Entreprise", "Service", "Date", "Prestation", "Détail", "Prix normal", "Payé", "Offert", "État", "Notée par", "Validée par", "Motif"],
    prestations.map(r => { const x = r.data;
      return [no("PS", r.id), no("CP", x.conventionId), x.entrepriseNom || "", x.service || "", date(x.date), x.prestation || "", x.objet || "", x.valeur, x.paye, offertPs(x),
        ETATS_PS[x.statut] || x.statut || "", x.byNom || "", x.valideParNom || "", x.motif || ""]; }));

  const ETATS_VA = { a_confirmer: "À confirmer", confirme: "Reçu au Trésor", refuse: "Refusé", annule: "Annulé" };
  const recuVa = x => (x.statut === "confirme" ? Number(x.montantRecu != null ? x.montantRecu : x.montant) || 0 : 0);
  const versements = col("versements");
  const convoisPayes = {};
  col("contrats").forEach(r => (r.data.paiements || []).forEach(p => (p.versements || []).forEach(id => { convoisPayes[id] = true; })));
  ecrire("Amendes versées", ["N°", "Service", "Semaine", "Somme annoncée", "Somme reçue", "Écart", "Explication", "Nombre d’amendes", "Bordereau", "Transporteur", "Convoyeur", "Remis par", "Arrivé le", "État", "Noté par", "Reçu par", "Reçu le", "Convoi payé", "Motif"],
    versements.map(r => { const x = r.data, recu = recuVa(x);
      return [no("VA", r.id), x.service || "", x.periode || "", x.montant, x.statut === "confirme" ? recu : "", x.statut === "confirme" ? recu - (Number(x.montant) || 0) : "", x.motifEcart || "",
        x.nbAmendes || "", x.bordereau || "", x.transporteurNom || "", x.convoyeur || "", x.remisPar || "", date(x.date), ETATS_VA[x.statut] || x.statut || "",
        x.byNom || "", x.confirmeParNom || "", date(x.confirmeLe), x.transporteurId && x.statut === "confirme" ? (convoisPayes[r.id] ? "Oui" : "Non") : "", x.motif || ""]; }));

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
    ["Véhicules requalifiés", col("vehicules").filter(r => r.data.statut === "requalifie").length],
    ["Convocations à venir", col("convocations").filter(r => r.data.statut === "convoquee").length],
    ["Collectes encaissées", col("convocations").filter(r => r.data.collecte && !r.data.collecte.enCours).reduce((t, r) => t + (Number(r.data.collecte.montant) || 0), 0)],
    ["Contrats signés", col("contrats").filter(r => ["signe", "livre", "paye", "en_cours", "termine", "resilie"].indexOf(r.data.statut) >= 0 && r.data.signeLe).length],
    ["Projets de contrat à signer", col("contrats").filter(r => r.data.statut === "projet").length],
    ["Payé au titre des contrats", col("contrats").reduce((t, r) => t + payeCt(r.data), 0)],
    ["Dû aux entreprises, à déduire de leurs impôts", Math.max(0, col("contrats").reduce((t, r) => t + (r.data.paiements || []).filter(p => p.mode === "impot").reduce((u, p) => u + (Number(p.montant) || 0), 0), 0)
      - col("declarations").filter(r => !(decisions[r.id] && decisions[r.id].statut === "rejetee")).reduce((t, r) => t + (r.data.compensation ? Number(r.data.compensation.montant) || 0 : 0), 0))],
    ["Conventions de partenariat signées", col("conventions").filter(r => ["signee", "resiliee"].indexOf(r.data.statut) >= 0).length],
    ["Offert aux services publics (prestations validées)", prestations.filter(r => r.data.statut === "validee").reduce((t, r) => t + offertPs(r.data), 0)],
    ["Prestations à valider", prestations.filter(r => r.data.statut === "a_valider").length],
    ["Amendes reçues au Trésor", versements.reduce((t, r) => t + recuVa(r.data), 0)],
    ["Versements d’amendes à confirmer", versements.filter(r => r.data.statut === "a_confirmer").length],
    ["Réductions d’impôt des partenaires (avis)", col("declarations").filter(r => !(decisions[r.id] && decisions[r.id].statut === "rejetee")).reduce((t, r) => t + (r.data.mecenat ? Number(r.data.mecenat.montant) || 0 : 0), 0)]
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
