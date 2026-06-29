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
const CACHE = 'fratello-hub-v2';
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

// ── Push notifications + app-icon badge ──
// A push arrives even when the app is closed. We show a banner and stamp the
// red number on the home-screen icon (the count rides in the payload).
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (e) { data = { body: event.data ? event.data.text() : '' }; }

    const title = data.title || 'Fratello Hub';
    const body = data.body || 'You have something that needs your attention.';
    const url = data.url || '/';
    const count = (typeof data.count === 'number') ? data.count : null;

    event.waitUntil((async () => {
        await self.registration.showNotification(title, {
            body,
            icon: '/assets/icon-192.png',
            badge: '/assets/icon-192.png',
            tag: data.tag || 'fratello-approval',
            renotify: true,
            data: { url }
        });
        if (count !== null && self.navigator && self.navigator.setAppBadge) {
            try { count > 0 ? await self.navigator.setAppBadge(count) : await self.navigator.clearAppBadge(); }
            catch (e) { /* badge unsupported */ }
        }
    })());
});

// Tapping the banner focuses the app (or opens it) on the right page.
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil((async () => {
        const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientsList) {
            try { await client.focus(); if (client.navigate) await client.navigate(url); return; }
            catch (e) { /* fall through to openWindow */ }
        }
        if (self.clients.openWindow) await self.clients.openWindow(url);
    })());
});

// If the browser rotates the subscription, the client re-subscribes on next open.
self.addEventListener('pushsubscriptionchange', () => {});

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
