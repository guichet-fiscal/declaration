// Signature du contrat de travail par l'agent depuis son espace.
const { ouvrir, pause, texte, lignes } = require("../outils");

const aSigner = 'window.__SEED.forEach(r => { if (r.collection === "contratsTravail") { r.data.statut = "a_signer"; delete r.data.salarieSigneLe; } });';

module.exports = {
  nom: "Signature du contrat par l'agent",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: aSigner });
    const carte = a.locator("#espace-main .card", { has: a.locator("h3", { hasText: "Mon contrat de travail" }) });
    t.contient(texte(await carte.innerText()), "à lire et à signer ici", "contrat à signer signalé");
    await carte.locator("button", { hasText: "Lire et signer" }).click(); await pause(a, 1500);
    t.ok((await a.locator("#dlg .ct-page").count()) >= 2, "les pages du contrat s'affichent");
    const signer = a.locator("#dlg button", { hasText: "Signer mon contrat" });
    await signer.click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "Cochez la case", "l'accord est obligatoire");
    await a.locator("#sc-accord").check(); await a.locator("#sc-nom").fill("Bruno LEROY"); await signer.click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg .err").innerText()), "Alice MARTIN", "le nom doit être celui du contrat");
    await a.locator("#sc-nom").fill("alice martin"); await signer.click(); await pause(a, 900);
    t.contient(texte(await a.locator("#dlg-title").innerText()), "Contrat signé", "signature confirmée");
    const c = (await lignes(a, "contratsTravail")).find((x) => x.id === "c1");
    t.ok(c.statut === "signe" && c.signeParAgent && c.salarieSigneLe, "contrat signé par l'agent dans le registre");
    await a.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(a, 600);
    t.ok(!(texte(await carte.innerText())).includes("Lire et signer"), "plus de bouton de signature");
    t.sansErreur(a);
    // Sans le script 36 : explication, rien n'est signé.
    const x = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: aSigner + " window.__sans36 = true;" });
    await x.locator("#espace-main button", { hasText: "Lire et signer" }).click(); await pause(x, 1200);
    await x.locator("#sc-accord").check(); await x.locator("#sc-nom").fill("Alice MARTIN"); await x.locator("#dlg button", { hasText: "Signer mon contrat" }).click(); await pause(x, 600);
    t.contient(texte(await x.locator("#dlg .err").innerText()), "v36", "sans le script 36 : message clair");
    // « Premiers pas » propose la signature.
    await x.keyboard.press("Escape"); await pause(x, 5500);
    t.contient(texte(await x.locator(".es-premiers").innerText().catch(() => "")), "Lire et signer mon contrat de travail", "étape « signer mon contrat » dans les premiers pas");
  },
};
