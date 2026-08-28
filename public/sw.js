// Service worker: kabuk önbelleğe alınır (çevrimdışı açılış), veri her zaman ağdan.
// Sürümü değiştirince eski önbellek temizlenir.
const SURUM = 'finans-ajan-v1';
const KABUK = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SURUM)
      .then((c) => c.addAll(KABUK))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // API: her zaman ağ. Ağ yoksa son başarılı yanıtı ver ki panel boş açılmasın.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((yanit) => {
          if (yanit.ok && url.pathname === '/api/veri') {
            const kopya = yanit.clone();
            caches.open(SURUM + '-veri').then((c) => c.put(e.request, kopya));
          }
          return yanit;
        })
        .catch(() => caches.match(e.request).then((c) => c ?? new Response(
          JSON.stringify({ cevrimdisi: true }),
          { headers: { 'Content-Type': 'application/json' } },
        ))),
    );
    return;
  }

  // Kabuk: önce önbellek, arka planda tazele
  e.respondWith(
    caches.match(e.request).then((onbellek) => {
      const ag = fetch(e.request)
        .then((yanit) => {
          if (yanit.ok) {
            const kopya = yanit.clone();
            caches.open(SURUM).then((c) => c.put(e.request, kopya));
          }
          return yanit;
        })
        .catch(() => onbellek);
      return onbellek ?? ag;
    }),
  );
});
