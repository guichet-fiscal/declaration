// Guichet fiscal : service minimal pour installer le site comme une application.
// La page et sa configuration viennent toujours du réseau d'abord : chaque mise en ligne
// est prise en compte au prochain chargement. Le cache ne sert qu'en cas de coupure.
// Les images, polices et la bibliothèque Supabase (version figée) sont gardées en cache.
// Les données du registre (Supabase), les pièces des contrôles et Discord ne passent
// jamais par ce cache.
const VERSION = "guichet-v7";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "assets/logo-prefecture.png", "assets/favicon.png",
  "assets/apple-touch-icon.png", "assets/icon-192.png", "assets/icon-512.png"];
const LIBS = ["cdn.jsdelivr.net", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const keep = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; };
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url), same = url.origin === self.location.origin;
  if (!same && !LIBS.includes(url.hostname)) return;
  const page = same && (req.mode === "navigate" || /\/(index\.html)?$/.test(url.pathname) || url.pathname.endsWith("/config.js") || url.pathname.endsWith(".webmanifest"));
  if (page) {
    e.respondWith(fetch(req).then(res => keep(req, res)).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => keep(req, res))));
});
