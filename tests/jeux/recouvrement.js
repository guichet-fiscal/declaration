module.exports = `
  const E = (id, nom, extra) => window.__SEED.push({ collection: "entreprises", id, data: Object.assign({ nom, secteur: "Commerce", patron: "Patron " + nom, actif: true, createdAt: "2026-10-01T10:00:00Z", debutActivite: "2026-S41", discordId: "1" + id.slice(1).padStart(17, "0") }, extra || {}) });
  const D = (id, eid, nom, k, total, decAt) => { window.__SEED.push({ collection: "declarations", id, data: { entrepriseId: eid, entrepriseNom: nom, periode: k, ca: total * 5, charges: 0, masse: 0, total, createdAt: decAt } }); window.__SEED.push({ collection: "decisions", id, data: { statut: "validee", at: decAt, montant: total } }); };
  const R = (id, eid, nom, type, niveau, at, ech, extra) => window.__SEED.push({ collection: "relances", id, data: Object.assign({ entrepriseId: eid, entrepriseNom: nom, type, niveau, periodes: [], items: [], montant: 0, at, echeance: ech, byNom: "Directeur Test" }, extra || {}) });
  for (const [id, nom] of [["e1", "Taxi G7"], ["e2", "XPL"], ["e3", "Club 77"], ["e4", "Mirror"], ["e5", "Paris Immo"], ["e6", "Vanguard Armurerie"]]) E(id, nom);
  // Toutes déclarent S41 à S45, sauf XPL et Mirror (S45 manquante).
  for (const [id, nom] of [["e1", "Taxi G7"], ["e2", "XPL"], ["e3", "Club 77"], ["e4", "Mirror"], ["e5", "Paris Immo"], ["e6", "Vanguard Armurerie"]])
    for (const k of ["2026-S41", "2026-S42", "2026-S43", "2026-S44", "2026-S45"]) {
      if ((id === "e2" || id === "e4") && k === "2026-S45") continue;
      const unpaid = (id === "e1" && k === "2026-S44") || (id === "e3" && k === "2026-S44") || (id === "e6" && k === "2026-S43") || (id === "e5" && k === "2026-S45");
      const at = k === "2026-S45" ? "2026-11-10T12:00:00Z" : k === "2026-S44" ? "2026-11-03T12:00:00Z" : "2026-10-27T12:00:00Z";
      D("d" + id + k, id, nom, k, unpaid ? (id === "e1" ? 12400 : id === "e3" ? 8000 : id === "e6" ? 45000 : 22000) : 0, at);
    }
  R("r1", "e1", "Taxi G7", "paiement", "relance", "2026-11-07T10:00:00Z", "2026-11-09T10:00:00Z", { items: [{ kind: "decl", id: "de12026-S44", ref: "DF-X", label: "Avis", montant: 12400 }], montant: 12400 });
  R("r3", "e3", "Club 77", "paiement", "mise_en_demeure", "2026-11-10T10:00:00Z", "2026-11-12T10:00:00Z", { items: [{ kind: "decl", id: "de32026-S44", ref: "DF-Y", label: "Avis", montant: 8000 }], montant: 8000 });
  R("r4", "e4", "Mirror", "declaration", "mise_en_demeure", "2026-11-06T10:00:00Z", "2026-11-08T10:00:00Z", { periodes: ["2026-S45"] });
  R("r6", "e6", "Vanguard Armurerie", "paiement", "mise_en_demeure", "2026-11-03T10:00:00Z", "2026-11-05T10:00:00Z", { items: [{ kind: "decl", id: "de62026-S43", ref: "DF-Z", label: "Avis", montant: 45000 }], montant: 45000 });
  { const c = window.__SEED.find(r => r.collection === "config" && r.id === "main"); c.data.debutSuivi = "2026-S41"; }
`;
