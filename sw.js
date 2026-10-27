// Code de l'app : cache d'abord, donc un lancement immédiat même quand le réseau passe mal en magasin.
// Chaque version de CACHE est un ensemble complet, installé d'un bloc : jamais un nouvel app.js avec un ancien module.
// Changer CACHE à chaque modification des fichiers de l'app, sinon les téléphones gardent l'ancienne version.
// Prix (ingredients.csv) : réseau d'abord, pour recevoir les mises à jour sans changer CACHE ; au bout de 3 s, la copie
// en cache répond (le réseau continue en arrière-plan et la remplace pour la fois suivante).
const CACHE = 'russidge-v16';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'tirage.js', 'menus.js', 'ingredients.csv', 'manifest.webmanifest', 'icon.svg',
  'grain.webp', 'encre.webp', 'polices/archivo.woff2', 'polices/pt-mono-latin.woff2', 'polices/pt-mono-cyrillique.woff2'];
const DELAI_PRIX = 3000;

self.addEventListener('install', (e) => e.waitUntil(
  // `reload` : la version installée vient du serveur, pas du cache HTTP du navigateur.
  caches.open(CACHE).then((c) => c.addAll(FICHIERS.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()),
));

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

// Dans le cache de cette version seulement : l'ancien peut encore exister pendant la mise à jour.
const enCache = (req) => caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }));

function prix(e) {
  const reseau = fetch(e.request, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) return enCache(e.request).then((c) => c || r);
    const copie = r.clone();
    return caches.open(CACHE).then((c) => c.put(e.request, copie)).then(() => r);
  });
  e.waitUntil(reseau.catch(() => {})); // la mise en cache finit même si la copie a déjà répondu
  const secours = new Promise((ok) => setTimeout(ok, DELAI_PRIX)).then(() => enCache(e.request));
  return Promise.race([reseau.catch(() => enCache(e.request)), secours.then((c) => c || reseau)]);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.url.split('?')[0].endsWith('/ingredients.csv')) return e.respondWith(prix(e));
  e.respondWith(enCache(e.request).then((c) => c || fetch(e.request)));
});
