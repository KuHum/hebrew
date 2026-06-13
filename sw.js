// ============================================================
// Service Worker for Aleph with Beth Tracker
// ============================================================
const CACHE_NAME = 'aleph-beth-v21';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
];

const STALE_WHILE_REVALIDATE = [
    './index.html',
    './lessons.md',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(STATIC_ASSETS);
            self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(name => {
                    if (name !== CACHE_NAME) return caches.delete(name);
                })
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET') return;

    const isStaleWhileRevalidate = STALE_WHILE_REVALIDATE.some(path =>
        url.pathname.endsWith(path) || url.pathname === path
    );

    if (isStaleWhileRevalidate) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request);
                const networkPromise = fetch(request).then(response => {
                    if (response.ok) cache.put(request, response.clone());
                    return response;
                }).catch(() => {});
                return cachedResponse || networkPromise;
            })()
        );
    } else {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request);
                if (cachedResponse) return cachedResponse;
                try {
                    const networkResponse = await fetch(request);
                    if (networkResponse.ok) cache.put(request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    return new Response('Offline', { status: 503 });
                }
            })()
        );
    }
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
