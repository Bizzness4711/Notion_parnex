// FCM push: token alip Firestore'a yazar; on planda geleni bildirim merkezine düşürür.
// Iki mod:
//  - Web (GitHub Pages / tarayici): Firebase Web SDK + service worker + VAPID anahtari.
//  - Capacitor (Android APK): @capacitor-firebase/messaging native eklentisi.
//    Native modda uygulama kapaliyken de bildirim gelır (Android sistem servisi).
// Her iki mod da token'i ayni yola yazar: users/{uid}/pushTokens/{token}
// -> tools/push/send.js (GitHub Actions) bu koleksiyondan okur, degisiklik gerekmez.
const FCM_VAPID_KEY = 'BEE_2EhTp5qwYC1RTR-I3qAI92uY4tm4dsczZVm_tg1CxtatXs6bywzsqpidKnNh4p2cz5V1Slth30-wbmFVZIA';

function isCapacitorNative() {
    return typeof window !== 'undefined' && Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

async function savePushToken(token, platformLabel) {
    if (!token || typeof currentUser === 'undefined' || !currentUser) return;
    await db.collection('users').doc(currentUser.uid).collection('pushTokens').doc(token).set({
        platform: platformLabel,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

// --- Capacitor (Android APK) modu ---
// Not: sayfa uzak URL'den (GitHub Pages) yuklendigi icin ES import kullanilamaz;
// Capacitor koprusu her sayfaya enjekte edilir, eklenti global proxy'den erisilir.
async function initPushNative() {
    const FirebaseMessaging = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseMessaging;
    if (!FirebaseMessaging) {
        console.warn('FirebaseMessaging eklentisi bulunamadı. @capacitor-firebase/messaging kurulu mu?');
        return;
    }

    // Android 13+: bildirim izni system diyaloguyla sorulur.
    if (typeof FirebaseMessaging.requestPermissions === 'function') {
        const perm = await FirebaseMessaging.requestPermissions();
        if (perm && perm.receive === 'denied') {
            console.warn('Push bildirim izni verilmedi.');
            return;
        }
    }

    // Native FCM token'i (VAPID gerekmez; google-services.json devreye girer).
    const result = await FirebaseMessaging.getToken();
    await savePushToken(result && result.value, 'android-native');

    // Token yenilenirse guncelle (uygulama acikken).
    await FirebaseMessaging.addListener('tokenReceived', async (event) => {
        try { await savePushToken(event && event.value, 'android-native'); } catch (e) { console.warn('Token yenilenemedi.', e); }
    });

    // Uygulama on plandayken gelen push: bildirim merkezine dusur + ses.
    await FirebaseMessaging.addListener('notificationReceived', (event) => {
        const n = (event && event.notification) || {};
        const title = n.title || 'Parnex';
        const body = n.body || 'Yeni bildiriminiz var.';
        if (typeof addNotification === 'function') addNotification(`push-${Date.now()}`, body, 'fa-bell', title);
        else if (typeof playNotificationSound === 'function') playNotificationSound();
    });

    // Bildirime dokununca bildirim listesini tazele.
    await FirebaseMessaging.addListener('notificationActionPerformed', () => {
        if (typeof updateNotificationsUI === 'function') updateNotificationsUI();
    });
}

// --- Web modu (eski akis) ---
async function initPushWeb() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (typeof firebase === 'undefined' || !firebase.messaging) return;
    if (!FCM_VAPID_KEY || FCM_VAPID_KEY.indexOf('PASTE') !== -1) {
        console.warn('FCM VAPID anahtarı girilmeden push çalışmaz (js/push.js).');
        return;
    }
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    const messaging = firebase.messaging();
    if (Notification.permission !== 'granted') return;
    const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    await savePushToken(token, navigator.platform || 'web');
    // Uygulama açıkken gelen push: bildirim merkezine düşer + ses çalar.
    messaging.onMessage((payload) => {
        const title = (payload && payload.notification && payload.notification.title) || 'Parnex';
        const body = (payload && payload.notification && payload.notification.body) || 'Yeni bildiriminiz var.';
        if (typeof addNotification === 'function') addNotification(`push-${Date.now()}`, body, 'fa-bell', title);
        else if (typeof playNotificationSound === 'function') playNotificationSound();
    });
    if (typeof messaging.onTokenRefresh === 'function') {
        messaging.onTokenRefresh(async () => {
            try {
                const t = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
                await savePushToken(t, navigator.platform || 'web');
            } catch (e) { console.warn('Push token yenilenemedi.', e); }
        });
    }
}

async function initPush() {
    try {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        if (isCapacitorNative()) {
            await initPushNative();
        } else {
            await initPushWeb();
        }
    } catch (e) {
        console.warn('Push başlatılamadı.', e);
    }
}
