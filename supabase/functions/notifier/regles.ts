// @ts-nocheck : fonctions pures écrites en JavaScript simple.
// Guichet fiscal : quelles notifications envoyer, et avec quel texte.
// Fonctions pures (aucun accès au réseau ni à la base) : testables à part.

export const TYPES = ["declaration", "paiement", "demande", "pret", "controle", "vehicule", "convocation", "contrat", "versement", "delais"];

const NF = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (n) => NF.format(Math.round(Number(n) || 0)).replace(/\s/g, " ") + " €";
const no = (p, id) => p + "-" + String(id || "").replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
function periode(k) {
  let m = /^(\d{4})-S(\d{2})$/.exec(k || "");
  if (m) return "semaine " + Number(m[2]);
  m = /^(\d{4})-(\d{2})$/.exec(k || "");
  const mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return m ? mois[Number(m[2]) - 1] + " " + m[1] : String(k || "");
}
const CONSTATS = { perso: "usage personnel", conducteur: "conducteur non autorisé", autre: "irrégularité" };
const MOTIFS = { collecte: "collecte des impôts", controle: "contrôle fiscal", audition: "audition", autre: "convocation" };
const heure = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", " h ") : ""; };
const recent = (iso, jours) => { const t = new Date(iso || 0).getTime(); return Number.isFinite(t) && Date.now() - t < jours * 864e5; };

