// Guichet fiscal : service minimal pour installer le site comme une application.
// La page et sa configuration s'ouvrent tout de suite depuis le cache, pendant que le réseau
// est interrogé en arrière-plan : si une nouvelle version est en ligne, elle est gardée pour la
// prochaine ouverture et les fenêtres ouvertes affichent « Nouvelle version du guichet » avec un
// bouton Recharger. Sans copie en cache (première visite), la page vient du réseau.
// Les images, polices et la bibliothèque Supabase (version figée) sont gardées en cache.
// Les données du registre (Supabase), les pièces des contrôles et Discord ne passent
// jamais par ce cache.
const VERSION = "guichet-v9";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "assets/logo-prefecture.png", "assets/favicon.png",
  "assets/apple-touch-icon.png", "assets/icon-192.png", "assets/icon-512.png"];
// Feuille des polices Google comprise : elle bloquait l'affichage le temps d'un aller-retour réseau.
const LIBS = ["cdn.jsdelivr.net", "fonts.gstatic.com", "fonts.googleapis.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const keep = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };
// Date de publication d'une réponse (GitHub Pages) ; l'ETag ne sert que s'il manque.
const tampon = r => (r && (r.headers.get("last-modified") || r.headers.get("etag"))) || "";
// Prévient les fenêtres ouvertes qu'une nouvelle version est arrivée (elles attendent un peu
// si la page qui vient d'être servie n'a pas encore fini de s'ouvrir).
async function signalerMaj() {
  for (let i = 0; i < 8; i++) {
    const list = await self.clients.matchAll({ type: "window" });
    if (list.length) { list.forEach(c => c.postMessage({ type: "maj" })); return; }
    await new Promise(r => setTimeout(r, 1000));
  }
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url), same = url.origin === self.location.origin;
  if (!same && !LIBS.includes(url.hostname)) return;
  const page = same && (req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname) || url.pathname.endsWith("/config.js") || url.pathname.endsWith(".webmanifest"));
  if (page) {
    // Une seule copie par adresse, sans les paramètres (retour de connexion Discord, etc.).
    const cle = new Request(url.origin + url.pathname);
    e.respondWith(caches.match(cle).then(hit => {
      if (!hit) return fetch(req).then(res => keep(cle, res)).catch(() =>
        caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())));
      // Copie en cache servie tout de suite ; mise à jour en arrière-plan.
      e.waitUntil(fetch(cle.url, { cache: "no-cache", credentials: "same-origin" }).then(async res => {
        if (!res || !res.ok) return;
        await caches.open(VERSION).then(c => c.put(cle, res.clone()));
        const a = tampon(hit), b = tampon(res);
        if (a && b && a !== b) await signalerMaj();
      }).catch(() => {}));
      return hit;
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => keep(req, res))));
});

// Notifications envoyées par le service « notifier » (mise à jour 10).
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  const url = new URL("./" + (d.url || ""), self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(d.title || "Guichet fiscal", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "assets/icon-192.png", badge: "assets/favicon.png", lang: "fr", data: { url }
  }));
});
// Un clic ouvre le dossier : dans la fenêtre du guichet déjà ouverte, sinon dans une nouvelle.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ type: "ouvrir", url }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
