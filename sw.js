/* Parnex service worker: uygulama kabuğu önbelleği + offline + FCM push.
 *
 * Neden ayrı bir dosya yok: firebase-messaging-sw.js de kök scope'ta kayıt oluyordu.
 * Aynı scope'a ikinci bir service worker kaydedilemez; son kayıt olan kazanır ve
 * push sessizce bozulur. Bu yüzden iki sorumluluk tek dosyada birleştirildi ve
 * js/push.js bu dosyayı kaydedecek şekilde güncellendi.
 *
 * Kurallar:
 *  - Kabuk (HTML/CSS/JS/ikon) ağdan önce sunulur, arkada tazelenir (stale-while-revalidate).
 *  - Firebase/CDN betikleri sürümlü URL olduğu için cache-first.
 *  - Kurban API'leri (döviz, altın) asla önbelleklenmez; stale kur veri yanlış bakiye demektir.
 *  - Firestore/Auth trafiği dokunulmadan geçer.
 *  - Firebase SDK yalnızca push geldiğinde yüklenir; aksi halde çevrimdışı ilk
 *    kurulumda install başarısız olurdu.
 */

const CACHE_VERSION = 'parnex-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_FALLBACK = './www/index.html';

// Sürüm değişince bu listeyi güncelle. test/pwa.test.mjs her girdinin
// diskte var olduğunu doğrular; yeni dosya eklerken buraya da ekle.
const PRECACHE = [
    './',
    './index.html',
    './404.html',
    './manifest.webmanifest',
    './icons/logo.svg',
    './icons/logo-192.png',
    './icons/logo-512.png',
    './icons/maskable-192.png',
    './icons/maskable-512.png',
    './icons/apple-touch-icon.png',
    './data/login-photo.jpg',
    './css/base.css',
    './css/components.css',
    './css/landing.css',
    './css/layout.css',
    './css/pages.css',
    './css/theme.css',
    './css/ux-refresh.css',
    './css/pwa.css',
    './js/firebase-config.js',
    './js/utils.js',
    './js/categories.js',
    './js/notifications.js',
    './js/budgets.js',
    './js/security.js',
    './js/health.js',
    './js/command-palette.js',
    './js/rates.js',
    './js/accounts.js',
    './js/transactions.js',
    './js/charts.js',
    './js/sprint1.js',
    './js/onboarding.js',
    './js/main.js',
    './js/tablexfer.js',
    './js/printreport.js',
    './js/pwa.js',
    './js/push.js',
    './js/admin.js',
    './altin/index.html',
    './birikim/index.html',
    './butce/index.html',
    './butce-hesapla/index.html',
    './gelir-gider/index.html',
    './harcama/index.html',
    './yatirim/index.html',
    // Capacitor'ın webDir'i (www/) ve çevrimdışı yönlendirme sayfası.
    './www/index.html'
];