// Un changement du registre → au plus une notification { type, title, body, url, tag }.
// ctx.declaration : la déclaration liée à un avis (pour nommer l'entreprise).
export function evenement(e, ctx) {
  const c = e.collection, id = e.id, ins = e.action === "INSERT";
  const b = e.avant || {}, n = e.apres || {};
  ctx = ctx || {};
  switch (c) {
    case "declarations":
      // Une sauvegarde restaurée réinsère d'anciennes déclarations : on ne prévient que des dépôts récents.
      if (ins && recent(n.depotAt || n.createdAt, 2)) return { type: "declaration", title: "Déclaration à valider", body: `${n.entrepriseNom || "Entreprise"} · ${periode(n.periode)} · ${money(n.total)}${n.enRetard ? " · en retard" : ""}`, url: `#ouvrir=declarations/${id}`, tag: "decl-" + id };
      return null;
    case "decisions":
      if (n.statut === "payee" && b.statut !== "payee" && !ins) {
        const d = ctx.declaration || {};
        return { type: "paiement", title: "Paiement encaissé", body: `${d.entrepriseNom || no("DF", id)} · ${d.periode ? periode(d.periode) + " · " : ""}${money(n.montant)}`, url: `#ouvrir=declarations/${id}`, tag: "paie-" + id };
      }
      return null;
    case "penalites":
      if (n.statut === "payee" && b.statut !== "payee" && !ins) return { type: "paiement", title: "Pénalité encaissée", body: `${n.entrepriseNom || "Entreprise"} · ${n.motif || "pénalité"} · ${money(n.montant)}`, url: `#ouvrir=penalites/${id}`, tag: "pen-" + id };
      return null;
    case "demandes":
      if (ins && recent(n.recueAt || n.createdAt, 2)) return { type: "demande", title: "Demande de moyens", body: `${n.service || "Service"} · ${n.objet || "demande"} · ${money(n.montant)}`, url: `#ouvrir=demandes/${id}`, tag: "dem-" + id };
      return null;
    case "prets":
      if (n.statut === "demande" && b.statut !== "demande") return { type: "pret", title: "Demande de prêt à examiner", body: `${n.entrepriseNom || "Entreprise"} · ${money(n.montant)}${n.precision ? " · " + n.precision : ""}`, url: `#ouvrir=prets/${id}`, tag: "pret-" + id };
      return null;
    case "controles": {
      const r = n.reponse || {}, r0 = b.reponse || {};
      if (r.at && r.at !== r0.at) return { type: "controle", title: "Réponse au contrôle fiscal", body: `${n.entrepriseNom || "Entreprise"} ${r.position === "accepte" ? "accepte" : r.position === "conteste" ? "conteste" : "a répondu à"} ${no("CF", id)}`, url: `#ouvrir=controles/${id}`, tag: "ctrl-" + id };
      const T = { propose: "Proposition de rectification notifiée", recouvre: "Contrôle mis en recouvrement", sans_suite: "Contrôle classé sans suite" };
      if (!ins && n.statut !== b.statut && T[n.statut]) return { type: "controle", title: T[n.statut], body: `${n.entrepriseNom || "Entreprise"} · ${no("CF", id)}${n.total ? " · " + money(n.total) : ""}`, url: `#ouvrir=controles/${id}`, tag: "ctrl-" + id };
      return null;
    }
    case "convocations": {
      const motif = n.motif === "autre" && n.objet ? n.objet : MOTIFS[n.motif] || "convocation";
      if (!ins && n.statut === "absente" && b.statut !== "absente") return { type: "convocation", title: "Absence à une convocation", body: `${n.entrepriseNom || "Entreprise"} · ${motif} · ${no("CV", id)} : sanction à décider`, url: `#ouvrir=convocations/${id}`, tag: "conv-" + id };
      if (!ins && n.motif === "collecte" && n.statut === "honoree" && b.statut !== "honoree" && !n.collecte) return { type: "convocation", title: "Collecte à encaisser", body: `${n.entrepriseNom || "Entreprise"} · ${money(n.montant)} · ${no("CV", id)}`, url: `#ouvrir=convocations/${id}`, tag: "conv-" + id };
      return null;
    }
    case "contrats":
      // Un projet préparé (souvent par l'Inspection) attend la signature de la Direction.
      if (ins && n.statut === "projet" && recent(n.at, 2)) {
        const prix = n.type === "cadre" ? `${money(n.prixUnitaire)} par ${n.unite || "prestation"}` : money(n.montant);
        const pour = n.acheteur && n.acheteur.type === "service" ? n.acheteur.service : "Préfecture";
        return { type: "contrat", title: "Projet de contrat à signer", body: `${n.fournisseurNom || "Fournisseur"} · ${pour} · ${n.objet ? n.objet + " · " : ""}${prix}`, url: `#ouvrir=contrats/${id}`, tag: "ct-" + id };
      }
      return null;
    case "conventions":
      if (ins && n.statut === "projet" && recent(n.at, 2)) return { type: "contrat", title: "Projet de convention à signer", body: `${n.entrepriseNom || "Entreprise"} · ${n.services && n.services.length ? n.services.join(", ") : "tous les services publics"}${n.objet ? " · " + n.objet : ""}`, url: `#ouvrir=conventions/${id}`, tag: "cp-" + id };
      return null;
    case "prestations":
      // Notée par l'Inspection, la prestation attend la validation de la Direction.
      if (ins && n.statut === "a_valider" && recent(n.at, 2)) return { type: "contrat", title: "Prestation offerte à valider", body: `${n.entrepriseNom || "Entreprise"} · ${n.service || "service public"}${n.objet ? " · " + n.objet : ""} · ${money(Math.max(0, (Number(n.valeur) || 0) - (Number(n.paye) || 0)))} offerts`, url: `#ouvrir=prestations/${id}`, tag: "ps-" + id };
      return null;
    case "versements":
      // Noté par l'Inspection à l'arrivée du convoi, le versement attend la confirmation de la Direction.
      if (ins && n.statut === "a_confirmer" && recent(n.at, 2)) return { type: "versement", title: "Versement d’amendes à confirmer", body: `${n.service || "Service"} · ${periode(n.periode)} · ${money(n.montant)}${n.transporteurNom ? " · convoi " + n.transporteurNom : ""}`, url: `#ouvrir=versements/${id}`, tag: "va-" + id };
      return null;
    case "vehicules": {
      const nc = n.constats || [], oc = b.constats || [];
      if (nc.length > oc.length) {
        const x = nc[nc.length - 1] || {};
        if (x.type && x.type !== "conforme") return { type: "vehicule", title: "Contrôle de police défavorable", body: `${n.plaque || "Véhicule"} · ${n.entrepriseNom || ""} · ${CONSTATS[x.type] || "irrégularité"}`, url: `#ouvrir=vehicules/${id}`, tag: "veh-" + id };
      }
      if (ins && n.source && n.source !== "entreprise") return { type: "vehicule", title: "Véhicule non déclaré", body: `${n.plaque || "Véhicule"} · ${n.entrepriseNom || ""} · signalé par ${n.source === "police" ? "la police" : n.source === "concession" ? "la concession" : "un agent"}`, url: `#ouvrir=vehicules/${id}`, tag: "veh-" + id };
      if (!ins && n.statut === "requalifie" && b.statut !== "requalifie") return { type: "vehicule", title: "Véhicule requalifié", body: `${n.plaque || "Véhicule"} · ${n.entrepriseNom || ""} · véhicule personnel du dirigeant`, url: `#ouvrir=vehicules/${id}`, tag: "veh-" + id };
      return null;
    }
  }
  return null;
}

