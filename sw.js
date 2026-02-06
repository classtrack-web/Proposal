// ============================================
// IJ EDUCATION SYSTEM - Service Worker
// TRUE OFFLINE SUPPORT - Full App Works Offline!
// ============================================

const CACHE_NAME = 'ij-education-v5';
const OFFLINE_FALLBACK = '/ClassTrack/offline.html';

// Core shell to pre-cache (these never change paths)
const CORE_CACHE = [
    '/ClassTrack/',
    '/ClassTrack/index.html',
    '/ClassTrack/offline.html',
    '/ClassTrack/manifest.json',
    '/ClassTrack/favicon.ico'
];

// ============================================
// 1. INSTALL - Cache core + fetch app bundle
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing - Full Offline Support');

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // First cache the core files
            console.log('[SW] Caching core files...');
            await cache.addAll(CORE_CACHE);

            // Now fetch and cache the main page to get JS/CSS references
            console.log('[SW] Fetching app bundle...');
            try {
                const response = await fetch('/ClassTrack/index.html');
                const html = await response.text();

                // Extract JS and CSS file paths from HTML
                const jsMatch = html.match(/src="([^"]*\.js)"/g);
                const cssMatch = html.match(/href="([^"]*\.css)"/g);

                const assetsToCache = [];

                if (jsMatch) {
                    jsMatch.forEach(match => {
                        const path = match.match(/src="([^"]*)"/)[1];
                        if (path.includes('/ClassTrack/') || path.startsWith('/')) {
                            assetsToCache.push(path);
                        }
                    });
                }

                if (cssMatch) {
                    cssMatch.forEach(match => {
                        const path = match.match(/href="([^"]*)"/)[1];
                        if (path.includes('/ClassTrack/') && path.endsWith('.css')) {
                            assetsToCache.push(path);
                        }
                    });
                }

                console.log('[SW] Caching app assets:', assetsToCache);

                // Cache each asset
                for (const asset of assetsToCache) {
                    try {
                        const assetResponse = await fetch(asset);
                        if (assetResponse.ok) {
                            await cache.put(asset, assetResponse);
                            console.log('[SW] Cached:', asset);
                        }
                    } catch (e) {
                        console.warn('[SW] Failed to cache:', asset);
                    }
                }

            } catch (e) {
                console.warn('[SW] Could not fetch app bundle:', e);
            }

            console.log('[SW] ✅ Full app cached for offline use!');
        })
    );

    self.skipWaiting();
});

// ============================================
// 2. ACTIVATE - Clean old caches
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'offline-queue') {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// ============================================
// 3. FETCH - TRUE OFFLINE SUPPORT
// The app will work fully offline!
// ============================================
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Skip non-GET
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Skip external requests (Firebase, CDNs for fonts, etc)
    // These will use Firebase's built-in offline persistence
    if (!url.origin.includes(self.location.origin) &&
        !url.pathname.includes('/ClassTrack/')) {
        return;
    }

    // NAVIGATION REQUESTS (HTML pages)
    if (request.mode === 'navigate') {
        event.respondWith(
            // Try network first
            fetch(request)
                .then((response) => {
                    // Cache successful responses
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                })
                .catch(async () => {
                    // OFFLINE: Serve cached app
                    console.log('[SW] Offline - serving cached app');

                    const cached = await caches.match(request);
                    if (cached) return cached;

                    // Try index.html
                    const indexCached = await caches.match('/ClassTrack/index.html');
                    if (indexCached) return indexCached;

                    const rootCached = await caches.match('/ClassTrack/');
                    if (rootCached) return rootCached;

                    // Last resort: offline page
                    return caches.match(OFFLINE_FALLBACK);
                })
        );
        return;
    }

    // JS/CSS ASSETS - Cache First (app bundle)
    if (request.destination === 'script' ||
        request.destination === 'style' ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css')) {

        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) {
                    console.log('[SW] Serving cached asset:', url.pathname);
                    // Update in background
                    fetch(request).then(response => {
                        if (response && response.ok) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(request, response);
                            });
                        }
                    }).catch(() => { });
                    return cached;
                }

                // Not cached, fetch and cache
                return fetch(request).then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                }).catch(() => {
                    console.warn('[SW] Asset fetch failed:', url.pathname);
                    return new Response('', { status: 503 });
                });
            })
        );
        return;
    }

    // IMAGES & FONTS - Cache First
    if (request.destination === 'image' ||
        request.destination === 'font' ||
        url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/)) {

        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;

                return fetch(request).then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, clone);
                        });
                    }
                    return response;
                }).catch(() => {
                    return new Response('', { status: 503 });
                });
            })
        );
        return;
    }

    // OTHER REQUESTS - Network with cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// ============================================
