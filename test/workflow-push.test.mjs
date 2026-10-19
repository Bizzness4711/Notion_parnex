import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

// push-reminders.yml bir GitHub Actions workflow'u: buradaki ayarlar
// doğrudan push güvenilirliğini etkiler (cron kayıpları, eşzamanlı koşular,
// asılı kalan işler). Metin düzeyinde yapısal güvence verir.
const yml = read('.github/workflows/push-reminders.yml');

test('cron saat başı yerine 17. dakikaya alındı', () => {
    // GitHub dokümanı: scheduled işler saat başı (0) zirvesinde ertelenir,
    // yük çoksa hiç çalışmaz. Ölçüm: 24 günde 112/576 koşu.
    assert.match(yml, /cron:\s*'17 \* \* \* \*'/);
    assert.doesNotMatch(yml, /cron:\s*'0 \* \* \* \*'/);
});

test('workflow concurrency grubu tanımlı ve koşular iptal edilmiyor', () => {
    // Eşzamanlı schedule+dispatch koşusu aynı adayı iki kez gönderebilir.
    assert.match(yml, /concurrency:\s*\n\s+group:\s*push-reminders\s*\n\s+cancel-in-progress:\s*false/);
});

test('job timeout-minutes 10 (default 6 saat değil)', () => {
    // Asılı kalan Firestore/FCM çağrısı sonraki koşuları 6 saat kilitlememeli.
    assert.match(yml, /timeout-minutes:\s*10/);
});

test('workflow_dispatch manuel tetikleme korunuyor', () => {
    assert.match(yml, /workflow_dispatch:/);
});

test('permissions en düşük: yalnızca contents read', () => {
    // Job yalnızca checkout + secret ile script çalıştırıyor; write scope gerekmez,
    // ama checkout'un da kırılmaması için contents: read şart.
    assert.match(yml, /permissions:\s*\n\s+contents:\s*read/);
    assert.doesNotMatch(yml, /permissions:[\s\S]{0,120}(write-all|write|packages:|actions:)/);
});

test('gönderim adımı ve secret kullanımı korunmuş', () => {
    // Regresyon: adım adı/secret referansı değişirse job sessizce kırılabilir.
    assert.match(yml, /node tools\/push\/send\.js/);
    assert.match(yml, /secrets\.FIREBASE_SERVICE_ACCOUNT/);
    assert.match(yml, /npm install firebase-admin@12 --no-save/);
});