// Délais expirés entre « depuis » et « maintenant » (millisecondes) : mises en demeure, réponses
// aux contrôles, avis devenus exigibles, échéances de prêt. rows : lignes du registre.
export function delais(rows, depuis, maintenant) {
  const by = (col) => rows.filter((r) => r.collection === col);
  const conf = (rows.find((r) => r.collection === "config" && r.id === "main") || { data: {} }).data || {};
  const payMs = (Number(conf.delaiPaiementJours ?? 2) || 0) * 864e5;
  const inWin = (t) => { const x = new Date(t || 0).getTime(); return Number.isFinite(x) && x > depuis && x <= maintenant; };
  const decl = new Map(by("declarations").map((r) => [r.id, r.data || {}]));
  const out = [];
  for (const r of by("relances")) { const x = r.data || {}; if (x.niveau === "mise_en_demeure" && inWin(x.echeance)) out.push(`${no("MED", r.id)} · ${x.entrepriseNom || ""} : délai de la mise en demeure ${x.type === "declaration" ? "de déclarer" : "de payer"} expiré`); }
  for (const r of by("controles")) { const x = r.data || {}; if (x.statut === "propose" && inWin(x.delaiReponse)) out.push(`${no("CF", r.id)} · ${x.entrepriseNom || ""} : délai de réponse au contrôle expiré`); }
  for (const r of by("decisions")) { const x = r.data || {}; if (x.statut === "validee" && x.at && inWin(new Date(x.at).getTime() + payMs)) { const d = decl.get(r.id) || {}; out.push(`${no("DF", r.id)} · ${d.entrepriseNom || ""} : avis de ${money(x.montant)} désormais exigible`); } }
  for (const r of by("prets")) { const x = r.data || {}; if (x.statut === "en_cours") for (const e of x.echeances || []) if (!e.payee && inWin(e.date)) out.push(`${no("PR", r.id)} · ${x.entrepriseNom || ""} : échéance ${e.n}/${(x.echeances || []).length} non payée`); }
  // Rendez-vous de l'heure qui vient (le passage horaire précédent ne les a pas encore annoncés).
  const proche = (t) => { const x = new Date(t || 0).getTime(); return Number.isFinite(x) && x > maintenant && x <= maintenant + (maintenant - depuis); };
  for (const r of by("conventions")) { const x = r.data || {}; if (x.statut === "signee" && x.fin && inWin(new Date(x.fin).getTime() + 864e5)) out.push(`${no("CP", r.id)} · ${x.entrepriseNom || ""} : convention de partenariat arrivée à terme`); }
  for (const r of by("convocations")) { const x = r.data || {}; if (x.statut === "convoquee" && proche(x.date)) out.push(`${no("CV", r.id)} · ${x.entrepriseNom || ""} : ${x.motif === "autre" && x.objet ? x.objet : MOTIFS[x.motif] || "convocation"} à ${heure(x.date)}`); }
  if (!out.length) return null;
  return { type: "delais", title: out.length === 1 ? "Délai à surveiller" : `${out.length} délais à surveiller`, body: out.slice(0, 4).join("\n") + (out.length > 4 ? `\n+ ${out.length - 4} autre${out.length - 4 > 1 ? "s" : ""}` : ""), url: "#recouvrement", tag: "delais-" + Math.floor(maintenant / 36e5) };
}

