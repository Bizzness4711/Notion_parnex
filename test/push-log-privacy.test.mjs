import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Public GitHub Actions logları HERKESE AÇIKTIR: uid, token ön eki, FCM hata
// mesajı, tutar ve e-posta asla basılmamalı. Bu testler log BASAN her satırı
// kaynak metinden denetler.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(path.join(ROOT, f), 'utf8');
const flowSrc = read('tools/push/send-user.js');
const sendSrc = read('tools/push/send.js');

const loggerLines = src => [...src.matchAll(/logger\.log\(`([^`]*)`\)/g)].map(m => m[1]);

test('send-user: logger satırlarında uid geçmez', () => {
    const lines = loggerLines(flowSrc);
    assert.ok(lines.length >= 3, 'log satırları bulunamadı');
    lines.forEach(line => {
        assert.doesNotMatch(line, /\$\{uid\}/, `uid sızdı: ${line}`);
    });
});

test('send-user: token ön eki ve FCM hata mesajı loglanmıyor', () => {
    // Eski davranış: tokens[i].slice(0, 12) + error.message (token içerebilir).
    assert.doesNotMatch(flowSrc, /slice\(0, 12\)/);
    assert.doesNotMatch(flowSrc, /\$\{r\.error\?\.message\}/);
    // Yerine: kod→adet sayacı.
    assert.match(flowSrc, /Token hataları: \$\{codeSummary\}/);
});

test('send-user: log satırlarında tutar (₺) yok', () => {
    loggerLines(flowSrc).forEach(line => {
        assert.doesNotMatch(line, /₺/, `tutar sızdı: ${line}`);
    });
});

test('send-user: logger çağrısı içinde uid/dollar-uid hiç yok (geniş desen)', () => {
    assert.doesNotMatch(flowSrc, /logger\.(log|error)\([^)]*\$\{uid\}/);
});

test('send.js: kullanıcı hatası özetinde uid maskesi + tutar maskesi + 200 karakter sınırı', () => {
    assert.match(sendSrc, /raw\.split\(uid\)\.join\('\[uid\]'\)/);
    assert.match(sendSrc, /\[tutar\]/);
    assert.match(sendSrc, /\.slice\(0, 200\)/);
});

test('send.js: secret JSON parse hatası içeriği asla loglanmaz', () => {
    // Node 20 JSON.parse hataları girdi parçası basabilir → sabit mesaj.
    assert.match(sendSrc, /JSON çözümlenemedi \(içerik loglanmaz\)/);
    const initLine = sendSrc.match(/admin\.initializeApp\([^)]*\)/);
    assert.ok(initLine, 'initializeApp çağrısı bulunamadı');
    assert.doesNotMatch(sendSrc, /initializeApp\(\{ credential: admin\.credential\.cert\(JSON\.parse/);
});

test('send.js: exception özet satırında e-posta deseni yok', () => {
    // Saf maskeleme yeterli olmayabilir; e-posta basan satır olmamalı.
    const errLines = [...sendSrc.matchAll(/console\.error\(`([^`]*)`/g)].map(m => m[1]);
    errLines.forEach(line => assert.doesNotMatch(line, /@/, `e-posta riski: ${line}`));
});
