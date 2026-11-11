// Accueil de Mon espace : guide à la première visite, « Premiers pas », annonce Discord de la Direction.
const { ouvrir, onglet, pause, texte } = require("../outils");

module.exports = {
  nom: "Accueil de Mon espace",
  async lancer(env, t) {
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", accueil: true });
    await pause(a, 800);
    t.ok(await a.locator("#dlg").isVisible(), "le guide s'ouvre à la première visite");
    t.contient(texte(await a.locator("#dlg-title").innerText()), "Bienvenue, Alice", "le guide salue l'agent par son prénom");
    t.ok((await a.locator(".guide-grille li").count()) >= 7, "les rubriques de l'espace sont présentées");
    await a.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg-title").innerText()), "Installez le guichet", "page 2 : installer l'application");
    await a.locator("#dlg button", { hasText: "Suivant" }).click(); await pause(a, 200);
    t.contient(texte(await a.locator("#dlg-title").innerText()), "Soyez prévenu", "page 3 : notifications");
    t.egal(await a.locator("#dlg button", { hasText: "Choisir mes notifications" }).count(), 1, "bouton vers le choix des notifications");
    await a.locator("#dlg button", { hasText: "Terminer" }).click(); await pause(a, 400);
    t.ok(await a.evaluate(() => !!localStorage.getItem("gf-accueil-vu-f1")), "guide marqué comme vu");
    // « Premiers pas » : le guide est coché, il reste l'installation et les notifications.
    await pause(a, 5500);
    const pas = texte(await a.locator(".es-premiers").innerText().catch(() => ""));
    t.contient(pas, "Premiers pas", "carte « Premiers pas »");
    t.egal(await a.locator(".es-pas li.fait").count(), 1, "une étape faite sur trois (le guide)");
    await a.locator(".es-premiers button", { hasText: "Masquer" }).click(); await pause(a, 300);
    t.egal(await a.locator(".es-premiers").count(), 0, "« Masquer » retire la carte");
    // Réouverture par le bouton Guide, sans réouverture automatique ensuite.
    await a.locator("#espace-guide").click(); await pause(a, 300);
    t.ok(await a.locator("#dlg").isVisible(), "le bouton « Guide » rouvre le guide");
    await a.keyboard.press("Escape"); await pause(a, 300);
    t.sansErreur(a);
    // Téléphone : le guide tient à l'écran.
    const m = await ouvrir(env, { role: "agent", discord: "222222222222222222", nom: "Bruno", accueil: true, largeur: 390, hauteur: 844 });
    await pause(m, 800);
    t.ok(await m.locator("#dlg").isVisible(), "téléphone : guide ouvert");
    t.egal(await m.evaluate(() => document.documentElement.scrollWidth), 390, "téléphone : pas de défilement horizontal");
    // Direction : annonce prête à poster.
    const d = await ouvrir(env, { hash: "personnel" });
    t.ok(await d.locator("#rh-annonce").isVisible(), "Direction : bouton « Annoncer Mon espace »");
    await d.locator("#rh-annonce").click(); await pause(d, 300);
    t.contient(await d.locator("#an-texte").inputValue(), "Mon espace est ouvert", "texte de l'annonce prérempli");
    t.sansErreur(d);
    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel" });
    t.ok(await r.locator("#rh-annonce").isHidden(), "RH : pas de publication Discord");
  },
};
