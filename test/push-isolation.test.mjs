import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Gerçek FCM/Firestore KULLANILMAZ: sahte db + messaging ile izole çalışır.
import userFlow from '../tools/push/send-user.js';
import {
    todayStr, tomorrowStr, monthStr, userDoc, serverTimestamp,
    makeLogger, makeDb, makeMessaging, okBatch
} from './fakes.mjs';

const { processUser } = userFlow;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sendSrc = readFileSync(path.join(ROOT, 'tools/push/send.js'), 'utf8');

test('bozuk kullanıcı belgesi koşturmayı öldürmez ve hiçbir pushLog yazmaz', async () => {
    const db = makeDb({
        failOn: 'goals', // tekrarlayanlar taranmış, aday toplanmışken goals patlar
        pushTokens: [{ id: 'tok-a', data: {} }],
        recurringTransactions: [{ id: 'r1', data: { active: true, nextDate: tomorrowStr, description: 'Kira', amount: 1000 } }]
    });
    const messaging = makeMessaging(() => okBatch(1));
    await assert.rejects(
        () => processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() }),
        /goals/
    );
    assert.equal(db._state.writes.length, 0, 'hata sonrası batch.set olmamalı');
    assert.equal(db._state.commits, 0, 'commit çalışmamalı');
    assert.equal(messaging.calls.length, 0, 'FCM çağrılmamalı');
});

test('FCM çağrısı fırlatırsa (yanıt belirsiz) pushLog yazılmaz', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => { throw new Error('ağ hatası: yanıt kaybedildi'); });
    await assert.rejects(() => processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() }));
    assert.equal(db._state.writes.length, 0, 'yanıt belirsizken log yazılmamalı (yeniden deneme = yinelenme riski raporlanır)');
    assert.equal(db._state.commits, 0);
});

test('FCM tam başarıda tüm adaylar loglanır, tek commit atılır', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }, { id: 'tok-b', data: {} }],
        recurringTransactions: [{ id: 'r1', data: { active: true, nextDate: tomorrowStr, description: 'Kira', amount: 1000 } }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => okBatch(2));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, true);
    assert.equal(result.candidateCount, 2);
    assert.equal(db._state.writes.length, 2, 'kabul edilen her aday için bir pushLog yazımı');
    assert.equal(db._state.commits, 1, 'tek commit');
    // İki aday tek gövdede birleşir (tek multicast).
    assert.equal(messaging.calls.length, 1);
    assert.equal(messaging.calls[0].tokens.length, 2);
});

test('FCM sıfır kabul → hiçbir pushLog yazılmaz, adaylar sonraki koşuya devreder', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => ({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, error: { code: 'messaging/server-unavailable', message: 'geçici' } }]
    }));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, false);
    assert.equal(db._state.writes.length, 0, 'kabul yokken log yazılmamalı');
    assert.equal(db._state.commits, 1, 'boş batch commit (yazım yok)');
    assert.equal(db._state.deleted.length, 0, 'geçici hatada token silinmemeli');
});

test('pushLog\'da olan aday hiç gönderilmez (idempotency)', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }],
        logged: ['goal-g1-100']
    });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, false);
    assert.equal(result.candidateCount, 0);
    assert.equal(messaging.calls.length, 0, 'loglanmış aday için FCM çağrısı yapılmaz');
});

test('token\'ı olmayan kullanıcı erken çıkar, FCM çağrılmaz', async () => {
    const db = makeDb({ goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'T' } }] });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.skipped, 'no-tokens');
    assert.equal(messaging.calls.length, 0);
    assert.equal(db._state.commits, 0);
});

test('bütçe aşımı adayı ay verisine göre üretilir ve kabulde loglanır', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }],
        budgets: [{ id: 'b1', data: { month: monthStr, category: 'Yemek', limit: 100 } }],
        transactions: [{ id: 't1', data: { type: 'expense', category: 'Yemek', amount: 150, date: `${monthStr}-05` } }]
    });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, true);
    assert.equal(result.candidateCount, 1);
    assert.equal(db._state.writes.length, 1);
    assert.match(messaging.calls[0].notification.body, /Bütçe aşıldı|Yemek/);
});

test('send.js: kullanıcı hatası yalıtılır, özetlenir ve CI\'ı başarısız yapar', () => {
    assert.match(sendSrc, /catch \(err\)/);
    assert.match(sendSrc, /Kullanıcı akışı başarısız/);
    assert.match(sendSrc, /process\.exitCode = 1/);
    // Güvenli mesaj: uid maskelenir, uzunluk kırpılır.
    assert.match(sendSrc, /raw\.split\(uid\)\.join\('\[uid\]'\)\.slice\(0, 200\)/);
    // Yalıtım anahtarı processUser çağrısının çevresinde olmalı.
    assert.match(sendSrc, /try \{[\s\S]{0,80}await processUser\(/);
});
