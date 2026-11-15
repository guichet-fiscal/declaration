// Payes : budget du mois conseillé (déjà versé + semaines restantes au rythme + rappels dus) face aux demandes
// « salaires » ; complément préparé en un clic dans « Saisir une demande » ; alerte quand la semaine dépasse
// son budget ; demande du mois suivant (décembre : 5 semaines).
const { ouvrir, onglet, pause, texte } = require("../outils");

const SAL = `
  window.__SEED.push({ collection: "demandes", id: "dsal1", data: { service: "Préfecture", objet: "Budget salaire", nature: "salaires", montant: 100000, urgence: "normale", demandeur: "Direction", recueAt: "2026-11-09T20:00:00Z", periode: "2026-11", createdAt: "2026-11-09T20:00:00Z" } });
  window.__SEED.push({ collection: "arbitrages", id: "dsal1", data: { statut: "accordee", montantAccorde: 100000, at: "2026-11-09T20:00:00Z" } });`;
const euros = (t) => Number(String(t).replace(/[^\d]/g, ""));

module.exports = {
  nom: "Payes : budget conseillé et demande « salaires » préparée",
  async lancer(env, t) {
    const d = await ouvrir(env, { hash: "dashboard", avant: SAL });
    await pause(d, 900);
    await onglet(d, "payes"); await pause(d, 600);
    const c = texte(await d.locator("#py-conseil").innerText());
    t.ok(/Budget des payes de novembre 2026/.test(c) && /Besoin du mois/.test(c) && /Il manque/.test(c), "carte du budget conseillé", c.slice(0, 400));
    t.ok(/Décembre 2026 : 5 semaines de paye/.test(c), "décembre : 5 semaines de paye", c.slice(-300));
    t.contient(texte(await d.locator("#py-depasse").innerText()), "Cette semaine coûte", "alerte : la semaine dépasse son budget");
    const btn = d.locator("#py-complement"), lib = await btn.innerText(), montant = euros(lib.slice(lib.indexOf("(")));
    t.ok(montant > 0 && montant % 10000 === 0, "complément arrondi à 10 000 €", lib);

    await btn.click(); await pause(d, 600);
    t.egal(await d.locator("#m-nature").inputValue(), "salaires", "demande préparée : nature « salaires »");
    t.egal(await d.locator("#m-per").inputValue(), "2026-11", "mois du budget : novembre");
    t.contient(await d.locator("#m-objet").inputValue(), "Complément de salaires novembre 2026", "objet");
    t.egal(euros(await d.locator("#m-total").innerText()), montant, "montant de l'article");
    t.egal((await d.locator("#m-service").inputValue()), "Préfecture", "service : Préfecture");
    t.sansErreur(d);
  },
};