// 4. BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
    console.log('[SW] Background Sync:', event.tag);

    if (event.tag === 'sync-attendance' ||
        event.tag === 'sync-data' ||
        event.tag === 'sync-queue') {
        event.waitUntil(processOfflineQueue());
    }
});

async function processOfflineQueue() {
    try {
        const cache = await caches.open('offline-queue');
        const requests = await cache.keys();

        console.log('[SW] Processing queue:', requests.length, 'items');

        for (const request of requests) {
            try {
                const cachedData = await cache.match(request);
                if (cachedData) {
                    const data = await cachedData.json();
                    await fetch(request.url, {
                        method: data.method || 'POST',
                        headers: data.headers || {},
                        body: data.body ? JSON.stringify(data.body) : undefined
                    });
                    await cache.delete(request);
                }
            } catch (error) {
                console.error('[SW] Sync failed:', request.url);
            }
        }

        // Notify app
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({ type: 'SYNC_COMPLETE' });
        });
    } catch (error) {
        console.error('[SW] Queue error:', error);
    }
}

// ============================================
// 5. PERIODIC SYNC
// ============================================
self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Periodic Sync:', event.tag);

    if (event.tag === 'sync-content') {
        event.waitUntil(refreshCache());
    } else if (event.tag === 'update-data' || event.tag === 'check-updates') {
        event.waitUntil(notifyClients('REFRESH_DATA'));
    }
});

async function refreshCache() {
    const cache = await caches.open(CACHE_NAME);
    for (const url of CORE_CACHE) {
        try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) await cache.put(url, response);
        } catch (e) { }
    }
    await notifyClients('PERIODIC_SYNC_COMPLETE');
}

async function notifyClients(type) {
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type }));
}

// ============================================
// 6. PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let data = {
        title: 'IJ Education System',
        body: 'New notification',
        icon: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png'
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: 'ij-notification',
            actions: [
                { action: 'open', title: 'Open' },
                { action: 'dismiss', title: 'Dismiss' }
            ],
            vibrate: [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            for (const client of clients) {
                if (client.url.includes('/ClassTrack/') && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow('/ClassTrack/');
        })
    );
});

// ============================================
// 7. MESSAGE HANDLER
// ============================================
self.addEventListener('message', (event) => {
    if (!event.data) return;

    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_URLS':
            if (event.data.urls) {
                caches.open(CACHE_NAME).then(cache => {
                    cache.addAll(event.data.urls);
                });
            }
            break;

        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                if (event.ports?.[0]) {
                    event.ports[0].postMessage({ success: true });
                }
            });
            break;

        case 'QUEUE_REQUEST':
            if (event.data.request) {
                queueRequest(event.data.request).then(() => {
                    if (event.ports?.[0]) {
                        event.ports[0].postMessage({ queued: true });
                    }
                });
            }
            break;
    }
});

async function queueRequest(requestData) {
    const cache = await caches.open('offline-queue');
    const request = new Request(requestData.url);
    const response = new Response(JSON.stringify({
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body,
        timestamp: Date.now()
    }));
    await cache.put(request, response);
}

// ============================================
// 8. ERROR HANDLING
// ============================================
self.addEventListener('error', (e) => console.error('[SW] Error:', e.error));
self.addEventListener('unhandledrejection', (e) => console.error('[SW] Rejection:', e.reason));

console.log('[SW] ✅ Service Worker loaded - TRUE OFFLINE SUPPORT');
