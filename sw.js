// Hors connexion : réseau d'abord (pour recevoir les nouveaux prix), sinon la copie en cache.
// ponytail: réseau d'abord = attente du délai réseau si le signal est très faible en magasin ; passer en « cache d'abord » si c'est gênant.
const CACHE = 'russidge-v3';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'tirage.js', 'ingredients.csv', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS))));

self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copie = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
