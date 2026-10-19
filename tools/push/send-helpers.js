'use strict';

// Saf push yardımcıları — FCM'e veya Firestore'a gerçek çağrı YAPMAZ.
// Testler bunları sahte yanıtlarla izole çalıştırır (test/push-send.test.mjs).
//
// API davranışı firebase-admin 12.7.0 kaynak kodundan doğrulandı:
// - sendEachForMulticast tek MulticastMessage gönderir; BatchResponse.responses
//   gelen token dizisiyle AYNI SIRADADIR (messaging.js sendEachForMulticast
//   dokümanı). Yanıtlar token bazlıdır, aday bazlı DEĞİLDİR: gövdede birleşen
//   tüm adaylar aynı yanıtı paylaşır.
// - SendResponse { success: boolean, messageId?: string, error?: FirebaseError }
//   (messaging-api.d.ts); success=false ise error garanti edilir.
// - FirebaseError.code = 'messaging/<kod>' öneki PrefixedFirebaseError ile gelir
//   (utils/error.js: super('messaging', info.code, ...)).
// - BatchResponse { responses, successCount, failureCount }; successCount,
//   responses.filter(r => r.success).length olarak hesaplanır.

// FCM toplam payload limiti 4096 bayttır; notification body için güvenlik
// payıyla 3000 bayt kullanırız. Sığmayan adaylar BU koşuda loglanmaz ve
// sonraki koşuya devredilir — böylece "gönderilmeyen ama loglanan" kayıp yok olur.
const DEFAULT_BODY_LIMIT_BYTES = 3000;

// Token belgesinin artık geçersiz olduğunun KESİN kanıtı sayılan kodlar.
// firebase-admin 12.7.0 lib/utils/error.js kaynak kodundan doğrulandı:
// - 'invalid-registration-token' (MessagingClientErrorCode.
//   INVALID_REGISTRATION_TOKEN; sunucu 'InvalidRegistration' eşlemesi):
//   "Invalid registration token provided."
// - 'registration-token-not-registered' (REGISTRATION_TOKEN_NOT_REGISTERED;
//   sunucu eşlemeleri: 'NotRegistered', v1 'NOT_FOUND'/'UNREGISTERED'):
//   "...Remove this registration token and stop using it to send messages."
// Runtime kod = 'messaging/<kod>' (PrefixedFirebaseError, super('messaging', ...)).
//
// BİLİNÇLİ OLARAK LİSTEDE OLMAYANLAR (token korunur):
// - messaging/invalid-argument: payload/argüman kaynaklı olabilir → silme.
// - messaging/mismatched-credential: yanlış secret vb. düzeltilebilir durum →
//   silme (silinirse geçerli token'lar toplu kaybedilir).
// - messaging/invalid-package-name, messaging/invalid-payload,
//   messaging/invalid-data-payload-key, messaging/payload-size-limit-exceeded,
//   messaging/invalid-options: token'ın kendisiyle ilgisiz → silme.
// - messaging/server-unavailable, messaging/internal-error,
//   messaging/unknown-error, messaging/message-rate-exceeded,
//   messaging/device-message-rate-exceeded: geçici → koru.
// SDK'da var olmayan kodlar (örn. 'registration-token-not-valid') KULLANILMAZ.
const DEAD_TOKEN_CODES = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered'
]);

function isDeadTokenCode(code) {
    return typeof code === 'string' && DEAD_TOKEN_CODES.has(code);
}

function utf8Bytes(str) {
    return Buffer.byteLength(String(str), 'utf8');
}

function candidateLine(candidate) {
    return `${candidate.title} — ${candidate.body}`;
}

