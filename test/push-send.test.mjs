import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Saf yardımcılar: FCM'e gerçek çağrı YAPMAZ; tüm testler sahte BatchResponse
// ile çalışır (firebase-admin 12.7.0 tiplerinden doğrulanmış alanlar).
import helpers from '../tools/push/send-helpers.js';

const { buildBatchNotification, summarizeBatchResponse } = helpers;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sendSrc = readFileSync(path.join(ROOT, 'tools/push/send.js'), 'utf8');

const cand = (title, body) => ({ title, body });

test('tek aday: mevcut bildirim payload\'ı birebir korunur', () => {
    const input = [cand('⏰ Yarın vade', 'Market (₺120.00)')];
    const { notification, included, excludedCount } = buildBatchNotification(input);
    assert.deepEqual(notification, { title: '⏰ Yarın vade', body: 'Market (₺120.00)' });
    assert.equal(included.length, 1);
    assert.equal(excludedCount, 0);
});

test('çoklu aday: 3\'ten fazla aday gövdeden kaybolmaz (slice(0,3) yok)', () => {
    const input = Array.from({ length: 5 }, (_, i) => cand(`Başlık${i}`, `gövde${i}`));
    const { notification, included, excludedCount } = buildBatchNotification(input);
    assert.equal(included.length, 5);
    assert.equal(excludedCount, 0);
    assert.equal(notification.title, 'Parnex (5 bildirim)');
    const lines = notification.body.split('\n');
    assert.equal(lines.length, 5);
    lines.forEach((line, i) => assert.equal(line, `Başlık${i} — gövde${i}`));
});

test('bayt sınırını aşan aday dışlanır, dahil edilenlerin sırası korunur', () => {
    const input = [cand('A', 'aaa'), cand('B', 'bbb'), cand('C', 'ccc')];
    const { notification, included, excludedCount } = buildBatchNotification(input, { maxBytes: 20 });
    // A(7) + \n + B(7) = 15 <= 20; C eklenirse 23 > 20 → C dışlanır.
    assert.equal(included.length, 2);
    assert.equal(excludedCount, 1);
    assert.equal(notification.title, 'Parnex (2 bildirim)');
    assert.equal(notification.body, 'A — aaa\nB — bbb');
    assert.deepEqual(included.map(c => c.title), ['A', 'B']);
});

test('devasa ilk satır bile gönderimi durdurmaz (ilerleme garantisi)', () => {
    const input = [cand('A', 'x'.repeat(500)), cand('B', 'bbb'), cand('C', 'ccc')];
    const { included, excludedCount } = buildBatchNotification(input, { maxBytes: 10 });
    assert.equal(included.length, 1);
    assert.equal(excludedCount, 2);
});

test('boş aday listesi güvenli biçimde döner', () => {
    const { notification, included, excludedCount } = buildBatchNotification([]);
    assert.equal(notification, null);
    assert.equal(included.length, 0);
    assert.equal(excludedCount, 0);
});

test('summarize: kısmi başarı (successCount>0) kabul sayılır', () => {
    const res = {
        successCount: 1,
        failureCount: 2,
        responses: [
            { success: true, messageId: 'm1' },
            { success: false, error: { code: 'messaging/server-unavailable' } },
            { success: false, error: { code: 'messaging/invalid-argument' } }
        ]
    };
    const outcome = summarizeBatchResponse(res);
    assert.equal(outcome.accepted, true);
    assert.equal(outcome.successCount, 1);
    assert.equal(outcome.failureCount, 2);
    assert.deepEqual(outcome.errorCodes, ['messaging/server-unavailable', 'messaging/invalid-argument']);
});

test('summarize: sıfır başarı → kabul yok, hiçbir aday loglanmaz', () => {
    const res = {
        successCount: 0,
        failureCount: 2,
        responses: [
            { success: false, error: { code: 'messaging/unavailable-x' } },
            { success: false, error: { code: 'messaging/timeout-x' } }
        ]
    };
    const outcome = summarizeBatchResponse(res);
    assert.equal(outcome.accepted, false);
    assert.equal(outcome.errorCodes.length, 2);
});

test('summarize: bozuk/eksik yanıt throw etmez, kabul yok', () => {
    for (const bad of [undefined, null, {}, 'yanit', { responses: 'bozuk' }]) {
        const outcome = summarizeBatchResponse(bad);
        assert.equal(outcome.accepted, false, `girdi: ${String(bad)}`);
        assert.equal(typeof outcome.successCount, 'number');
    }
});

test('summarize: sayaçlar yoksa responses üzerinden yeniden sayılır', () => {
    const res = {
        responses: [
            { success: true },
            { success: false, error: { code: 'messaging/invalid-registration-token' } },
            { success: false }
        ]
    };
    const outcome = summarizeBatchResponse(res);
    assert.equal(outcome.successCount, 1);
    assert.equal(outcome.failureCount, 2);
    assert.equal(outcome.accepted, true);
    // error alanı olmayan başarısız yanıt kod listesine sızmaz.
    assert.deepEqual(outcome.errorCodes, ['messaging/invalid-registration-token']);
});

test('send.js: pushLog gönderim sonuna ertelendi (tarama sırasında yazılmıyor)', () => {
    // Tarama döngülerinde anında batch.set KALMAMALI: log yalnızca FCM
    // kabul ederse yazılır. Toplam tek batch.set: kabul dalı.
    const sets = sendSrc.match(/batch\.set\(/g) || [];
    assert.equal(sets.length, 1, `beklenen 1 batch.set, bulunan: ${sets.length}`);
    assert.match(sendSrc, /if \(outcome\.accepted\) \{[\s\S]{0,200}for \(const c of included\)/);
});

test('send.js: eski slice(0,3) özet kaybı ve bodies yapısı kaldırıldı', () => {
    assert.doesNotMatch(sendSrc, /slice\(0, 3\)/);
    assert.doesNotMatch(sendSrc, /bodies/);
    assert.match(sendSrc, /require\('\.\/send-helpers'\)/);
    assert.match(sendSrc, /buildBatchNotification\(candidates\)/);
    assert.match(sendSrc, /summarizeBatchResponse\(res\)/);
});

test('send.js: başarısız gönderim "Gönderildi" diye raporlanmaz', () => {
    // Kabul yokken log satırı yanıltıcı olmamalı.
    assert.match(sendSrc, /Gönderilemedi: \$\{uid\}/);
    const acceptedLog = sendSrc.match(/if \(outcome\.accepted\) \{[\s\S]*?Gönderildi: \$\{uid\}/);
    assert.ok(acceptedLog, 'Gönderildi logu accepted dalının içinde olmalı');
});