// ---------------------------------------------------------------------------------------------------
// Personnel de la Préfecture (mises à jour 30 à 32) : messages, agenda, notes de service, absences, payes.
// Un changement → { agents, equipe, discord } :
//  - agents : notifications aux fonctionnaires concernés, { fids (null = tous), type, msg } ou
//    { type, parFid: { fid: msg } } quand chacun reçoit un texte à lui (sa paye) ;
//  - equipe : une notification à l'encadrement (type « personnel ») ;
//  - discord : messages pour le salon des alertes du personnel (« personnel ») ou de la Direction
//    (« direction »), avec les mentions. Jamais le contenu d'un message ni d'une sanction.
// ctx.foncs : Map fid → { nom, discordId, actif } ; ctx.site : adresse du guichet ; ctx.rolePersonnel : rôle Discord.
export const TYPES_AGENTS = ["a_message", "a_agenda", "a_note", "a_paye", "a_absence"];
export const COLLECTIONS_PERSONNEL = ["messagesAgents", "agenda", "notesService", "absences", "payes"];
const court = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const TZ = "Europe/Paris";
function jour(k) {
  const d = new Date(String(k || "") + "T12:00:00Z");
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }) : String(k || "");
}
const periodeAbs = (a) => a.du === a.au ? `le ${jour(a.du)}` : `du ${jour(a.du)} au ${jour(a.au)}`;
function quand(ev) {
  const d = new Date(ev.debut || 0);
  if (!Number.isFinite(d.getTime())) return "";
  const j = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return ev.journee ? j : `${j} à ${heure(ev.debut)}`;
}
const pour = (ev) => (ev.audience === "agents" ? (Array.isArray(ev.participants) ? ev.participants : []) : null);

