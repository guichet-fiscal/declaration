// Sécurité : identité préremplie (personne déjà venue proposée dès deux lettres, photo de sa pièce
// reprise et copiée), lecture de la pièce pour une nouvelle personne (lecteur simulé), entrée notée
// depuis un contrôle.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ouvrir, pause, texte, lignes } = require("../outils");

const PNG64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==";
const PROTECTION = `window.__SEED.find(r => r.id === "f1").data.grade = "Agent service de la protection";`;
const DOSSIERS = `
  window.__SEED.push({ collection: "securiteEntrees", id: "e0", data: { nom: "Hugo Lefèvre", qualite: "Patron de Taxi G7", naissance: "04/09/1996", numero: "GP44712290", pieceVue: true,
    photos: [{ path: "securiteEntrees/e0/p.jpg", nom: "carte.jpg" }], arrivee: "2026-11-09T18:00:00Z", sortie: "2026-11-09T19:00:00Z", agent: "Bruno LEROY", at: "2026-11-09T18:00:00Z" } });
  window.__SEED.push({ collection: "securiteControles", id: "c0", data: { nom: "LEFÈVRE Hugo", resultat: "anomalie", motif: "aleatoire", lieu: "Hall", date: "2026-11-10T18:00:00Z", photos: [], agent: "Bruno LEROY", at: "2026-11-10T18:00:00Z" } });
  window.__fichiers = new Map([["securite/securiteEntrees/e0/p.jpg", new Blob([Uint8Array.from(atob("${PNG64}"), c => c.charCodeAt(0))], { type: "image/png" })]]);`;
// Lecteur de texte simulé : renvoie window.__texteCarte, quelle que soit l'image.
const LECTEUR = `window.__lectures = 0; window.Tesseract = { createWorker: async () => ({ setParameters: async () => {}, recognize: async () => { window.__lectures++; return { data: { text: window.__texteCarte || "" } }; } }) };`;
const CNI = "CARTE NATIONALE D'IDENTITÉ / IDENTITY CARD\\nNOM / Surname\\nROUSSEAU\\nPrénoms / Given names\\nCamille, Anne\\nSEXE / Sex NATIONALITÉ / Nationality DATE DE NAISS. / Date of birth\\nF FRA 17 05 1992\\nN° DU DOCUMENT / Document No\\nK7PL2WQ93\\nIDFRAK7PL2WQ938<<<<<<<<<<<<<<<\\n9205174F3308036FRA<<<<<<<<<<<4\\nROUSSEAU<<CAMILLE<ANNE<<<<<<<<";

// Textes lus par le lecteur sur de vraies cartes du serveur (grande capture, puis petite).
const VRAIE = "RÉPUBLIQUE FRANÇAISE\\nCARTE NATIONALE D'IDENTITÉ / IDENTITY CARD\\nNOM / Surname\\nPOISSONNIERS\\nPRÉNOMS / Given names\\nAntoine\\nSEXE / Sex\\nNATIONALITÉ / NofiondATE DE NAISS. / Date of birth\\nM\\nFrançais\\n04 11 2002\\nTAILLE / Height N° DU DOCUMENT / Document No.\\n182cm XJRNLDV2B\\nW";
const PETITE = "ME VOLIQUE FRANÇAISE\\nLEHM ANN\\nViktor\\nM\\nFrançais\\n09 05 19057\\n185 cm PA4CTIAEPW";

