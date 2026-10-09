// @ts-nocheck : fonctions pures écrites en JavaScript simple.
// Guichet fiscal : quelles notifications envoyer, et avec quel texte.
// Fonctions pures (aucun accès au réseau ni à la base) : testables à part.

export const TYPES = ["declaration", "paiement", "demande", "pret", "controle", "vehicule", "convocation", "delais"];

const NF = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (n) => NF.format(Math.round(Number(n) || 0)).replace(/ | /g, " ") + " €";
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
  for (const r of by("convocations")) { const x = r.data || {}; if (x.statut === "convoquee" && proche(x.date)) out.push(`${no("CV", r.id)} · ${x.entrepriseNom || ""} : ${x.motif === "autre" && x.objet ? x.objet : MOTIFS[x.motif] || "convocation"} à ${heure(x.date)}`); }
  if (!out.length) return null;
  return { type: "delais", title: out.length === 1 ? "Délai à surveiller" : `${out.length} délais à surveiller`, body: out.slice(0, 4).join("\n") + (out.length > 4 ? `\n+ ${out.length - 4} autre${out.length - 4 > 1 ? "s" : ""}` : ""), url: "#recouvrement", tag: "delais-" + Math.floor(maintenant / 36e5) };
}