export function personnel(e, ctx) {
  const c = e.collection, id = e.id, ins = e.action === "INSERT";
  const b = e.avant || {}, n = e.apres || {};
  ctx = ctx || {};
  const foncs = ctx.foncs || new Map(), site = ctx.site || "";
  const did = (fid, x) => (x && x.discordId) || (foncs.get(fid) || {}).discordId || "";
  // Le rôle est réglé au guichet sous la forme <@&ID> : on n'en garde que l'identifiant.
  const rolePersonnel = (String(ctx.rolePersonnel || "").match(/\d{15,21}/) || [""])[0];
  const out = { agents: [], equipe: null, discord: [] };
  const lien = (h) => site ? ` ${site}${h}` : "";
  switch (c) {
    case "messagesAgents": {
      if (!ins || !recent(n.at, 2)) return null;
      if (n.de === "equipe") {
        out.agents.push({ fids: [n.fid], type: "a_message", msg: { title: "Message de l’encadrement", body: n.sanction ? "Une décision de l’encadrement vous concerne : à lire dans votre espace." : `${n.auteur || "L’encadrement"} : ${court(n.texte, 140)}`, url: "#espace", tag: "msg-" + n.fid } });
        const u = did(n.fid, n);
        if (u) out.discord.push({ canal: "personnel", auto: "alertesAgents", texte: `<@${u}> 📩 Vous avez un nouveau message de l’encadrement. À lire dans votre espace :${lien("#espace")}`, users: [u] });
      } else if (n.de === "agent") {
        out.equipe = { type: "personnel", title: `Message de ${n.nom || "un fonctionnaire"}`, body: court(n.texte, 160), url: "#personnel", tag: "msg-equipe-" + n.fid };
        out.discord.push({ canal: "direction", auto: "alertesEquipe", texte: `📨 **${n.nom || "Un fonctionnaire"}** a écrit à l’encadrement. À lire dans Personnel → Messagerie :${lien("#personnel")}` });
      }
      return out;
    }
    case "agenda": {
      const cible = pour(n), annule = n.statut === "annule" && b.statut !== "annule", deplace = !ins && n.statut !== "annule" && (n.debut !== b.debut);
      if (ins && (!recent(n.at, 2) || n.statut === "annule")) return null;
      if (!ins && !annule && !deplace) return null;
      const titre = ins ? "Nouveau rendez-vous" : annule ? "Rendez-vous annulé" : "Rendez-vous déplacé";
      const corps = `${n.titre || "Rendez-vous"} · ${quand(n)}${n.lieu && !annule ? " · " + n.lieu : ""}`;
      if (n.audience === "encadrement") { out.equipe = { type: "personnel", title: titre + " (encadrement)", body: corps, url: "#personnel", tag: "ag-" + id }; return out; }
      out.agents.push({ fids: cible, type: "a_agenda", msg: { title: titre, body: corps, url: "#espace", tag: "ag-" + id } });
      const users = (cible || []).map((f) => did(f)).filter(Boolean);
      const role = !cible ? rolePersonnel : "";
      const tete = users.length ? users.map((u) => `<@${u}>`).join(" ") + " " : role ? `<@&${role}> ` : "";
      const texte = ins
        ? `${tete}📅 Nouveau rendez-vous : **${n.titre || "Rendez-vous"}**, ${quand(n)}${n.lieu ? ", " + n.lieu : ""}. ${n.reponseDemandee ? "Dites dans votre espace si vous serez présent" : "Les détails sont dans votre espace"} :${lien("#espace")}`
        : annule ? `${tete}❌ Rendez-vous annulé : **${n.titre || "Rendez-vous"}**, prévu ${quand(n)}.`
        : `${tete}🔁 Rendez-vous déplacé : **${n.titre || "Rendez-vous"}**, désormais ${quand(n)}${n.lieu ? ", " + n.lieu : ""}.${lien("#espace")}`;
      out.discord.push({ canal: "personnel", auto: "alertesAgents", texte, users, roles: role ? [role] : [] });
      return out;
    }
    case "notesService": {
      if (!ins || n.retiree || !recent(n.at, 2)) return null;
      out.agents.push({ fids: null, type: "a_note", msg: { title: "Note de service", body: n.titre || "Nouvelle note de service", url: "#espace", tag: "note-" + id } });
      const role = rolePersonnel;
      out.discord.push({ canal: "personnel", auto: "alertesAgents", texte: `${role ? `<@&${role}> ` : ""}📌 Nouvelle note de service : **${n.titre || "Note de service"}**. À lire dans votre espace :${lien("#espace")}`, roles: role ? [role] : [] });
      return out;
    }
    case "absences": {
      if (ins && !recent(n.at, 2)) return null;
      if (ins && n.par === "agent") {
        out.equipe = { type: "personnel", title: `Absence signalée · ${n.nom || "fonctionnaire"}`, body: `${periodeAbs(n)}${n.motif ? " · " + court(n.motif, 80) : ""}`, url: "#personnel", tag: "abs-" + id };
        out.discord.push({ canal: "direction", auto: "alertesEquipe", texte: `🗓️ **${n.nom || "Un fonctionnaire"}** signale une absence ${periodeAbs(n)}. Personnel → Absences :${lien("#personnel")}` });
        return out;
      }
      if (ins && n.par === "equipe" && !n.sanction) { out.agents.push({ fids: [n.fid], type: "a_absence", msg: { title: "Absence enregistrée", body: `${periodeAbs(n)}${n.auteur ? " · par " + n.auteur : ""}`, url: "#espace", tag: "abs-" + id } }); return out; }
      if (!ins && n.statut === "prise_en_compte" && b.statut === "signalee") { out.agents.push({ fids: [n.fid], type: "a_absence", msg: { title: "Absence prise en compte", body: `${periodeAbs(n)}${n.priseEnComptePar ? " · par " + n.priseEnComptePar : ""}`, url: "#espace", tag: "abs-" + id } }); return out; }
      if (!ins && n.statut === "annulee" && b.statut !== "annulee" && n.annuleePar !== "agent" && !n.sanction) { out.agents.push({ fids: [n.fid], type: "a_absence", msg: { title: "Absence annulée par l’encadrement", body: periodeAbs(n), url: "#espace", tag: "abs-" + id } }); return out; }
      return null;
    }
    case "payes": {
      if (ins || n.statut !== "versee" || b.statut === "versee") return null;
      const net = new Map();
      for (const l of n.lignes || []) net.set(l.fid, (net.get(l.fid) || 0) + (Number(l.verse) || 0));
      for (const r of n.rappels || []) if (Number(r.verse) > 0) net.set(r.fid, (net.get(r.fid) || 0) + Number(r.verse));
      for (const r of n.retenues || []) if (Number(r.retenu) > 0) net.set(r.fid, (net.get(r.fid) || 0) - Number(r.retenu));
      const parFid = {};
      for (const [fid, v] of net) if (v > 0) parFid[fid] = { title: "Paye versée", body: `${periode(id).replace(/^s/, "S")} : ${money(v)} versés. Le bulletin est dans votre espace.`, url: "#espace", tag: "paye-" + id };
      if (!Object.keys(parFid).length) return null;
      out.agents.push({ type: "a_paye", parFid });
      const users = [...new Set(Object.keys(parFid).map((fid) => did(fid, (n.lignes || []).find((l) => l.fid === fid))).filter(Boolean))];
      out.discord.push({ canal: "personnel", auto: "alertesAgents", texte: `💶 La paye de la ${periode(id)} est versée.${users.length ? " " + users.map((u) => `<@${u}>`).join(" ") : ""} Le détail et le bulletin sont dans votre espace :${lien("#espace")}`, users });
      return out;
    }
  }
  return null;
}

