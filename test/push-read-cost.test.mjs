import test from 'node:test';
import assert from 'node:assert/strict';

// Gerçek FCM/Firestore KULLANILMAZ: sahte db + messaging ile izole çalışır.
// Aşama 6D: Firestore okuma maliyeti — recurringTransactions sorgusu
// yalnızca hatırlatma tarih penceresindeki belgeleri (nextDate ∈ [bugün,
// yarın]) okumalı. Bu tek alan aralığı sorgusudur: Firestore'un OTOMATİK
// tek alan indeksiyle çalışır, composite indeks GEREKTİRMEZ (repoda
// firestore.indexes.json alanı ezme YOK → varsayılan otomatik indeksler).
//
// Eşdeğerlik kanıtı: aralı sorgu, eski tam taramanın bir ÜST KÜMESİdir;
// send-user içindeki eski in-memory birebir `nextDate === bugün/yarın`
// ve `active !== false` kontrolleri SAĞLANMAYA DEVAM eder → aday kümesi
// değişmez, yalnızca okunan belge sayısı düşer.
import userFlow from '../tools/push/send-user.js';
import {
    userDoc, serverTimestamp, makeLogger, makeDb, makeMessaging, okBatch
} from './fakes.mjs';

const { processUser, localDateString, addDays } = userFlow;
const TZ = 'Europe/Istanbul';
const day = () => localDateString(new Date(), TZ);
const run = (db, messaging) =>
    processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
const tokens = [{ id: 'tok-a', data: {} }];
const rec = (id, data) => ({ id, data });

test('recurringTransactions sorgusu yalnızca [bugün, yarın] aralığını filtreler', async () => {
    const today = day();
    const tomorrow = addDays(today, 1);
    const db = makeDb({
        pushTokens: tokens,
        recurringTransactions: [rec('r1', { active: true, nextDate: tomorrow, description: 'Kira', amount: 1000 })]
    });
    const messaging = makeMessaging(() => okBatch(1));
    await run(db, messaging);

    const recQ = db._state.queries.filter(q => q.name === 'recurringTransactions');
    assert.equal(recQ.length, 1, 'tek recurring sorgusu');
    assert.deepEqual(recQ[0].filters, [
        { field: 'nextDate', op: '>=', value: today },
        { field: 'nextDate', op: '<=', value: tomorrow }
    ], 'yalnızca tek alan aralığı: otomatik indeks, composite indeks yok');

    // Bütçe sorgusu AYNEN korunur (aşama 6D kapsamı dışı değişiklik yok):
    const budQ = db._state.queries.find(q => q.name === 'budgets');
    assert.deepEqual(budQ.filters, [{ field: 'month', op: '==', value: today.substring(0, 7) }]);
    // Bütçe yokken transactions taraması koşmaya devam etmez:
    assert.equal(db._state.queries.some(q => q.name === 'transactions'), false);
});

test('pencere daraltması aday kümesini değiştirmez (eski davranışla eşdeğerlik)', async () => {
    const today = day();
    const tomorrow = addDays(today, 1);
    const db = makeDb({
        pushTokens: tokens,
        recurringTransactions: [
            // Aralığa GİREN ama eski eşitlik filtresinin ELEDİĞİ egzotik biçim:
            rec('r-exotic', { active: true, nextDate: `${today}T05:00`, description: 'Bozuk', amount: 10 }),
            // Aralığa giren ama pasif: eski ve yeni davranış aynı (elenir):
            rec('r-inactive', { active: false, nextDate: tomorrow, description: 'Pasif', amount: 20 }),
            rec('r-tomorrow', { active: true, nextDate: tomorrow, description: 'YarinOdeme', amount: 50 }),
            rec('r-past', { active: true, nextDate: addDays(today, -3), description: 'Gecmis', amount: 30 }),
            rec('r-today', { active: true, nextDate: today, description: 'BugunOdeme', amount: 75 }),
            rec('r-future', { active: true, nextDate: addDays(today, 2), description: 'Ileri', amount: 40 }),
            rec('r-missing', { active: true, description: 'NextDateYok', amount: 60 })
        ]
    });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);

    // Eski tam tarama da YALNIZCA bu iki adayı üretirdi (eşdeğerlik):
    assert.equal(result.sent, true);
    assert.equal(result.candidateCount, 2);
    assert.equal(messaging.calls.length, 1);
    assert.deepEqual(messaging.calls[0].notification, {
        title: 'Parnex (2 bildirim)',
        body: '⏰ Yarın vade — YarinOdeme (₺50.00)\n⏰ Bugün vade — BugunOdeme (₺75.00)'
    });
    assert.equal(db._state.writes.length, 2, 'yalnızca kabul edilen iki aday loglanır');
    assert.equal(db._state.commits, 1);
    // Okunan belge = aralık süperset (egzotik + pasif + iki gerçek aday):
    // eski tam tarama 7 okurdu → yeni 4 okur, SONUÇ aynıdır.
    assert.equal(db._state.reads.recurringTransactions, 4);
});

test('okuma sayısı pencereye daralır (10 belgeden yalnızca 2 okunur)', async () => {
    const today = day();
    const seeds = [];
    for (let i = 1; i <= 8; i++) {
        seeds.push(rec(`r-past-${i}`, { active: true, nextDate: addDays(today, -i), description: `Eski${i}`, amount: 10 }));
    }
    seeds.push(rec('r-today', { active: true, nextDate: today, description: 'Bugun', amount: 60 }));
    seeds.push(rec('r-tomorrow', { active: true, nextDate: addDays(today, 1), description: 'Yarin', amount: 70 }));
    const db = makeDb({ pushTokens: tokens, recurringTransactions: seeds });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);

    assert.equal(result.sent, true);
    assert.equal(db._state.reads.recurringTransactions, 2, 'eski davranış 10 okurdu → pencere 2 okur');
    assert.equal(db._state.writes.length, 2);
    assert.equal(messaging.calls.length, 1);
});
