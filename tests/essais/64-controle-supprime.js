// Contrôle ouvert ou classé par erreur : la Direction le supprime (deux clics). L'avis suspendu redevient
// payable, ses pièces sont effacées ; pas de suppression après un redressement ; avec la double validation,
// c'est une demande.
const { ouvrir, pause, texte, lignes } = require("../outils");
const SEED = require("../jeux/recouvrement");

const CTRL = `
  window.__SEED.find(r => r.collection === "decisions" && r.id === "de12026-S44").data.statut = "controle";
  window.__SEED.push({ collection: "controles", id: "cx0002", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", declIds: ["de12026-S44"], periodes: ["2026-S44"], motif: "Ouvert par erreur", origine: "aleatoire",
    statut: "ouvert", ouvertLe: "2026-11-10T10:00:00Z", notes: [], pieces: [{ id: "p1", path: "cx0002/p.jpg", nom: "capture.png", type: "image", at: "2026-11-10T10:01:00Z" }], rectifications: {}, suspendus: ["de12026-S44"], avant: { "de12026-S44": "validee" } } });
  window.__SEED.push({ collection: "controles", id: "cx0003", data: { entrepriseId: "e3", entrepriseNom: "Club 77", declIds: ["de32026-S43"], periodes: ["2026-S43"], motif: "Contrôle", origine: "aleatoire",
    statut: "recouvre", ouvertLe: "2026-11-01T10:00:00Z", notes: [], pieces: [], rectifications: {}, suspendus: [], avant: {}, total: 3000 } });
  window.__SEED.push({ collection: "penalites", id: "pr3", data: { entrepriseId: "e3", entrepriseNom: "Club 77", type: "redressement", controleId: "cx0003", motif: "Redressement fiscal", montant: 3000, statut: "due", createdAt: "2026-11-05T10:00:00Z" } });
  window.__fichiers = new Map([["pieces/cx0002/p.jpg", new Blob(["x"])]]);`;
const SANS_DV = `window.__SEED.find(r => r.collection === "config" && r.id === "main").data.doubleValidation = { actif: false };`;
const ouvrirCtrl = async (p, no) => { await p.keyboard.press("Control+k"); await pause(p, 300); await p.locator("#q-in").fill(no); await pause(p, 300); await p.keyboard.press("Enter"); await pause(p, 600); };

module.exports = {
  nom: "Contrôle supprimé par la Direction",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + CTRL + SANS_DV });
    await pause(d, 900);
    await ouvrirCtrl(d, "CX0002");
    t.contient(texte(await d.locator("#dlg").innerText()), "Contrôle fiscal CF-CX0002", "contrôle ouvert");
    await d.locator("#cf-supprimer").click(); await pause(d, 100);
    t.egal(await d.locator("#cf-supprimer").innerText(), "Confirmer la suppression", "deux clics");
    await d.locator("#cf-supprimer").click(); await pause(d, 1500);
    t.ok(!(await lignes(d, "controles")).some((x) => x.id === "cx0002"), "contrôle supprimé");
    const dec = await d.evaluate(() => (window.__rows.get("decisions/de12026-S44") || {}).data);
    t.ok(dec && dec.statut === "validee", "avis suspendu redevenu payable", JSON.stringify(dec).slice(0, 200));
    t.ok(await d.evaluate(() => !window.__fichiers.has("pieces/cx0002/p.jpg")), "pièce effacée");
    // Après un redressement : plus supprimable.
    await ouvrirCtrl(d, "CX0003");
    t.contient(texte(await d.locator("#dlg").innerText()), "Club 77", "contrôle avec redressement ouvert");
    t.egal(await d.locator("#cf-supprimer").count(), 0, "pas de suppression après un redressement");
    t.sansErreur(d);

    // Double validation active : une demande.
    const v = await ouvrir(env, { hash: "dashboard", avant: SEED + CTRL });
    await pause(v, 900);
    await ouvrirCtrl(v, "CX0002");
    await v.locator("#cf-supprimer").click(); await pause(v, 100); await v.locator("#cf-supprimer").click(); await pause(v, 1200);
    const dm = (await lignes(v, "validations"))[0] || {};
    t.ok(dm.action === "controle_supprime" && dm.cible && dm.cible.id === "cx0002", "demande de suppression à valider", JSON.stringify(dm).slice(0, 200));
    t.ok((await lignes(v, "controles")).some((x) => x.id === "cx0002"), "contrôle gardé en attendant");
    t.sansErreur(v);
  },
};
