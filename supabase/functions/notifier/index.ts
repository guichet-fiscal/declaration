// Guichet fiscal : service d'envoi des notifications (Supabase Edge Function « notifier »).
//
// Appelé par la base (mise à jour 10) quand le registre change, et une fois par heure pour les
// délais expirés ; appelé par le guichet pour connaître la clé publique d'envoi et pour une
// notification d'essai. Depuis la mise à jour 32, il prévient aussi les fonctionnaires (messages,
// agenda, notes de service, absences, paye versée, rappels de leur agenda personnel depuis la mise
// à jour 34, au délai choisi par chacun et toutes les 5 minutes depuis la 35) sur leurs appareils,
// et poste les alertes du
// personnel dans les salons Discord réglés au guichet (Réglages → Discord). Les clés d'envoi sont
// créées au premier appel et gardées dans la table privée notif_config : rien à copier à la main.
//
// Déploiement : Supabase → Edge Functions → notifier, avec « Verify JWT » désactivé (la base
// s'authentifie avec la clé de notif_config, le guichet avec la session de l'agent).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { evenement, delais, personnel, rappelsAgenda, rappelsPerso, rappelsChoisis, rappelsPersoChoisis, heuresLundi, COLLECTIONS_PERSONNEL } from "./regles.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Conf = { secret: string; vapid_public: string | null; vapid_private: string | null };
type Abo = { endpoint: string; p256dh: string; auth: string };

async function conf(): Promise<Conf> {
  const { data, error } = await db.from("notif_config").select("secret,vapid_public,vapid_private").eq("id", 1).single();
  if (error || !data) throw new Error("Table notif_config absente : exécutez supabase/v10_notifications.sql.");
  if (data.vapid_public && data.vapid_private) return data;
  // Premier appel : création des clés d'envoi (une seule fois, même si deux appels arrivent ensemble).
  const k = webpush.generateVAPIDKeys();
  await db.from("notif_config").update({ vapid_public: k.publicKey, vapid_private: k.privateKey }).eq("id", 1).is("vapid_public", null);
  const again = await db.from("notif_config").select("secret,vapid_public,vapid_private").eq("id", 1).single();
  return again.data as Conf;
}

async function envoyer(c: Conf, abos: Abo[], msg: Record<string, unknown>) {
  webpush.setVapidDetails("https://guichet-fiscal.github.io/declaration/", c.vapid_public!, c.vapid_private!);
  let ok = 0;
  await Promise.all(abos.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 12 * 3600, urgency: "normal" });
      ok++;
    } catch (e) {
      // Appareil désabonné ou navigateur réinstallé : l'abonnement ne sert plus.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("notif_abonnements").delete().eq("endpoint", s.endpoint);
    }
  }));
  return ok;
}

async function destinataires(type: string, auteur: string | null): Promise<Abo[]> {
  const { data } = await db.rpc("notif_destinataires", { p_type: type, p_auteur: auteur });
  return (data || []) as Abo[];
}

