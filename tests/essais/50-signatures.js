// Signatures des agents : bloc à coller au bas des documents (logos du serveur, nom, fonction, adresse,
// service, Discord, photo). Mon espace pour la sienne (changements gardés sur l'appareil), fiche de l'agent
// et « Signatures des agents » (toutes en ZIP) pour la Direction et les RH.
const fs = require("fs");
const path = require("path");
const { ouvrir, onglet, pause, texte } = require("../outils");

const sortie = (n) => path.join(__dirname, "..", "sorties", n);

module.exports = {
  nom: "Signatures des agents",
  async lancer(env, t) {
    // 1. Alice, dans Mon espace.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    await pause(a, 800);
    await a.locator("#espace-signature").click(); await pause(a, 1200);
    t.egal(await a.locator("#sig-email").inputValue(), "alice.martin@gouvgprp.fr", "adresse tirée du nom");
    t.egal(await a.locator("#sig-fonction").inputValue(), "Agent administratif", "fonction du dernier contrat");
    t.egal(await a.locator("#sig-discord").inputValue(), "alice", "identifiant Discord de la session");
    t.egal(await a.locator("#sig-apercu").evaluate((i) => i.naturalWidth), 2340, "aperçu de la signature (image nette, × 2)");
    await a.locator("#sig-fonction").fill("Cheffe du bureau des impôts"); await pause(a, 700);
    t.contient(await a.evaluate(() => localStorage.getItem("gf-signature-f1") || ""), "Cheffe du bureau des impôts", "changement gardé sur l'appareil");
    await a.screenshot({ path: sortie("signature-espace.png") });
    await a.keyboard.press("Escape"); await pause(a, 200);
    await a.locator("#espace-signature").click(); await pause(a, 900);
    t.egal(await a.locator("#sig-fonction").inputValue(), "Cheffe du bureau des impôts", "repris à la réouverture");
    t.ok(await a.locator("#sig-annuler").isEnabled(), "« Annuler mes changements » actif après un changement");
    await a.locator("#sig-annuler").click(); await pause(a, 700);
    t.ok((await a.locator("#sig-fonction").inputValue()) === "Agent administratif" && !(await a.evaluate(() => localStorage.getItem("gf-signature-f1"))), "changements annulés : valeurs remplies par le guichet");
    t.ok(await a.locator("#sig-annuler").isDisabled(), "rien à annuler : bouton grisé");
    t.egal(await a.locator("#sig-dl").getAttribute("download"), "signature-alice-martin.png", "nom du fichier");
    t.sansErreur(a);

    // 2. Direction : fiche de l'agent, puis toutes les signatures en ZIP.
    const d = await ouvrir(env, { hash: "personnel" });
    await pause(d, 900);
    await d.locator("#rh-list .linkbtn", { hasText: "Alice MARTIN" }).first().click(); await pause(d, 400);
    await d.locator("#ag-signature").click(); await pause(d, 1000);
    t.ok((await d.locator("#sig-email").inputValue()) === "alice.martin@gouvgprp.fr" && (await d.locator("#sig-discord").inputValue()) === "", "fiche : signature de l'agent (sans Discord de la session)");
    await d.keyboard.press("Escape"); await pause(d, 200);
    await d.locator("#rh-signatures").click(); await pause(d, 400);
    const l = texte(await d.locator("#sigs-l").innerText());
    t.ok(/Alice MARTIN/.test(l) && /bruno\.leroy@gouvgprp\.fr/.test(l), "liste des signatures", l.slice(0, 300));
    const [dl] = await Promise.all([d.waitForEvent("download"), d.locator("#sigs-zip").click()]);
    const zip = path.join(__dirname, "..", "sorties", "signatures-agents.zip");
    await dl.saveAs(zip);
    const b = fs.readFileSync(zip), fin = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const n = fin >= 0 ? b.readUInt16LE(fin + 10) : 0, actifs = (await d.locator("#sigs-l > li").count());
    t.ok(dl.suggestedFilename() === "signatures-agents.zip" && b.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && n === actifs && b.includes(Buffer.from("signature-alice-martin.png")), "ZIP avec une signature par agent", `${n} / ${actifs}`);
    t.sansErreur(d);
  },
};
