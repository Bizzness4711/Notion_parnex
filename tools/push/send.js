// Saatlik push hatırlatıcı. GitHub Actions'tan çalışır (FIREBASE_SERVICE_ACCOUNT secret).
// Kontrol ettikleri:
// 1) Yarın vadesi gelen aktif tekrarlayan işlemler
// 2) Bu ay %100'ü aşan bütçeler
// 3) %100'e ulaşan hedefler
// Aynı uyarı iki kez gitmez: users/{uid}/pushLog altına id yazılır, varsa atlanır.
// Tutarlar sunucuda kura çevrilmeden toplanır (yaklaşık değerdir).
// Per-user akış tools/push/send-user.js içinde; bu dosya sayfalama, hata
// yalıtımı ve CI çıkış kodundan sorumludur.
const admin = require('firebase-admin');
const { processUser } = require('./send-user');

async function main() {
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!keyJson) throw new Error('FIREBASE_SERVICE_ACCOUNT secret yok.');
    let credential;
    try {
        credential = admin.credential.cert(JSON.parse(keyJson));
    } catch {
        // Node 20 JSON.parse hataları girdinin bir parçasını basabilir;
        // secret içeriği public Actions loguna ASLA sızmamalı.
        throw new Error('FIREBASE_SERVICE_ACCOUNT JSON çözümlenemedi (içerik loglanmaz).');
    }
    admin.initializeApp({ credential });
    const db = admin.firestore();
    const messaging = admin.messaging();
    const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

    // Gizlilik güvenli toplu sayaçlar: kullanıcı kimliği, token, e-posta veya
    // finansal tutar yazdırılmaz. Böylece "Success ama bildirim yok" ayrıştırılır.
    let usersProcessed = 0;
    let usersWithoutTokens = 0;
    let usersWithCandidates = 0;
    let usersAcceptedByFcm = 0;
    let candidateCount = 0;
    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;

    // Tek kullanıcının bozuk belgesi/token'ı/hesabı koşturmayı SONLANDIRMAZ:
    // hata yalıtılır, özetlenir ve işin sonunda CI kısmi başarısız olur.
    let userErrors = 0;
    let usersSnap;
    let lastUserDoc = null;
    do {
        let usersQuery = db.collection('users').orderBy('__name__').limit(200);
        if (lastUserDoc) usersQuery = usersQuery.startAfter(lastUserDoc);
        usersSnap = await usersQuery.get();
        for (const userDoc of usersSnap.docs) {
            const uid = userDoc.id;
            try {
                const result = await processUser({ db, messaging, uid, userDoc, serverTimestamp, logger: console });
                usersProcessed += 1;
                if (result && result.skipped === 'no-tokens') {
                    usersWithoutTokens += 1;
                    continue;
                }
                const foundCandidates = Number(result && result.candidateCount) || 0;
                candidateCount += foundCandidates;
                if (foundCandidates > 0) usersWithCandidates += 1;
                if (result && result.sent) usersAcceptedByFcm += 1;
                if (Number.isFinite(result && result.successCount)) fcmSuccessCount += result.successCount;
                if (Number.isFinite(result && result.failureCount)) fcmFailureCount += result.failureCount;
            } catch (err) {
                userErrors += 1;
                // Hata metninden UID ve tutarları maskele; token/e-posta loglanmaz.
                const raw = String((err && err.message) || err);
                const safe = raw.split(uid).join('[uid]')
                    .replace(/₺\s?[\d.,]+/g, '[tutar]')
                    .slice(0, 200);
                console.error(`Kullanıcı akışı başarısız (#${userErrors}): ${(err && err.name) || 'Error'}: ${safe}`);
            }
        }
        lastUserDoc = usersSnap.docs[usersSnap.docs.length - 1] || null;
    } while (usersSnap.size === 200);

    console.log(
        'Push özeti: ' +
        `işlenen kullanıcı=${usersProcessed}, token bulunmayan kullanıcı=${usersWithoutTokens}, ` +
        `uyarı adayı bulunan kullanıcı=${usersWithCandidates}, toplam uyarı adayı=${candidateCount}, ` +
        `FCM kabulü alan kullanıcı=${usersAcceptedByFcm}, FCM başarılı token=${fcmSuccessCount}, ` +
        `FCM hatalı token=${fcmFailureCount}, kullanıcı hatası=${userErrors}`
    );

    if (userErrors > 0) {
        console.error(`Özet: ${userErrors} kullanıcı işlenemedi — kısmi başarısızlık olarak raporlanır.`);
        process.exitCode = 1;
    }
}

main().catch(e => { console.error(e); process.exit(1); });
