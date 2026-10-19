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

// ————— Kaçırılan koşu yakalama (bugün penceresi) —————

test('vade bugünken ve önceki cron koşusu tamamen kaçmışsa aday yine gönderilir', async () => {
    const today = day();
    const db = makeDb({ pushTokens: tokens, recurringTransactions: [rec(today)] });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);
    assert.equal(result.sent, true, 'bugün vade = kaçırılan hatırlatma yakalanmalı (tek günlük eşitlik kaybettiriyordu)');
    assert.equal(messaging.calls.length, 1);
    assert.equal(messaging.calls[0].notification.title, '⏰ Bugün vade');
    assert.equal(messaging.calls[0].notification.body, 'Kira (₺1000.00)');
    assert.equal(wroteLog(db, `rec-r1-${today}`), true, 'log anahtarı nextDate\'den türetilir (yarınla aynı)');
});

test('dün gönderilen hatırlatma bugün tekrar gönderilmez (ortak pushLog anahtarı)', async () => {
    const today = day();
    // Dün bu kayıt "yarın vade" olarak gönderildi ve loglandı → anahtar:
    const db = makeDb({
        pushTokens: tokens,
        recurringTransactions: [rec(today)],
        logged: [`rec-r1-${today}`]
    });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);
    assert.equal(result.sent, false);
    assert.equal(messaging.calls.length, 0, 'yinelenen hatırlatma yasak');
    assert.equal(db._state.commits, 0);
});

// ————— Tarih aralığı güvenliği: eski/ileri vade asla aday olmaz —————

test('geçmiş vade (3 gün önce) asla aday olmaz ve koşular boyunca tekrarlanmaz', async () => {
    const past = addDays(day(), -3);
    const db = makeDb({ pushTokens: tokens, recurringTransactions: [rec(past)] });
    const messaging = makeMessaging(() => okBatch(1));
    for (let i = 0; i < 3; i++) {
        const result = await run(db, messaging);
        assert.equal(result.sent, false, `koşu ${i + 1}: eski vade gönderilmemeli`);
    }
    assert.equal(messaging.calls.length, 0, 'eski bildirim seli yok');
    assert.equal(db._state.commits, 0);
});

test('çok ileri vade (+2 gün) henüz aday değildir', async () => {
    const future = addDays(day(), 2);
    const db = makeDb({ pushTokens: tokens, recurringTransactions: [rec(future)] });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);
    assert.equal(result.sent, false);
    assert.equal(messaging.calls.length, 0);
});

test('pasif tekrarlayan bugün/yarın vadesi taşısa bile aday oluşturmaz', async () => {
    const today = day();
    const db = makeDb({
        pushTokens: tokens,
        recurringTransactions: [
            rec(addDays(today, 1), { active: false }),
            rec(today, { active: false, description: 'Kapalı kayıt' })
        ]
    });
    const messaging = makeMessaging(() => okBatch(1));
    const result = await run(db, messaging);
    assert.equal(result.sent, false);
    assert.equal(messaging.calls.length, 0);
});

// ————— Gün sınırı / zaman damgası hesabı (saf fonksiyonlar) —————

test('localDateString Europe/Istanbul gün sınırını UTC damgalardan doğru türetir', () => {
    // İstanbul UTC+3 → gün sınırı 21:00 UTC'dir.
    assert.equal(localDateString(new Date('2026-10-19T20:30:00Z'), 'Europe/Istanbul'), '2026-10-19');
    assert.equal(localDateString(new Date('2026-10-19T20:59:59Z'), 'Europe/Istanbul'), '2026-10-19');
    assert.equal(localDateString(new Date('2026-10-19T21:00:00Z'), 'Europe/Istanbul'), '2026-10-20');
    assert.equal(localDateString(new Date('2026-10-19T21:30:00Z'), 'Europe/Istanbul'), '2026-10-20');
    // Aynı damga UTC kullanıcısı için farklı güne düşer (kullanıcı-yerel doğru).
    assert.equal(localDateString(new Date('2026-10-19T21:30:00Z'), 'UTC'), '2026-10-19');
    assert.equal(localDateString(new Date('2026-10-20T03:00:00Z'), 'UTC'), '2026-10-20');
});

test('localDateString DST geçişini (Europe/Berlin) doğru yönetir', () => {
    // 2026-03-29 Avrupa'da DST başlangıcı (02:00→03:00).
    assert.equal(localDateString(new Date('2026-03-28T23:30:00Z'), 'Europe/Berlin'), '2026-03-29');
    assert.equal(localDateString(new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin'), '2026-03-29');
    assert.equal(localDateString(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin'), '2026-10-25');
});

test('addDays ay, yıl ve artik takvim sınırlarını güvenli aşar', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});
