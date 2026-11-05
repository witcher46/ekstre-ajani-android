const name = 'ekstre-mobile-v2';
const shell = ['./', 'index.html', 'app.mjs', 'model.mjs', 'sample.mjs', 'style.css',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(name).then(cache => cache.addAll(shell)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('ekstre-mobile-') && key !== name)
    .map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const asset = shell.find(path => new URL(path, self.registration.scope).href === event.request.url);
  if (asset) event.respondWith(caches.open(name).then(async cache =>
    (await cache.match(asset)) ?? fetch(event.request)));
});
