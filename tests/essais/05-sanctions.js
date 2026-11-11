// Sanctions : retenue, exclusion, rétrogradation annulée, exclusion levée, révocation ; droits par rôle.
const { ouvrir, pause, texte, lignes } = require("../outils");

module.exports = {
  nom: "Sanctions disciplinaires",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "personnel" });
    await d.locator("#rh-espaces button", { hasText: "Sanctions" }).click(); await pause(d, 300);
    const prendre = async (fid, type, extra) => {
      await d.locator("#rh-sanctions button", { hasText: "Prendre une sanction" }).click(); await pause(d, 300);
      await d.locator("#sd-qui").selectOption(fid); await d.locator("#sd-type").selectOption(type);
      await d.locator("#sd-motif").fill("Absence de service non justifiée le 8 novembre.");
      if (extra) await extra();
      await d.locator("#dlg button", { hasText: "Prendre la sanction" }).click(); await pause(d, 700);
      await d.keyboard.press("Escape"); await pause(d, 300);
    };
    await prendre("f2", "retenue", () => d.locator("#sd-montant").fill("10000"));
    const ret = (await lignes(d, "rappels")).find((r) => r.sanction);
    t.ok(ret && ret.fid === "f2" && ret.origine === "retenue", "retenue inscrite sur la paye de Bruno");
    t.ok((await lignes(d, "messagesAgents")).some((m) => m.sanction && m.fid === "f2"), "message automatique à l'agent");

    await prendre("f1", "exclusion", async () => { await d.locator("#sd-du").fill("2026-11-12"); await d.locator("#sd-au").fill("2026-11-13"); });
    t.ok((await lignes(d, "absences")).some((a) => a.sanction && a.fid === "f1"), "exclusion inscrite en absence");

    const grade0 = (await lignes(d, "fonctionnaires")).find((f) => f.id === "f2").grade;
    await prendre("f2", "retrogradation", () => d.locator("#sd-grade").selectOption({ index: 0 }));
    await d.locator("#rh-sanctions .linkbtn", { hasText: "Rétrogradation" }).click(); await pause(d, 300);
    const bt = await d.locator("#dlg button", { hasText: "Annuler la sanction" }).elementHandle(); await bt.click(); await pause(d, 100); await bt.click(); await pause(d, 800);
    t.egal((await lignes(d, "fonctionnaires")).find((f) => f.id === "f2").grade, grade0, "rétrogradation annulée : grade rétabli");
    if (await d.locator("#dlg").isVisible()) { await d.keyboard.press("Escape"); await pause(d, 300); }

    await prendre("f1", "revocation", () => d.locator("#sd-conf").check());
    t.egal((await lignes(d, "fonctionnaires")).find((f) => f.id === "f1").actif, false, "révocation : retiré des effectifs");
    t.sansErreur(d, "Direction : aucune erreur");

    const r = await ouvrir(env, { role: "rh", discord: "916695949978525766", nom: "RH Test", hash: "personnel" });
    await r.locator("#rh-espaces button", { hasText: "Sanctions" }).click(); await pause(r, 300);
    t.egal(await r.locator("#rh-sanctions button", { hasText: "Prendre une sanction" }).count(), 1, "RH : peut prendre une sanction");
    const i = await ouvrir(env, { role: "inspecteur", discord: "333333333333333333", nom: "Inspecteur Test", hash: "personnel" });
    await i.locator("#rh-espaces button", { hasText: "Sanctions" }).click(); await pause(i, 300);
    t.egal(await i.locator("#rh-sanctions button", { hasText: "Prendre une sanction" }).count(), 0, "Inspection : ne prend pas de sanction");
    t.ok(texte(await i.locator("#rh-sanctions").innerText()).length > 0, "Inspection : voit la liste");
  },
};
