// Carte professionnelle signée : par le titulaire (son nom écrit à la main) et par le plus haut gradé en
// service (taux le plus élevé du barème) ; la Direction importe une signature manuscrite qui remplace le nom.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ouvrir, pause, texte } = require("../outils");

// Bruno passe Directeur des finances publiques (4 000 €/h) : le plus haut gradé du jeu d'essai.
const GRADE = `window.__SEED.find(r => r.id === "f2").data.grade = "Directeur des finances publiques";`;
const PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

module.exports = {
  nom: "Carte professionnelle signée",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel", avant: GRADE });
    await pause(d, 900);
    await d.locator("#rh-list .linkbtn", { hasText: "Alice MARTIN" }).first().click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Carte professionnelle" }).click(); await pause(d, 1500);
    t.contient(texte(await d.locator("#dlg").innerText()), "Signée par le titulaire et par Bruno LEROY (Directeur des finances publiques, le plus haut gradé en service)", "signataires de la carte");
    t.ok(await d.locator("#dlg img.carte-pro").evaluate((i) => i.naturalWidth > 0), "carte dessinée");
    // Import de la signature du plus haut gradé.
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "sig-")), image = path.join(dossier, "signature.png");
    fs.writeFileSync(image, Buffer.from(PNG64, "base64"));
    const [chooser] = await Promise.all([d.waitForEvent("filechooser"), d.locator("#carte-sig-autorite").click()]);
    await chooser.setFiles(image); await pause(d, 1500);
    t.ok(await d.evaluate(() => window.__fichiers && window.__fichiers.has("profils/signature-f2.png")), "signature importée (profils/signature-<fiche>.png)");
    t.sansErreur(d);

    // L'agent, dans Mon espace : même signataire, calculé sur l'annuaire et le barème de son espace.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: GRADE });
    await pause(a, 900);
    await a.locator("#espace-carte").click(); await pause(a, 1500);
    t.contient(texte(await a.locator("#dlg").innerText()), "et par Bruno LEROY", "Mon espace : carte signée par le plus haut gradé");
    t.egal(await a.locator("#carte-sig-titulaire").count(), 0, "l'agent n'importe pas de signature");
    t.sansErreur(a);
  },
};
