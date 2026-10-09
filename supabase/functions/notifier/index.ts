// Guichet fiscal : service d'envoi des notifications (Supabase Edge Function « notifier »).
//
// Appelé par la base (mise à jour 10) quand le registre change, et une fois par heure pour les
// délais expirés ; appelé par le guichet pour connaître la clé publique d'envoi et pour une
// notification d'essai. Les clés d'envoi sont créées au premier appel et gardées dans la table
// privée notif_config : rien à copier à la main.
//
// Déploiement : Supabase → Edge Functions → notifier, avec « Verify JWT » désactivé (la base
// s'authentifie avec la clé de notif_config, le guichet avec la session de l'agent).

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { evenement, delais } from "./regles.ts";

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
        const { data } = await db.from("registre").select("collection,id,data").in("collection", ["config", "relances", "controles", "decisions", "declarations", "prets", "convocations"]);
        const msg = delais(data || [], now - 3600e3, now);
        if (!msg) return json({ ok: true, envoyes: 0 });
        return json({ ok: true, envoyes: await envoyer(c, await destinataires("delais", null), msg) });
      }
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
