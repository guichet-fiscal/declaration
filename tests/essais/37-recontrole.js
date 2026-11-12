// Recontrôle : une période déjà contrôlée est signalée à l'ouverture d'un contrôle et demande des éléments
// nouveaux ; passé le délai de reprise (réglage), une période ne se contrôle plus.
const { ouvrir, pause, texte, lignes, onglet } = require("../outils");
const SEED = require("../jeux/recouvrement");

const PLUS = `
  window.__SEED.find(r => r.collection === "config" && r.id === "main").data.delaiRepriseSemaines = 3;
  window.__SEED.push({ collection: "controles", id: "cx0001", data: { entrepriseId: "e1", entrepriseNom: "Taxi G7", declIds: ["de12026-S43"], periodes: ["2026-S43"], motif: "Contrôle aléatoire", origine: "aleatoire",
    statut: "sans_suite", ouvertLe: "2026-10-28T10:00:00Z", closLe: "2026-11-02T10:00:00Z", notes: [], pieces: [], rectifications: {}, suspendus: [], avant: {} } });
`;

module.exports = {
  nom: "Recontrôle et délai de reprise",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SEED + PLUS });
    await pause(d, 800);
    await onglet(d, "entreprises");
    await d.locator("#tab-entreprises .linkbtn:visible", { hasText: "Taxi G7" }).first().click(); await pause(d, 500);
    await d.locator("#dlg .dlg-foot button, #dlg footer button", { hasText: "Contrôle fiscal" }).first().click(); await pause(d, 400);
    const lab = (k) => d.locator(`#dlg label[for="nc-de1${k}"]`);
    t.ok(await d.locator("#nc-de12026-S41").isDisabled() && /délai de reprise passé/.test(await lab("2026-S41").innerText()), "S41 : trop ancienne, plus cochable", await lab("2026-S41").innerText());
    t.ok(await d.locator("#nc-de12026-S42").isDisabled(), "S42 : trop ancienne aussi");
    t.ok(!(await d.locator("#nc-de12026-S43").isDisabled()) && /déjà contrôlée \(CF-/.test(await lab("2026-S43").innerText()), "S43 : signalée déjà contrôlée", await lab("2026-S43").innerText());
    t.contient(texte(await d.locator("#dlg").innerText()), "jusqu’à 3 semaines après sa fin", "délai de reprise rappelé");
    t.ok(!(await d.locator("#nc-deja").isVisible()), "pas d'avertissement tant que S43 n'est pas cochée");

    await d.locator("#nc-de12026-S43").check(); await pause(d, 100);
    t.ok(await d.locator("#nc-deja").isVisible(), "avertissement en cochant S43");
    t.contient(texte(await d.locator("#nc-deja").innerText()), "classé sans suite", "l'avertissement dit l'issue du premier contrôle");
    await d.locator("#dlg button", { hasText: "Ouvrir le contrôle" }).click(); await pause(d, 300);
    t.contient(texte(await d.locator("#dlg .err").last().innerText()), "éléments nouveaux", "sans confirmation : refusé");
    t.egal((await lignes(d, "controles")).length, 1, "aucun contrôle ouvert");

    await d.locator("#nc-deja-ok").check();
    await d.locator("#nc-motif").fill("Nouveau relevé : ventes non déclarées le 22 octobre.");
    await d.locator("#dlg button", { hasText: "Ouvrir le contrôle" }).click(); await pause(d, 800);
    const c = (await lignes(d, "controles")).find((x) => x.id !== "cx0001") || {};
    t.ok((c.periodes || []).includes("2026-S43") && JSON.stringify(c.recontrole) === JSON.stringify([{ periode: "2026-S43", controles: ["cx0001"] }]), "contrôle ouvert, marqué recontrôle", JSON.stringify(c).slice(0, 300));
    t.contient(texte(await d.locator("#dlg").innerText()), "Semaine 43 déjà contrôlée", "le contrôle renvoie au premier");
    t.sansErreur(d);
  }
};
