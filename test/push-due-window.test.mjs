import test from 'node:test';
import assert from 'node:assert/strict';

// Gerçek FCM/Firestore KULLANILMAZ: sahte db + messaging ile izole çalışır.
// Bu dosya vade (recurring) hatırlatma PENCERESİNİ doğrular:
// - yarın vadesi → normal aday (mevcut davranış korunur),
// - bugün vadesi → önceki cron koşusu kaçtıysa yakalama,
// - geçmiş/gelecek vade → aday YOK (eski bildirim seli yok),
// - aynı vade iki saatlik koşu arasında yalnızca bir kez gönderilir,
// - Europe/Istanbul gün sınırı ve UTC zaman damgaları.
import userFlow from '../tools/push/send-user.js';
import {
    userDoc, serverTimestamp, makeLogger, makeDb, makeMessaging, okBatch
} from './fakes.mjs';

const { processUser, localDateString, addDays } = userFlow;
const TZ = 'Europe/Istanbul';

// Tarihler test GÖVDESİNDE hesaplanır: modül yüklemesi ile koşu arasındaki
// gün sınırı geçişi testi bayatlatmasın.
const day = () => localDateString(new Date(), TZ);
const run = (db, messaging) =>
    processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
const tokens = [{ id: 'tok-a', data: {} }];
const rec = (nextDate, extra = {}) => ({
    id: 'r1',
    data: { active: true, nextDate, description: 'Kira', amount: 1000, ...extra }
});
const wroteLog = (db, id) =>
    db._state.writes.some(w => w.ref.name === 'pushLog' && w.ref.id === id);

test('vade yarın olduğunda aday gönderilir; başlık ve payload birebir korunur', async () => {
    const tomorrow = addDays(day(), 1);
    const db = makeDb({ pushTokens: tokens, recurringTransactions: [rec(tomorrow)] });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);
    assert.equal(result.sent, true);
    assert.equal(messaging.calls.length, 1);
    assert.equal(messaging.calls[0].notification.title, '⏰ Yarın vade');
    assert.equal(messaging.calls[0].notification.body, 'Kira (₺1000.00)');
    assert.equal(wroteLog(db, `rec-r1-${tomorrow}`), true);
});

test('aynı vade için sonraki saatlik koşu tekrar göndermez (pushLog + commit)', async () => {
    const tomorrow = addDays(day(), 1);
    const db = makeDb({ pushTokens: tokens, recurringTransactions: [rec(tomorrow)] });
    const messaging = makeMessaging(() => okBatch(1));
    const first = await run(db, messaging);
    assert.equal(first.sent, true);
    assert.equal(db._state.commits, 1);
    assert.equal(db._state.logged.has(`rec-r1-${tomorrow}`), true, 'commit pushLog kaydını kalıcılaştırır');
    const second = await run(db, messaging);
    assert.equal(second.sent, false, 'ikinci koşu aday bulmamalı');
    assert.equal(second.candidateCount, 0);
    assert.equal(messaging.calls.length, 1, 'yalnızca bir FCM gönderimi');
    assert.equal(db._state.commits, 1, 'ikinci koşu yazmamalı');
});
