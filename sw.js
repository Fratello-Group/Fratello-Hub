/* Fratello Hub service worker.
 *
 * Goals: make the app installable (enables Android's "Install app" prompt) and
 * load instantly / work offline — WITHOUT ever caching auth or live data.
 *
 * Safety rules:
 *  - Only same-origin GET requests are ever touched.
 *  - Cross-origin requests (Firebase SDK on gstatic, Firestore + Identity
 *    Toolkit on googleapis, Google Fonts) pass straight through to the network,
 *    so sign-in and data are always live.
 *  - Netlify functions (/.netlify/...) are never cached.
 *  - Page loads are network-first (you always get the latest app when online),
 *    with a cached fallback only when offline.
 *  - Static assets (CSS/JS/icons/fonts/json) are stale-while-revalidate: served
 *    instantly from cache and refreshed in the background.
 */
const CACHE = 'fratello-hub-v1';
const PRECACHE = [
    '/index.html',
    '/system/fratello-ui.css',
    '/assets/icon-192.png',
    '/assets/icon-512.png',
    '/assets/apple-touch-icon.png',
    '/manifest.webmanifest'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE).then(cache =>
            Promise.allSettled(PRECACHE.map(url => cache.add(url)))
        )
    );
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;                       // never touch writes

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;        // Firebase / Google / fonts → network
    if (url.pathname.startsWith('/.netlify/')) return;      // server functions → always network

    // Page loads: network-first so the app is always current; fall back to the
    // last-seen page (or the shell) when offline.
    if (req.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const res = await fetch(req);
                const cache = await caches.open(CACHE);
                cache.put(req, res.clone());
                return res;
            } catch (err) {
                const cache = await caches.open(CACHE);
                return (await cache.match(req)) || (await cache.match('/index.html')) || Response.error();
            }
        })());
        return;
    }

    // Static assets: instant from cache, refreshed in the background.
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
        }).catch(() => cached);
        return cached || network;
    })());
});
