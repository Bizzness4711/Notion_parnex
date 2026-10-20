// Sends a generic, manually-triggered test notification to one explicitly configured user.
// This script never enumerates users, changes Firestore documents, or logs UIDs/tokens.
'use strict';

const admin = require('firebase-admin');

async function main() {
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    const targetUid = process.env.FIREBASE_TEST_UID;
    if (!keyJson) throw new Error('FIREBASE_SERVICE_ACCOUNT secret is missing.');
    if (!targetUid || !targetUid.trim()) {
        throw new Error('FIREBASE_TEST_UID repository secret is missing; no notification was sent.');
    }

    let credential;
    try {
        credential = admin.credential.cert(JSON.parse(keyJson));
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT JSON could not be parsed; contents are not logged.');
    }

    admin.initializeApp({ credential });
    const db = admin.firestore();
    const messaging = admin.messaging();

    // Read only the explicitly targeted user's existing token documents.
    const tokenSnap = await db.collection('users').doc(targetUid).collection('pushTokens').get();
    const tokens = tokenSnap.docs.map(doc => doc.id).filter(Boolean);
    if (tokens.length === 0) {
        console.log('Test push: hedef kullanıcı için kayıtlı token yok; hiçbir şey gönderilmedi.');
        return;
    }

    let successCount = 0;
    let failureCount = 0;
    const failureCodes = {};
    // FCM multicast accepts at most 500 tokens per call.
    for (let i = 0; i < tokens.length; i += 500) {
        const result = await messaging.sendEachForMulticast({
            tokens: tokens.slice(i, i + 500),
            notification: {
                title: 'Parnex test bildirimi',
                body: 'Test başarılı: telefon bildirimleri Firebase üzerinden ulaştırılabiliyor.'
            },
            android: { priority: 'high' }
        });
        successCount += result.successCount;
        failureCount += result.failureCount;
        for (const response of result.responses) {
            if (!response.success) {
                const code = response.error && response.error.code ? response.error.code : 'unknown';
                failureCodes[code] = (failureCodes[code] || 0) + 1;
            }
        }
    }

    console.log(`Test push özeti: token sayısı=${tokens.length}, FCM kabulü=${successCount}, FCM hatası=${failureCount}`);
    if (Object.keys(failureCodes).length) {
        console.log('FCM hata kodları: ' + Object.entries(failureCodes).map(([code, count]) => `${code}×${count}`).join(', '));
    }
    // FCM acceptance means accepted for delivery, not proof it appeared on the device.
    if (successCount === 0) process.exitCode = 1;
}

main().catch(error => {
    console.error((error && error.message) || 'Test push failed.');
    process.exit(1);
});
