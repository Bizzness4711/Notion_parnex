// FCM arka plan service worker'ı. Sitenin kökünde durmalı (index.html ile aynı klasör).
// https (veya localhost) gerekir; file:// ile çalışmaz.
importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyDc5VzYalm9J39uHHNNpVgVA_FZolKOMQM',
    projectId: 'parnex-97d1b',
    messagingSenderId: '909377657628',
    appId: '1:909377657628:web:44192bd16b27046834b8d9'
});

const messaging = firebase.messaging();

// Uygulama kapalıyken gelen push burada gösterilir.
messaging.onBackgroundMessage((payload) => {
    const title = (payload && payload.notification && payload.notification.title) || 'Finora';
    const body = (payload && payload.notification && payload.notification.body) || 'Yeni bildiriminiz var.';
    self.registration.showNotification(title, { body, icon: 'icons/logo-192.png', badge: 'icons/logo-192.png', tag: 'finora' });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow('./'));
});