module.exports = {
  nom: "Sécurité : identité préremplie et lecture de la pièce",
  async lancer(env, t) {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "ident-"));
    const carte = path.join(dossier, "carte.png");
    fs.writeFileSync(carte, Buffer.from(PNG64, "base64"));
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", hash: "espace", avant: PROTECTION + DOSSIERS + LECTEUR });
    await pause(a, 900);
    await a.locator("#tab-btn-securite").click(); await pause(a, 500);

    // Personne déjà venue : trois lettres suffisent, la suggestion rappelle l'anomalie ; le nom est écrit
    // comme dans son dernier dossier (ici le contrôle).
    await a.locator("#secu-entree").click(); await pause(a, 300);
    await a.locator("#se-nom").pressSequentially("lef"); await pause(a, 300);
    const sugg = a.locator("#dlg .secu-sugg");
    t.ok(await sugg.isVisible(), "suggestions sous le nom");
    const st = texte(await sugg.innerText());
    t.ok(/LEFÈVRE Hugo/.test(st) && /Anomalie/.test(st) && /1 venue/.test(st) && /1 contrôle/.test(st), "suggestion : nom, anomalie, venues et contrôles", st);
    await sugg.locator("button").first().click(); await pause(a, 400);
    const val = async (id) => a.locator(id).inputValue();
    t.ok((await val("#se-nom")) === "LEFÈVRE Hugo" && (await val("#se-naissance")) === "04/09/1996" && (await val("#se-numero")) === "GP44712290" && (await val("#se-qualite")) === "Patron de Taxi G7",
      "identité reprise : nom, naissance, numéro, qualité", JSON.stringify([await val("#se-nom"), await val("#se-naissance"), await val("#se-numero"), await val("#se-qualite")]));
    t.egal(await a.locator("#dlg .secu-ajout .secu-photo").count(), 1, "photo de sa pièce reprise");
    t.ok(await a.locator("#se-numero.secu-auto").count() === 1, "champ rempli tout seul, teinté");
    t.contient(texte(await a.locator("#dlg .secu-fiche").innerText()), "Anomalie au contrôle du", "fiche : contrôle non conforme rappelé");
    await a.locator("#se-visite").fill("Direction");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 1200);
    const e = (await lignes(a, "securiteEntrees")).find((x) => x.id !== "e0") || {};
    const ph = (e.photos || [])[0] || {};
    t.ok(e.pieceVue && e.naissance === "04/09/1996" && ph.copieDe === "securiteEntrees/e0/p.jpg" && ph.path.startsWith("securiteEntrees/") && ph.path !== ph.copieDe, "entrée : photo copiée dans son propre dossier", JSON.stringify(e).slice(0, 300));
    t.ok(await a.evaluate((p) => window.__fichiers.has("securite/" + p), ph.path), "copie présente dans l'espace des photos");

    // Nouvelle personne : la photo de la pièce est lue et remplit l'identité.
    await a.evaluate((x) => { window.__texteCarte = x; }, CNI.replace(/\\n/g, "\n"));
    await a.locator("#secu-controle").click(); await pause(a, 300);
    await a.locator("#dlg input[type=file]").setInputFiles(carte); await pause(a, 800);
    t.ok((await val("#sc-nom")) === "Camille ROUSSEAU" && (await val("#sc-naissance")) === "17/05/1992" && (await val("#sc-numero")) === "K7PL2WQ93",
      "pièce lue : nom, date de naissance, numéro", JSON.stringify([await val("#sc-nom"), await val("#sc-naissance"), await val("#sc-numero")]));
    t.contient(texte(await a.locator("#dlg .secu-etat").innerText()), "Lu sur la pièce", "message de lecture");
    await a.locator("#dlg button", { hasText: "Annuler" }).click(); await pause(a, 300);

    // Nom déjà tapé : pas de lecture automatique ; « Lire la pièce » signale l'écart sans rien écraser.
    await a.locator("#secu-controle").click(); await pause(a, 300);
    if (await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).count()) { await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).click(); await pause(a, 200); }
    await a.locator("#sc-nom").fill("Jean Martin");
    const avant = await a.evaluate(() => window.__lectures);
    await a.locator("#dlg input[type=file]").setInputFiles(carte); await pause(a, 500);
    t.egal(await a.evaluate(() => window.__lectures), avant, "nom tapé : pas de lecture automatique");
    await a.locator("#dlg button", { hasText: "Lire la pièce" }).click(); await pause(a, 800);
    t.ok((await val("#sc-nom")) === "Jean Martin" && (await val("#sc-naissance")) === "17/05/1992", "le nom tapé reste, la date vide est remplie");
    t.contient(texte(await a.locator("#dlg .secu-etat").innerText()), "Différent de ce qui est tapé (nom)", "écart entre la pièce et le nom tapé signalé");
    // Rien de lisible.
    await a.evaluate(() => { window.__texteCarte = "@@ ### ~~"; });
    await a.locator("#dlg button", { hasText: "Lire la pièce" }).click(); await pause(a, 600);
    t.contient(texte(await a.locator("#dlg .secu-etat").innerText()), "Rien de lisible", "photo illisible : le dire");
    // Texte lu sur une vraie carte du serveur : numéro sur la ligne de la taille, sous deux intitulés.
    await a.evaluate((x) => { window.__texteCarte = x; }, VRAIE.replace(/\\n/g, "\n"));
    await a.locator("#dlg button", { hasText: "Lire la pièce" }).click(); await pause(a, 600);
    t.ok((await val("#sc-numero")) === "XJRNLDV2B" && (await val("#sc-naissance")) === "04/11/2002", "carte du serveur : numéro et date lus", JSON.stringify([await val("#sc-numero"), await val("#sc-naissance")]));
    // Petite capture : date mal lue (« 19057 ») prise pour un numéro, à ne pas faire.
    await a.evaluate((x) => { window.__texteCarte = x; }, PETITE.replace(/\\n/g, "\n"));
    await a.locator("#sc-numero").fill(""); await a.locator("#sc-naissance").fill("");
    await a.locator("#dlg button", { hasText: "Lire la pièce" }).click(); await pause(a, 600);
    t.ok((await val("#sc-numero")) !== "090519057", "date mal lue jamais prise pour un numéro", await val("#sc-numero"));
    // Au clavier : flèche bas puis Entrée.
    await a.locator("#sc-nom").fill("");
    await a.locator("#sc-nom").pressSequentially("hug"); await pause(a, 300);
    await a.locator("#sc-nom").press("ArrowDown"); await a.locator("#sc-nom").press("Enter"); await pause(a, 300);
    t.ok((await val("#sc-nom")) === "LEFÈVRE Hugo" && (await val("#sc-numero")) === "GP44712290", "suggestion choisie au clavier (nom écrit comme la dernière fois)");
    t.ok(await a.locator("#dlg .secu-dedans").isVisible() && (await a.locator("#dlg button", { hasText: "noter seulement son entrée" }).count()) === 0, "encore dans les locaux : dit, et pas d'entrée proposée");
    await a.locator("#dlg button", { hasText: "Annuler" }).click(); await pause(a, 300);

    // Depuis un contrôle : « Noter son entrée » ouvre l'entrée préremplie.
    await a.locator("#secu-main .seg button", { hasText: "Contrôles" }).click(); await pause(a, 300);
    await a.locator("#secu-main .linkbtn", { hasText: "LEFÈVRE Hugo" }).click(); await pause(a, 300);
    t.ok(await a.locator("#dlg button", { hasText: "Noter son entrée" }).count() === 0, "déjà dans les locaux : pas de seconde entrée proposée");
    await a.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(a, 200);
    await a.locator("#secu-main .seg button", { hasText: "Entrées" }).click(); await pause(a, 300);
    await a.locator("#secu-main button", { hasText: "Sortie" }).click(); await pause(a, 900);
    await a.locator("#secu-main .seg button", { hasText: "Contrôles" }).click(); await pause(a, 300);
    await a.locator("#secu-main .linkbtn", { hasText: "LEFÈVRE Hugo" }).click(); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "Noter son entrée" }).click(); await pause(a, 400);
    t.ok((await val("#se-nom")) === "LEFÈVRE Hugo" && (await a.locator("#dlg .dlg-title").innerText()).includes("Nouvelle entrée"), "entrée préremplie depuis le contrôle");
    await a.locator("#dlg button", { hasText: /^(Annuler|Retour)$/ }).click(); await pause(a, 300);
    if (await a.locator("#dlg button", { hasText: "Fermer" }).count()) { await a.locator("#dlg button", { hasText: "Fermer" }).click(); await pause(a, 200); }

    // Nouveau contrôle d'une identité déjà enregistrée : seulement son entrée, aucun contrôle de plus.
    const nb = async (c) => (await lignes(a, c)).length;
    const [ctl0, ent0] = [await nb("securiteControles"), await nb("securiteEntrees")];
    await a.locator("#secu-controle").click(); await pause(a, 300);
    if (await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).count()) { await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).click(); await pause(a, 200); }
    await a.locator("#sc-nom").pressSequentially("hug"); await pause(a, 300);
    await a.locator("#sc-nom").press("ArrowDown"); await a.locator("#sc-nom").press("Enter"); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "noter seulement son entrée" }).click(); await pause(a, 400);
    t.ok((await a.locator("#dlg .dlg-title").innerText()).includes("Nouvelle entrée") && (await val("#se-nom")) === "LEFÈVRE Hugo" && (await val("#se-numero")) === "GP44712290" && (await a.locator("#dlg .secu-ajout .secu-photo").count()) === 1,
      "identité connue : entrée ouverte avec l'identité et la photo");
    await a.locator("#dlg button", { hasText: "Enregistrer l’entrée" }).click(); await pause(a, 1200);
    t.ok((await nb("securiteControles")) === ctl0 && (await nb("securiteEntrees")) === ent0 + 1, "une entrée de plus, aucun contrôle de plus");

    // Nouvelle entrée de quelqu'un encore dans les locaux : « Noter sa sortie d'abord ».
    await a.locator("#secu-entree").click(); await pause(a, 300);
    if (await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).count()) { await a.locator("#dlg .reprise button", { hasText: "Repartir de zéro" }).click(); await pause(a, 200); }
    await a.locator("#se-nom").pressSequentially("hug"); await pause(a, 300);
    await a.locator("#se-nom").press("ArrowDown"); await a.locator("#se-nom").press("Enter"); await pause(a, 300);
    await a.locator("#dlg button", { hasText: "Noter sa sortie d’abord" }).click(); await pause(a, 900);
    t.ok(!(await lignes(a, "securiteEntrees")).some((e) => !e.sortie && /Hugo/i.test(e.nom)), "sortie notée depuis la nouvelle entrée");
    t.ok(await a.locator("#dlg .secu-dedans").count() === 0, "plus « dans les locaux »");
    t.sansErreur(a);
    fs.rmSync(dossier, { recursive: true, force: true });
  },
};
