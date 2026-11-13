// Sécurité : le permis de conduire du serveur est lu comme la carte d'identité (nom, prénom, naissance,
// numéro du permis), et le contrôle note que la pièce présentée était un permis (lecteur simulé : texte
// réellement lu sur une capture du permis, le 13 nov.).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ouvrir, pause, texte, lignes } = require("../outils");

const PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";
const PROTECTION = `window.__SEED.find(r => r.id === "f1").data.grade = "Agent service de la protection";`;
const LECTEUR = `window.Tesseract = { createWorker: async () => ({ setParameters: async () => {}, recognize: async () => ({ data: { text: window.__texteCarte || "" } }) }) };`;
// Grande capture, puis petite (nom mal lu « POOIL », bande lue « DIFRA@1KS… »).
const PERMIS = "ES PERMIS DE CONDUIRE RÉPUBLIQUE FRANÇAISE\n\nPODIL\n2 DAMIEN\n\n11.10.2000\n4 28.02.2019 « PRÉFECTURE\n«. 28.02.2034\n\n01KS47088\n\np. PODIL\n\n28.02.2019\n\nDI1FRAO01KS47088532315PODIL<<<<1";
const PETIT = "5) PERMIS DE CONDUIRE RÉPUBLIQUE FRANÇAISE\nPOOIL\n\nDAMIEN\n\n11.10.2000\n\n28.02.2019 PRÉFECTURE\n28.02.2034\n\n0IKS47O88\n\nD. PODIL\n\n8 28.02 209\n\nDIFRA@1KS47088532315PODIL<<<<1";

module.exports = {
  nom: "Sécurité : lecture du permis de conduire",
  async lancer(env, t) {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "permis-"));
    const image = path.join(dossier, "permis.png");
    fs.writeFileSync(image, Buffer.from(PNG64, "base64"));
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace", avant: PROTECTION + LECTEUR });
    await pause(a, 900);
    await a.locator("#tab-btn-securite").click(); await pause(a, 500);
    const val = async (id) => a.locator(id).inputValue();

    await a.evaluate((x) => { window.__texteCarte = x; }, PERMIS);
    await a.locator("#secu-controle").click(); await pause(a, 300);
    await a.locator("#dlg input[type=file]").setInputFiles(image); await pause(a, 800);
    t.ok((await val("#sc-nom")) === "Damien PODIL" && (await val("#sc-naissance")) === "11/10/2000" && (await val("#sc-numero")) === "01KS47088",
      "permis lu : prénom et nom, naissance, numéro", JSON.stringify([await val("#sc-nom"), await val("#sc-naissance"), await val("#sc-numero")]));
    t.contient(texte(await a.locator("#dlg .secu-etat").innerText()), "Lu sur la pièce : permis de conduire, Damien PODIL", "message : permis de conduire");
    await a.locator("#dlg button", { hasText: /^Enregistrer/ }).first().click(); await pause(a, 1200);
    const c = (await lignes(a, "securiteControles"))[0] || {};
    t.ok(c.numero === "01KS47088" && c.piece === "permis", "contrôle : la pièce était un permis de conduire", JSON.stringify(c).slice(0, 200));
    if (await a.locator("#dlg").isVisible()) { await a.keyboard.press("Escape"); await pause(a, 300); }

    // Petite capture : nom tiré de la bande du bas (« PODIL »), numéro remis en forme (0IKS47O88 → 01KS47088).
    await a.evaluate((x) => { window.__texteCarte = x; }, PETIT);
    await a.locator("#secu-controle").click(); await pause(a, 300);
    if (await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).count()) { await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).click(); await pause(a, 200); }
    await a.locator("#dlg input[type=file]").setInputFiles(image); await pause(a, 800);
    t.ok((await val("#sc-naissance")) === "11/10/2000" && (await val("#sc-numero")) === "01KS47088" && (await val("#sc-nom")) === "Damien PODIL",
      "petite capture : nom (bande), naissance et numéro justes", JSON.stringify([await val("#sc-nom"), await val("#sc-naissance"), await val("#sc-numero")]));
    t.sansErreur(a);
  },
};