// Uygulama kabuğu bu CDN betikleri olmadan mount olmaz: firebase-config.js
// firebase.initializeApp çağırır ve SDK yoksa patlar, ardından tum app JS'i
// calismaz. Sürümlü URL'ler olduklari icin onbellege almak guvenli.
// (SRI hash'leri sunucudan gelen ayni baytlarla dogrulanir.)
const CDN_PRECACHE = [
    'https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.0/firebase-messaging-compat.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Sürümlü CDN betikleri: içerik değişmez, uzun süre cache-first güvenli.
const CDN_HOSTS = ['www.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

// Kur/kura işlemleri: hiçbir zaman cache'e girmez.
const CURRENCY_HOSTS = [
    'open.er-api.com',
    'api.frankfurter.app',
    'api.exchangerate-api.com',
    'api.gold-api.com',
    'data-asg.goldprice.org',
    'xaus.com'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // Tek tek ekle: bir 404 tek dosyada tüm kurulumu düşürmesin.
        // CDN betikleri SRI nedeniyle 'cors' modunda istenir; aksi halde
        // sunucu opaque (status 0) yanıt döner ve offline'ta boş gövde gelir.
        const requests = PRECACHE.map(url => new Request(url, { cache: 'reload' }));
        const cdn = CDN_PRECACHE.map(url => new Request(url, { mode: 'cors', credentials: 'omit' }));
        await Promise.all([...requests, ...cdn].map(request =>
            cache.add(request).catch(err => {
                console.warn('[sw] önbelleğe alınamadı:', request.url, err.message);
            })));
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name !== SHELL_CACHE && name !== RUNTIME_CACHE)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

// js/pwa.js, yeni sürüm hazır olduğunda SWIPER_WAITING gönderir.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCdnScript(url) {
    return url.hostname.endsWith('cdnjs.cloudflare.com')
        || url.hostname.endsWith('cdn.jsdelivr.net')
        || url.hostname.endsWith('gstatic.com');
}

// Dizin URL'leri ("/butce/") cache'te dosya olarak tutulur ("/butce/index.html").
// Aksi halde cache.match('/butce/') hiçbir şey bulmaz ve navigasyon yanlışlıkla
// ana sayfaya düşer.
function directoryCandidates(url) {
    if (!url.pathname.endsWith('/')) return [];
    return [url.pathname + 'index.html'];
}

async function matchShell(request, url) {
    const cache = await caches.open(SHELL_CACHE);
    const direct = await cache.match(request, { ignoreSearch: true });
    if (direct) return direct;
    for (const candidate of directoryCandidates(url)) {
        const hit = await cache.match(candidate, { ignoreSearch: true });
        if (hit) return hit;
    }
    return null;
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    // 'cors'/'basic' yanıtlar saklanabilir; opaque (status 0) yanıtın gövdesi
    // offline'ta okunamaz, bu yüzden tutulmaz.
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, response.clone());
    }
    return response;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(SHELL_CACHE);
    const url = new URL(request.url);
    const cached = await matchShell(request, url);
    const network = fetch(request).then(response => {
        // Yalnızca başarılı, temel (basic) yanıtlar saklanır: opaque yanıtın
        // gövdesi okunamadığı için offline'ta kullanılamaz.
        if (response && response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
}

async function handleNavigation(request) {
    const url = new URL(request.url);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            // Dizin isteklerini dosya adiyla sakla: bir sonraki cevrimdisi
            // acilista ayni adres yine ayni kaydi bulsun.
            const key = directoryCandidates(url)[0] || url.pathname;
            cache.put(key, response.clone());
        }
        return response;
    } catch (err) {
        // Once istenen sayfanin kendi kabugu.
        const shell = await matchShell(request, url);
        if (shell) return shell;
        // Kabugu tutulmamis bir adres (yeni eklenen sayfa gibi) icin ana
        // sayfayi dondurmek yanlis: adres /butce/ kalirken index.html
        // doner, goreli varlik yollari /butce/css/... olur ve sayfa
        // hic yuklenmez. Bunun yerine kendi kendine yeten bayt yonlendirme
        // sayfasini goster.
        return (await caches.match(OFFLINE_FALLBACK))
            || (await caches.match('./index.html'))
            || Response.error();
    }
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch (err) {
        return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    if (CURRENCY_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    if (CDN_HOSTS.some(host => url.hostname === host) && isCdnScript(url)) {
        event.respondWith(cacheFirst(request));
    }
    // Firebase Auth/Firestore ve diğer çapraz kaynaklar: dokunma.
});

// ---------------------------------------------------------------- push (FCM)

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDc5VzYalm9J39uHHNNpVgVA_FZolKOMQM',
    projectId: 'parnex-97d1b',
    messagingSenderId: '909377657628',
    appId: '1:909377657628:web:44192bd16b27046834b8d9'
};

let firebaseLoaded = false;

// importScripts yalnızca push geldiğinde çağrılır; install aşamasında değil.
// Aksi halde çevrimdışı ilk kurulumda gstatic'e ulaşılamadığı için SW hiç
// kurulamaz ve uygulama çevrimdışı açılmazdı.
function loadFirebase() {
    if (firebaseLoaded) return true;
    try {
        importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js');
        importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-messaging-compat.js');
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        firebaseLoaded = true;
    } catch (err) {
        console.warn('[sw] Firebase SDK yüklenemedi, push gösterilemiyor:', err.message);
        return false;
    }
    return true;
}

self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let payload = {};
        try {
            payload = event.data ? event.data.json() : {};
        } catch (err) {
            payload = { notification: { body: event.data ? event.data.text() : '' } };
        }
        const notification = payload.notification || {};
        const title = notification.title || 'Parnex';
        const body = notification.body || 'Yeni bildiriminiz var.';
        // Veri mesajları Firebase SDK ile işlenir (data-only payload).
        const isDataOnly = !notification.title && !notification.body;
        if (isDataOnly && loadFirebase()) {
            firebase.messaging().onBackgroundMessage(payload);
            return;
        }
        await self.registration.showNotification(title, {
            body,
            icon: 'icons/logo-192.png',
            badge: 'icons/logo-192.png',
            tag: 'parnex',
            data: payload.data || {}
        });
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        const target = './';
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
            if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                await client.focus();
                if (client.navigate) await client.navigate(target);
                return;
            }
        }
        await self.clients.openWindow(target);
    })());
});