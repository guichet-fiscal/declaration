// Photos de profil : l'agent met la sienne depuis Mon espace ; la Direction et les RH depuis la fiche ;
// elles s'affichent dans l'annuaire, l'effectif et la messagerie ; sans photo, les initiales.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ouvrir, onglet, pause, texte } = require("../outils");

const PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";

module.exports = {
  nom: "Photos de profil des fonctionnaires",
  async lancer(env, t) {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "profil-"));
    const photo = path.join(dossier, "portrait.png");
    fs.writeFileSync(photo, Buffer.from(PNG64, "base64"));

    // 1. Le fonctionnaire, depuis Mon espace.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace" });
    await pause(a, 1200);
    const av = a.locator("#espace-avatar");
    t.ok(await av.isVisible() && (await av.innerText()).trim() === "AM" && (await av.getAttribute("class")).includes("vide"), "Mon espace : initiales et invitation à ajouter une photo");
    await av.click(); await pause(a, 300);
    t.contient(texte(await a.locator("#dlg").innerText()), "Ma photo de profil", "fenêtre de la photo");
    await a.locator("#dlg input[type=file]").setInputFiles(photo); await pause(a, 500);
    await a.locator("#dlg button", { hasText: "Enregistrer la photo" }).click(); await pause(a, 900);
    t.ok(await a.evaluate(() => window.__fichiers && window.__fichiers.has("profils/f1.jpg")), "photo envoyée dans l'espace des photos");
    t.ok(await a.evaluate(() => window.__rpc.includes("ma_photo_profil")), "fiche mise à jour par la fonction de la base");
    t.ok(await a.locator("#espace-avatar .avatar.photo").count() === 1, "Mon espace : la photo remplace les initiales");
    // Annuaire : une pastille par personne, la photo d'Alice.
    await a.locator("#es-annuaire").click(); await pause(a, 600);
    const n = await a.locator("#dlg .annu li").count(), nav = await a.locator("#dlg .annu li .avatar").count();
    t.ok(n > 1 && n === nav, "annuaire : une pastille par personne", `${n} / ${nav}`);
    t.ok(await a.locator("#dlg .annu li.moi .avatar.photo").count() === 1, "annuaire : sa photo");
    await a.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(a, 200);
    // Carte professionnelle : dessinée avec la photo.
    await a.locator("#espace-carte").click(); await pause(a, 1500);
    const carte = await a.evaluate(() => { const i = document.querySelector("#dlg img.carte-pro"); return i ? { w: i.naturalWidth, h: i.naturalHeight } : null; });
    t.ok(carte && carte.w === 2024 && carte.h === 1276, "carte professionnelle dessinée", JSON.stringify(carte));
    t.contient(texte(await a.locator("#dlg").innerText()), "Ma carte professionnelle", "fenêtre de la carte");
    t.ok(await a.locator("#dlg a[download]").count() === 1, "carte à télécharger");
    await a.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(a, 200);
    t.sansErreur(a);

    // 2. La Direction, depuis la fiche de Bruno ; l'effectif et la messagerie montrent les pastilles.
    const d = await ouvrir(env, { hash: "personnel" });
    await pause(d, 1200);
    t.ok(await d.locator("#rh-list .av-ligne .avatar").count() >= 2, "effectif : une pastille par fonctionnaire");
    await d.locator("#rh-list .linkbtn", { hasText: "Bruno LEROY" }).click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Ajouter une photo" }).click(); await pause(d, 300);
    await d.locator("#dlg input[type=file]").setInputFiles(photo); await pause(d, 500);
    await d.locator("#dlg button", { hasText: "Enregistrer la photo" }).click(); await pause(d, 1200);
    t.ok(await d.evaluate(() => window.__fichiers.has("profils/f2.jpg")), "photo de Bruno envoyée");
    t.ok(await d.locator("#dlg .profil-tete .avatar.photo").count() === 1 && await d.locator("#dlg button", { hasText: "Changer la photo" }).count() === 1, "fiche rouverte avec la photo");
    await d.keyboard.press("Escape"); await pause(d, 300);
    t.ok(await d.locator("#rh-list li", { hasText: "Bruno LEROY" }).locator(".avatar.photo").count() === 1, "effectif : la photo de Bruno");
    await d.locator("#rh-list .linkbtn", { hasText: "Bruno LEROY" }).click(); await pause(d, 400);
    await d.locator("#dlg button", { hasText: "Carte professionnelle" }).click(); await pause(d, 1500);
    t.ok(await d.locator("#dlg img.carte-pro").count() === 1 && (await d.locator("#dlg .dlg-title").first().innerText()).includes("Bruno LEROY"), "fiche : carte professionnelle de Bruno");
    await d.keyboard.press("Escape"); await pause(d, 300);
    t.sansErreur(d);

    // 3. L'Inspection voit les fiches, sans pouvoir changer la photo des autres.
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", hash: "personnel" });
    await pause(i, 1200);
    await i.locator("#rh-list .linkbtn", { hasText: "Bruno LEROY" }).click(); await pause(i, 400);
    t.egal(await i.locator("#dlg button", { hasText: /Ajouter une photo|Changer la photo/ }).count(), 0, "Inspection : pas de bouton pour la photo d'un autre");
    t.sansErreur(i);
    fs.rmSync(dossier, { recursive: true, force: true });
  },
};