// Fonctionnaires : leurs appareils abonnés à ce type (fids null = tous ceux en service).
type AboAgent = Abo & { fid: string };
async function aboAgents(fids: string[] | null, type: string): Promise<AboAgent[]> {
  const { data, error } = await db.rpc("notif_agents", { p_fids: fids, p_type: type });
  if (error) return [];
  return (data || []) as AboAgent[];
}
const SITE = "https://guichet-fiscal.github.io/declaration/";
// Même image que les messages publiés depuis le guichet (sinon Discord prend celle du webhook).
const AVATAR = SITE + "assets/logo-prefecture.png";
type Discord = { webhooks?: Record<string, string>; auto?: Record<string, boolean>; nom?: string; mentionPersonnel?: string };
async function discordConf(): Promise<Discord> {
  const { data } = await db.from("parametres_prives").select("valeur").eq("cle", "discord").maybeSingle();
  return ((data && data.valeur) || {}) as Discord;
}
// Discord refuse tout le message si une mention autorisée n'est pas un identifiant valable.
const ids = (l?: string[]) => [...new Set((l || []).map(String).filter((v) => /^\d{15,21}$/.test(v)))].slice(0, 100);
async function posterDiscord(d: Discord, x: { canal: string; auto?: string; texte: string; users?: string[]; roles?: string[] }) {
  const url = d.webhooks && d.webhooks[x.canal];
  if (!url) return false;
  if (x.auto && d.auto && x.auto in d.auto && !d.auto[x.auto]) return false;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      content: x.texte.slice(0, 1990), username: d.nom || "Préfecture de police", avatar_url: AVATAR,
      allowed_mentions: { parse: [], users: ids(x.users), roles: ids(x.roles) } }) });
    return r.ok;
  } catch (_e) { return false; }
}
async function fonctionnaires() {
  const { data } = await db.from("registre").select("id,data").eq("collection", "fonctionnaires");
  return new Map((data || []).map((r: { id: string; data: Record<string, unknown> }) => [r.id, r.data]));
}
// Un changement du personnel : notifications aux fonctionnaires, à l'encadrement, et salons Discord.
async function traiterPersonnel(c: Conf, body: Record<string, unknown>) {
  const d = await discordConf();
  const res = personnel(body, { foncs: await fonctionnaires(), site: SITE, rolePersonnel: d.mentionPersonnel || "" });
  if (!res) return { envoyes: 0, discord: 0 };
  let envoyes = 0, discord = 0;
  for (const a of res.agents) {
    if (a.parFid) {
      const abos = await aboAgents(Object.keys(a.parFid), a.type);
      for (const [fid, msg] of Object.entries(a.parFid)) envoyes += await envoyer(c, abos.filter((x) => x.fid === fid), { ...(msg as Record<string, unknown>), type: a.type });
    } else envoyes += await envoyer(c, await aboAgents(a.fids, a.type), { ...a.msg, type: a.type });
  }
  if (res.equipe) envoyes += await envoyer(c, await destinataires("personnel", (body.auteur as string) || null), res.equipe);
  for (const x of res.discord) if (await posterDiscord(d, x)) discord++;
  return { envoyes, discord };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const c = await conf();
    if (req.method === "GET") return json({ publicKey: c.vapid_public });
    const body = await req.json().catch(() => ({}));
    const cle = req.headers.get("x-guichet-cle");

    // Appels de la base : un changement du registre, ou le passage horaire des délais.
    if (cle !== null) {
      if (cle !== c.secret) return json({ error: "clé refusée" }, 401);
      if (body.type === "delais") {
        const now = Date.now();
        const { data } = await db.from("registre").select("collection,id,data").in("collection", ["config", "relances", "controles", "decisions", "declarations", "prets", "convocations", "conventions", "agenda"]);
        // Rappels d'agenda fixes d'une heure, tant que la mise à jour 35 (rappels au choix, passage de
        // 5 minutes) n'est pas exécutée ; ensuite, c'est le passage « rappels » qui s'en charge.
        let rappels = 0;
        const { error: sans35 } = await db.from("rappels_agents").select("fid").limit(1);
        if (sans35) {
          for (const r of rappelsAgenda(data || [], now - 3600e3, now)) {
            const abos = (await aboAgents(r.fids, r.type)).filter((x) => !r.exclure.includes(x.fid));
            rappels += await envoyer(c, abos, { ...r.msg, type: r.type });
          }
          const { data: perso } = await db.from("agenda_perso").select("id,fid,titre,debut,lieu,journee,rappel")
            .eq("rappel", true).eq("journee", false).gt("debut", new Date(now).toISOString()).lte("debut", new Date(now + 3600e3).toISOString());
          for (const r of rappelsPerso(perso || [], now - 3600e3, now)) rappels += await envoyer(c, await aboAgents([r.fid], r.type), { ...r.msg, type: r.type });
        }
        const msg = delais(data || [], now - 3600e3, now);
        if (!msg) return json({ ok: true, envoyes: rappels });
        return json({ ok: true, envoyes: rappels + await envoyer(c, await destinataires("delais", null), msg) });
      }
      // Passage de 5 minutes (mise à jour 35) : rappels d'agenda à l'heure choisie par chacun.
      if (body.type === "rappels") {
        const pas = 300e3, t0 = Math.floor(Date.now() / pas) * pas, jusqua = new Date(t0 + 1440 * 60e3 + pas).toISOString();
        const { data: ag } = await db.from("registre").select("collection,id,data").eq("collection", "agenda");
        const foncs = await fonctionnaires();
        const actifs = [...foncs].filter(([, f]) => f && f.actif !== false).map(([id]) => id);
        const { data: pr } = await db.from("rappels_agents").select("fid,defaut_min,evenements");
        const prefs = new Map((pr || []).map((p: { fid: string }) => [p.fid, p]));
        let envoyes = 0;
        for (const r of rappelsChoisis(ag || [], actifs, prefs, t0, pas)) envoyes += await envoyer(c, await aboAgents(r.fids, r.type), { ...r.msg, type: r.type });
        const { data: perso } = await db.from("agenda_perso").select("id,fid,titre,debut,lieu,journee,rappel,rappel_min")
          .eq("journee", false).not("rappel_min", "is", null).gt("debut", new Date(t0 - pas).toISOString()).lte("debut", jusqua);
        for (const r of rappelsPersoChoisis(perso || [], t0, pas)) envoyes += await envoyer(c, await aboAgents([r.fid], r.type), { ...r.msg, type: r.type });
        return json({ ok: true, envoyes });
      }
      // Lundi soir (mise à jour 36) : heures de la semaine passée pas encore saisies dans la paye.
      if (body.type === "lundi") {
        const { data: py } = await db.from("registre").select("id,data").eq("collection", "payes");
        const r = heuresLundi(py || [], await fonctionnaires(), Date.now(), SITE);
        if (!r) return json({ ok: true, envoyes: 0 });
        const envoyes = await envoyer(c, await destinataires(r.push.type, null), r.push);
        return json({ ok: true, envoyes, discord: (await posterDiscord(await discordConf(), r.discord)) ? 1 : 0 });
      }
      if (COLLECTIONS_PERSONNEL.includes(body.collection)) return json({ ok: true, ...(await traiterPersonnel(c, body)) });
      let ctx = {};
      if (body.collection === "decisions") {
        const { data } = await db.from("registre").select("data").eq("collection", "declarations").eq("id", body.id).maybeSingle();
        ctx = { declaration: data ? data.data : null };
      }
      const msg = evenement(body, ctx);
      if (!msg) return json({ ok: true, envoyes: 0 });
      return json({ ok: true, envoyes: await envoyer(c, await destinataires(msg.type, body.auteur || null), msg) });
    }

    // Appel d'un agent connecté : notification d'essai sur ses appareils (ou sur celui-ci).
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u || !u.user) return json({ error: "connexion requise" }, 401);
    let q = db.from("notif_abonnements").select("endpoint,p256dh,auth").eq("user_id", u.user.id);
    if (body.endpoint) q = q.eq("endpoint", body.endpoint);
    const { data: abos } = await q;
    const n = await envoyer(c, (abos || []) as Abo[], { title: "Guichet fiscal", body: "Notification d’essai : elles arrivent bien sur cet appareil.", url: "#dashboard", tag: "essai" });
    return json({ ok: true, envoyes: n });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