// Rendez-vous de l'heure qui vient, pour les fonctionnaires concernés (sauf ceux qui ont répondu « non »).
export function rappelsAgenda(rows, depuis, maintenant) {
  const out = [], fin = maintenant + (maintenant - depuis);
  for (const r of rows) {
    if (r.collection !== "agenda") continue;
    const x = r.data || {}, t = new Date(x.debut || 0).getTime();
    if (x.statut === "annule" || x.journee || x.audience === "encadrement" || !Number.isFinite(t) || t <= maintenant || t > fin) continue;
    const non = Object.entries(x.reponses || {}).filter(([, v]) => v && v.r === "non").map(([k]) => k);
    out.push({ fids: pour(x), exclure: non, type: "a_agenda", msg: { title: "Rendez-vous dans moins d’une heure", body: `${x.titre || "Rendez-vous"} à ${heure(x.debut)}${x.lieu ? " · " + x.lieu : ""}`, url: "#espace", tag: "ag-rappel-" + r.id } });
  }
  return out;
}

// Événements de l'agenda personnel (mise à jour 34) qui commencent dans l'heure qui vient, rappel demandé :
// une notification au seul fonctionnaire qui l'a noté. rows : lignes de la table agenda_perso.
export function rappelsPerso(rows, depuis, maintenant) {
  const fin = maintenant + (maintenant - depuis);
  return (rows || []).filter((p) => {
    const t = new Date(p.debut || 0).getTime();
    return p.rappel && !p.journee && p.fid && Number.isFinite(t) && t > maintenant && t <= fin;
  }).map((p) => ({ fid: p.fid, type: "a_agenda", msg: { title: "Dans moins d’une heure", body: `${p.titre || "Événement"} à ${heure(p.debut)}${p.lieu ? " · " + p.lieu : ""}`, url: "#espace", tag: "perso-" + p.id } }));
}
