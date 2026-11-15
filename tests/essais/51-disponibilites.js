// Disponibilités des fonctionnaires (mise à jour 51) : indiquées dans Mon espace (chaque semaine, plage qui
// passe minuit, jours en plus) ; la Direction voit la semaine, « Qui est disponible ? », et, en fixant un
// rendez-vous, la disponibilité de chacun à l'heure choisie et les créneaux communs aux invités.
const path = require("path");
const { ouvrir, pause, texte } = require("../outils");

const sortie = (n) => path.join(__dirname, "..", "sorties", n);
// Alice : le mardi de 21 h à 23 h, le vendredi de 22 h à 1 h. Directeur Test : le mardi de 22 h à minuit.
// Bruno : rien indiqué, absent du 14 au 16 nov.
const DISPOS = `window.__SEED.push({ collection: "rh", id: "dispo-f1", data: { type: "disponibilites", fid: "f1", nom: "Alice MARTIN", hebdo: [{ j: 2, de: "21:00", a: "23:00" }, { j: 5, de: "22:00", a: "01:00" }], ponctuelles: [], note: "Plutôt le soir", majLe: "2026-11-09T10:00:00Z" } });
  window.__SEED.push({ collection: "rh", id: "dispo-f4", data: { type: "disponibilites", fid: "f4", nom: "Directeur Test", hebdo: [{ j: 2, de: "22:00", a: "00:00" }], ponctuelles: [], note: "", majLe: "2026-11-09T10:00:00Z" } });`;

module.exports = {
  nom: "Disponibilités des fonctionnaires",
  async lancer(env, t) {
    // 1. Alice indique ses disponibilités dans Mon espace.
    const a = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice" });
    await pause(a, 900);
    t.contient(texte(await a.locator("#es-dispos").innerText()), "Rien d’indiqué", "carte « Mes disponibilités » vide");
    await a.locator("#es-dispo-modifier").click(); await pause(a, 300);
    await a.locator("#dp-plus-h").click();
    await a.locator("#dp-hebdo .dispo-r").nth(0).locator("select").selectOption("2");
    await a.locator("#dp-plus-h").click();
    const r2 = a.locator("#dp-hebdo .dispo-r").nth(1);
    await r2.locator("select").selectOption("5"); await r2.locator("input").nth(0).fill("22:00"); await r2.locator("input").nth(1).fill("01:00");
    await a.locator("#dp-plus-p").click();
    const p1 = a.locator("#dp-ponct .dispo-r").nth(0);
    await p1.locator("input[type=date]").fill("2026-11-12"); await p1.locator("input").nth(1).fill("20:00"); await p1.locator("input").nth(2).fill("22:00");
    await a.locator("#dp-note").fill("Plutôt le soir");
    await a.locator("#dp-ok").click(); await pause(a, 800);
    const doc = await a.evaluate(() => (window.__rows.get("rh/dispo-f1") || {}).data);
    t.ok(doc && JSON.stringify(doc.hebdo) === JSON.stringify([{ j: 2, de: "21:00", a: "23:00" }, { j: 5, de: "22:00", a: "01:00" }]) && doc.ponctuelles.length === 1 && doc.note === "Plutôt le soir",
      "disponibilités enregistrées", JSON.stringify(doc));
    const carte = texte(await a.locator("#es-dispos").innerText());
    t.ok(/Mardi\s*21:00–23:00/.test(carte) && /Vendredi\s*22:00–01:00 \(lendemain\)/.test(carte) && /jeudi 12 novembre\s*20:00–22:00/.test(carte), "carte : les plages", carte);
    t.sansErreur(a);

    // 2. La Direction : la semaine et « Qui est disponible ? ».
    const d = await ouvrir(env, { hash: "personnel", avant: DISPOS });
    await pause(d, 900);
    await d.locator("#rh-espaces button", { hasText: "Disponibilités" }).click(); await pause(d, 400);
    const tab = texte(await d.locator("#dispo-table").innerText());
    t.ok(/Alice MARTIN\s*Plutôt le soir/.test(tab) && /Bruno LEROY\s*non renseigné/.test(tab), "semaine : une ligne par fonctionnaire", tab.slice(0, 400));
    const ligne = (n) => d.locator("#dispo-table tbody tr", { hasText: n });
    t.contient(texte(await ligne("Alice MARTIN").locator("td").nth(1).innerText()), "21:00–23:00", "mardi d'Alice");
    t.contient(texte(await ligne("Alice MARTIN").locator("td").nth(5).innerText()), "00:00–01:00", "plage du vendredi qui passe minuit : samedi jusqu'à 1 h");
    t.contient(texte(await ligne("Bruno LEROY").locator("td").nth(5).innerText()), "Absent", "absence de Bruno le samedi");
    await d.locator("#dq-date").fill("2026-11-10"); await d.locator("#dq-heure").fill("21:30"); await d.locator("#dq-duree").selectOption("60"); await d.locator("#dq-duree").dispatchEvent("change"); await pause(d, 200);
    const q = texte(await d.locator("#dq-res").innerText());
    t.ok(/Disponible \(1\)\s*Alice MARTIN/.test(q) && /En partie \(1\)\s*Directeur Test/.test(q) && /Non renseigné \(1\)\s*Bruno LEROY/.test(q), "qui est disponible mardi à 21 h 30", q);
    await d.screenshot({ path: sortie("disponibilites.png"), fullPage: true });

    // 3. Nouveau rendez-vous : disponibilité de chacun, inviter les disponibles, créneaux communs.
    await d.locator("#rh-espaces button", { hasText: "Agenda" }).click(); await pause(d, 300);
    await d.locator("#rh-agenda button", { hasText: "Nouveau rendez-vous" }).click(); await pause(d, 300);
    await d.locator("#ev-date").fill("2026-11-10"); await d.locator("#ev-hd").fill("22:00"); await d.locator("#ev-hf").fill("23:00"); await d.locator("#ev-hf").dispatchEvent("change"); await pause(d, 200);
    t.contient(texte(await d.locator("#ev-dispo").innerText()), "À cette heure : 2 disponibles", "rendez-vous : nombre de disponibles");
    await d.locator("#ev-inviter-dispos").click(); await pause(d, 200);
    t.egal(await d.locator("#ev-aud").inputValue(), "agents", "invités choisis");
    const inv = texte(await d.locator("#dlg .ev-invites").innerText());
    t.ok(/Alice MARTIN\s*Disponible/.test(inv) && /Bruno LEROY\s*Non renseigné/.test(inv), "pastille de disponibilité par fonctionnaire", inv);
    t.ok(await d.locator("#dlg .ev-inv", { hasText: "Alice MARTIN" }).locator("input").isChecked() && !(await d.locator("#dlg .ev-inv", { hasText: "Bruno LEROY" }).locator("input").isChecked()), "seuls les disponibles invités");
    t.contient(texte(await d.locator("#ev-dispo").innerText()), "Créneaux où tous le sont ce jour-là : 22:00–23:00", "créneau commun à Alice et au Directeur");
    await d.screenshot({ path: sortie("disponibilites-rdv.png") });
    t.sansErreur(d);

    // 4. Sans la mise à jour 51 : pas de carte.
    const s = await ouvrir(env, { role: "agent", discord: "111111111111111111", nom: "Alice", avant: "window.__sans51 = true;" });
    await pause(s, 800);
    t.egal(await s.locator("#es-dispos").count(), 0, "sans le script : pas de carte des disponibilités");
  },
};
