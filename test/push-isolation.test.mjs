import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Gerçek FCM/Firestore KULLANILMAZ: sahte db + messaging ile izole çalışır.
import userFlow from '../tools/push/send-user.js';

const { processUser, localDateString, addDays } = userFlow;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sendSrc = readFileSync(path.join(ROOT, 'tools/push/send.js'), 'utf8');

const TZ = 'Europe/Istanbul';
const todayStr = localDateString(new Date(), TZ);
const tomorrowStr = addDays(todayStr, 1);
const monthStr = todayStr.substring(0, 7);

function snapshot(items) {
    const docs = items.map(it => ({ id: it.id, data: () => it.data }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => { docs.forEach(fn); } };
}

// processUser'nin kullandığı Firestore alt kümesi: collection/doc/get/where/
// batch(set+commit)/doc.delete. commit ÖNCESİNDE hiçbir yazım kalıcı değildir
// (gerçek batch davranışıyla aynı) — bu yüzden "yazım yok" iddiası
// commits===0 ve writes===0 ile ölçülür.
function makeDb(seed = {}) {
    const state = {
        logged: new Set(seed.logged || []),
        writes: [],
        commits: 0,
        deleted: [],
        failOn: seed.failOn || null
    };
    function queryRef(name, filters) {
        return {
            where(field, op, value) { return queryRef(name, filters.concat({ field, op, value })); },
            doc(id) { return docRef(name, id); },
            async get() {
                if (state.failOn === name) throw new Error(`Firestore okuma hatası: ${name}`);
                let items = (seed[name] || []).slice();
                for (const f of filters) {
                    items = items.filter(it => {
                        const v = it.data[f.field];
                        if (f.op === '==') return v === f.value;
                        if (f.op === '>=') return String(v) >= String(f.value);
                        if (f.op === '<=') return String(v) <= String(f.value);
                        return true;
                    });
                }
                return snapshot(items);
            }
        };
    }
    function docRef(name, id) {
        return {
            id,
            collection: child => queryRef(child, []),
            async get() {
                if (state.failOn === name) throw new Error(`Firestore okuma hatası: ${name}`);
                if (name === 'pushLog') return { exists: state.logged.has(id) };
                const found = (seed[name] || []).find(it => it.id === id);
                return { exists: !!found, data: () => found && found.data };
            },
            async delete() { state.deleted.push({ name, id }); }
        };
    }
    return {
        collection: name => ({ doc: id => docRef(name, id) }),
        batch: () => ({
            set(ref, data) { state.writes.push({ ref, data }); },
            async commit() { state.commits += 1; }
        }),
        _state: state
    };
}

function makeMessaging(impl) {
    const calls = [];
    return {
        calls,
        async sendEachForMulticast(message) {
            calls.push(message);
            return impl(message);
        }
    };
}

const okBatch = n => ({
    successCount: n,
    failureCount: 0,
    responses: Array.from({ length: n }, () => ({ success: true, messageId: 'm-ok' }))
});

const userDoc = { id: 'u-test', data: () => ({ timeZone: TZ }) };
const serverTimestamp = () => ({ fakeTs: true });
const makeLogger = () => { const lines = []; return { lines, log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) }; };

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
