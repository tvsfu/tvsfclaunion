// Service worker de TV SFC LA UNION
// Solo guarda la "carcasa" de la app. NO toca streams, Firebase ni /api/proxy.
const CACHE = 'tvsfc-v3';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // streams, Firebase, CDNs: directo a la red
  if (url.pathname.startsWith('/api/')) return;          // proxy: directo a la red
  if (url.pathname.startsWith('/a/')) return;            // enlaces de anuncios compartidos: directo a la red

  // Páginas: primero la red (siempre la versión más nueva); sin internet, la guardada
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Iconos y manifest: usa lo guardado y lo actualiza en segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
