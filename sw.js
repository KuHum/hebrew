// ============================================================
// Service Worker for Aleph with Beth Tracker
// ============================================================
// Implements offline-first caching strategies:
//   - Cache-first for static assets (like the app shell)
//   - Stale-while-revalidate for the main HTML and lessons.md
//   - Automatic cache cleanup on activation
// ============================================================

const CACHE_NAME = 'aleph-beth-v2';

// Files that should be cached on install (app shell)
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    // Inline styles & script are inside index.html, but we list it anyway
];

// Files that use stale-while-revalidate (always serve cached first,
// then update in background)
const STALE_WHILE_REVALIDATE = [
    './index.html',
    './lessons.md',
];

// ------------------------------------------------------------
// INSTALL EVENT
// Pre-caches the app shell for offline use
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
    console.log('[SW] Install event');
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            // Add all static assets to the cache
            await cache.addAll(STATIC_ASSETS);
            console.log('[SW] App shell cached');
            // Force the waiting service worker to become active immediately
            self.skipWaiting();
        })()
    );
});

// ------------------------------------------------------------
// ACTIVATE EVENT
// Clean up old caches and take control of all clients
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate event');
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    }
                })
            );
            // Claim all clients so the SW controls all pages immediately
            await self.clients.claim();
        })()
    );
});

// ------------------------------------------------------------
// FETCH EVENT
// Routes requests to the appropriate caching strategy
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Determine if this request should use stale-while-revalidate
    const isStaleWhileRevalidate = STALE_WHILE_REVALIDATE.some((path) => {
        return url.pathname.endsWith(path) || url.pathname === path;
    });

    if (isStaleWhileRevalidate) {
        // Stale-while-revalidate: respond from cache immediately,
        // then update cache from network for next time.
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request);

                // Start network fetch in background to update cache
                const networkPromise = fetch(request).then((response) => {
                    if (response.ok) {
                        cache.put(request, response.clone());
                    }
                    return response;
                }).catch(() => {
                    // Offline, ignore
                });

                // Return cached response immediately, or wait for network if not cached
                return cachedResponse || networkPromise;
            })()
        );
    } else {
        // Cache-first for everything else (static assets, icons, etc.)
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Not in cache, fetch from network and cache it
                try {
                    const networkResponse = await fetch(request);
                    if (networkResponse.ok) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    // Offline and not cached - could return a fallback
                    return new Response('Offline content not available', { status: 503 });
                }
            })()
        );
    }
});

// ------------------------------------------------------------
// MESSAGE EVENT
// Allows the page to trigger skipWaiting if needed
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