/**
 * Adaylardan gönderilecek bildirimi kurar.
 *
 * @param {Array<{title: string, body: string}>} candidates sıralı adaylar
 * @param {{maxBytes?: number}} [options] body bayt sınırı
 * @returns {{notification: {title: string, body: string},
 *            included: typeof candidates,
 *            excludedCount: number}}
 *
 * - Tek aday: mevcut payload birebir korunur ({title, body} aynen gider).
 * - Çoklu aday: eski davranıştan farklı olarak slice(0,3) ile içerik
 *   kaybedilmez; bayt sınırına kadar TÜM satırlar sığdırılır, sığmayanlar
 *   excludedCount olarak döner ve çağrıncı tarafından loglanmaz.
 * - İlk satır sınırı aşsa bile dahil edilir (her koşulda ilerleme garantisi).
 */
function buildBatchNotification(candidates, options = {}) {
    const maxBytes = options.maxBytes ?? DEFAULT_BODY_LIMIT_BYTES;
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return { notification: null, included: [], excludedCount: 0 };
    }
    if (candidates.length === 1) {
        const only = candidates[0];
        return {
            notification: { title: only.title, body: only.body },
            included: [only],
            excludedCount: 0
        };
    }
    const included = [];
    const lines = [];
    let used = 0;
    for (const candidate of candidates) {
        const line = candidateLine(candidate);
        const lineBytes = utf8Bytes(line);
        if (included.length > 0 && used + lines.length /* '\n' payları */ + lineBytes > maxBytes) {
            break;
        }
        if (included.length === 0) {
            // Tek satır limiti aşsa bile ilk aday her koşulda gönderilir.
            included.push(candidate);
            lines.push(line);
            used += lineBytes;
            continue;
        }
        included.push(candidate);
        lines.push(line);
        used += lineBytes;
    }
    const excludedCount = candidates.length - included.length;
    return {
        notification: {
            title: `Parnex (${included.length} bildirim)`,
            body: lines.join('\n')
        },
        included,
        excludedCount
    };
}

/**
 * BatchResponse'ı özetler. Yalnızca SDK'nın gerçekten döndürdüğü alanları okur
 * (successCount / failureCount / responses[].success / responses[].error.code).
 *
 * Kabul kuralı: successCount > 0 ise tüm dahil edilen adaylar "FCM'e teslim
 * edildi" sayılır. Gövde tek multicast'te tüm adayları taşıdığı ve yanıtlar
 * token bazlı olduğu için kısmi başarı (birkaç token) adaylar arasında ayrım
 * yapmaz; bu genelleme bilinçlidir. successCount === 0 ise HİÇBİR aday
 * loglanmaz — adaylar sonraki koşuya devreder (en az bir kez teslim).
 *
 * Bu işlev "tam bir kez" (exactly-once) garantisi VERMEZ: yanıt kaybedilirse
 * (ağ hatası/fırlatılan istisna) commit yapılmaz ve yeniden deneme yinelenen
 * bildirim oluşturabilir. Sistem en az bir kez (at-least-once) çalışır.
 *
 * @param {{responses?: Array<{success: boolean, error?: {code?: string}}>,
 *          successCount?: number, failureCount?: number}|null|undefined} res
 * @returns {{accepted: boolean, successCount: number, failureCount: number,
 *            errorCodes: string[]}}
 */
function summarizeBatchResponse(res) {
    const responses = Array.isArray(res && res.responses) ? res.responses : [];
    const successCount = Number.isFinite(res && res.successCount) ? res.successCount
        : responses.filter(r => r && r.success === true).length;
    const failureCount = Number.isFinite(res && res.failureCount) ? res.failureCount
        : responses.length - successCount;
    const errorCodes = [];
    for (const r of responses) {
        if (r && r.success === false && r.error && typeof r.error.code === 'string') {
            errorCodes.push(r.error.code);
        }
    }
    return {
        accepted: successCount > 0,
        successCount,
        failureCount,
        errorCodes
    };
}

module.exports = {
    DEFAULT_BODY_LIMIT_BYTES,
    DEAD_TOKEN_CODES,
    isDeadTokenCode,
    buildBatchNotification,
    summarizeBatchResponse
};
