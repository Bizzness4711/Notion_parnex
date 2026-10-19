import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import helpers from '../tools/push/send-helpers.js';
import userFlow from '../tools/push/send-user.js';
import { userDoc, serverTimestamp, makeLogger, makeDb, makeMessaging, okBatch } from './fakes.mjs';

const { processUser } = userFlow;
const { DEAD_TOKEN_CODES, isDeadTokenCode } = helpers;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flowSrc = readFileSync(path.join(ROOT, 'tools/push/send-user.js'), 'utf8');

// Bu kodlar firebase-admin 12.7.0 lib/utils/error.js kaynak kodundan
// doğrulandı (MessagingClientErrorCode + MESSAGING_SERVER_TO_CLIENT_CODE).
// Liste BİLİNÇLİ olarak dar: silme = token'ın kesin geçersizliği.
const VERIFIED_DEAD = [
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered'
];

// Silinmesi güvenli OLMAYAN kodlar: genel/müphem, payload kaynaklı veya geçici.
const KEEP_TOKEN_CODES = [
    'messaging/invalid-argument',
    'messaging/invalid-payload',
    'messaging/invalid-data-payload-key',
    'messaging/payload-size-limit-exceeded',
    'messaging/invalid-options',
    'messaging/invalid-package-name',
    'messaging/invalid-recipient',
    'messaging/mismatched-credential',
    'messaging/authentication-error',
    'messaging/third-party-auth-error',
    'messaging/server-unavailable',
    'messaging/internal-error',
    'messaging/unknown-error',
    'messaging/message-rate-exceeded',
    'messaging/device-message-rate-exceeded',
    'messaging/unavailable-x-yeni-kod',
    '',
    'messaging'
];

test('dead-token listesi tam olarak iki doğrulanmış kod', () => {
    assert.equal(DEAD_TOKEN_CODES.size, 2);
    VERIFIED_DEAD.forEach(code => {
        assert.ok(DEAD_TOKEN_CODES.has(code), `${code} listede olmalı`);
        assert.equal(isDeadTokenCode(code), true, code);
    });
});

test('invalid-argument ve genel/geçici kodlarda token SİLİNMEZ', () => {
    KEEP_TOKEN_CODES.forEach(code => {
        assert.equal(isDeadTokenCode(code), false, `${code} silme sebebi olmamalı`);
    });
});

test('isDeadTokenCode string olmayan girdilere yanlışlıkla true demez', () => {
    for (const bad of [undefined, null, 0, {}, ['messaging/invalid-registration-token']]) {
        assert.equal(isDeadTokenCode(bad), false);
    }
});

test('send-user: silme kararı isDeadTokenCode üzerinden verilir (körleme yok)', () => {
    assert.match(flowSrc, /isDeadTokenCode\(r\.error\?\.code\)/);
    // Eski tek kodlu sabit karşılaştırma kalmamış olmalı.
    assert.doesNotMatch(flowSrc, /=== 'messaging\/registration-token-not-registered'/);
});

test('kesin ölü kodda yalnız o token silinir, kabulde aday loglanır', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }, { id: 'tok-b', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => ({
        successCount: 1,
        failureCount: 1,
        responses: [
            { success: true, messageId: 'm1' },
            { success: false, error: { code: 'messaging/invalid-registration-token', message: 'geçersiz' } }
        ]
    }));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, true, 'kısmi başarı kabul edilir');
    assert.deepEqual(db._state.deleted.map(d => d.id), ['tok-b'], 'yalnız ölü token silinir');
    assert.equal(db._state.writes.length, 1, 'aday loglanır');
});

test('invalid-argument hatasında token KORUNUR (payload kaynaklı olabilir)', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }, { id: 'tok-b', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => ({
        successCount: 1,
        failureCount: 1,
        responses: [
            { success: true, messageId: 'm1' },
            { success: false, error: { code: 'messaging/invalid-argument', message: 'Invalid argument provided.' } }
        ]
    }));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, true);
    assert.deepEqual(db._state.deleted, [], 'invalid-argument token silme sebebi değildir');
});

test('geçici sunucu hatasında token korunur ve aday loglanmaz (yeniden denenir)', async () => {
    const db = makeDb({
        pushTokens: [{ id: 'tok-a', data: {} }],
        goals: [{ id: 'g1', data: { amount: 100, current: 100, name: 'Tatil' } }]
    });
    const messaging = makeMessaging(() => ({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, error: { code: 'messaging/server-unavailable', message: 'try later' } }]
    }));
    const result = await processUser({ db, messaging, uid: 'u-test', userDoc, serverTimestamp, logger: makeLogger() });
    assert.equal(result.sent, false);
    assert.deepEqual(db._state.deleted, [], 'geçici hatada silme yok');
    assert.equal(db._state.writes.length, 0, 'kabul yok → log yok');
});
