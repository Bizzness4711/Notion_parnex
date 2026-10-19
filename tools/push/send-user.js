'use strict';

// Tek kullanıcının push akışı. send.js sayfalamayı, hata yalıtımını ve CI
// çıkış kodunu yönetir; bu modül yalnızca bir kullanıcının işini yapar.
//
// Sözleşme:
// - HATA fırlatır; çağıran (send.js) kullanıcı bazlı yakalar ve koşuyu
//   öldürmez. Bu yüzden pushLog HİÇBİR zaman ara aşamada yazılmaz:
//   tüm batch.set'ler gönderim kabulünden SONRA ve commit'ten önce yapılır.
//   Herhangi bir aşamada exception → commit hiç çalışmaz → yazım yok.
// - FCM yanıtını send-helpers.summarizeBatchResponse özetler (sdk 12.7.0
//   alanları doğrulanmış): yanıt token bazlıdır, gövdedeki tüm dahil edilen
//   adaylar aynı sonucu paylaşır.
const { buildBatchNotification, summarizeBatchResponse, isDeadTokenCode } = require('./send-helpers');

function localDateString(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * @param {{db: object, messaging: object, uid: string, userDoc: {data(): object},
 *          serverTimestamp: () => object, logger?: {log: Function}}} deps
 * @returns {Promise<object>} özet sayaçlar (uid/tutar içermez)
 */
async function processUser({ db, messaging, uid, userDoc, serverTimestamp, logger = console }) {
    const timeZone = userDoc.data().timeZone || 'UTC';
    const todayStr = localDateString(new Date(), timeZone);
    const tomorrowStr = addDays(todayStr, 1);
    const month = todayStr.substring(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;

    const tokensSnap = await db.collection('users').doc(uid).collection('pushTokens').get();
    const tokens = tokensSnap.docs.map(d => d.id);
    if (!tokens.length) return { sent: false, skipped: 'no-tokens', candidateCount: 0 };

    // Adaylar gönderim SONUNDA değerlendirilir: pushLog, o adayın dahil
    // edildiği gövde FCM tarafından kabul edilince yazılır (bkz. send-helpers).
    const candidates = [];
    const batch = db.batch();
    const logRef = (id) => db.collection('users').doc(uid).collection('pushLog').doc(id);
    const isLogged = async (id) => (await logRef(id).get()).exists;

    // 1) Yarın vadesi gelen tekrarlayanlar
    const recSnap = await db.collection('users').doc(uid).collection('recurringTransactions').get();
    for (const doc of recSnap.docs) {
        const r = doc.data();
        if (r.active === false || r.nextDate !== tomorrowStr) continue;
        const id = `rec-${doc.id}-${r.nextDate}`;
        if (await isLogged(id)) continue;
        candidates.push({ logRef: logRef(id), title: '⏰ Yarın vade', body: `${r.description || r.category || 'Tekrarlayan işlem'} (₺${Number(r.amount || 0).toFixed(2)})` });
    }

    // 2) Aşan bütçeler (yaklaşık: kur çevrimi yok)
    const budgetSnap = await db.collection('users').doc(uid).collection('budgets').where('month', '==', month).get();
    if (!budgetSnap.empty) {
        const txSnap = await db.collection('users').doc(uid).collection('transactions')
            .where('type', '==', 'expense').where('date', '>=', monthStart).where('date', '<=', monthEnd).get();
        const spentByCat = {};
        txSnap.forEach(d => {
            const t = d.data();
            spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount || 0);
        });
        for (const doc of budgetSnap.docs) {
            const b = doc.data();
            const limit = Number(b.limit) || 0;
            if (!(limit > 0)) continue;
            const spent = spentByCat[b.category] || 0;
            if (spent >= limit) {
                const id = `bud-${month}-${b.category}-over`;
                if (await isLogged(id)) continue;
                candidates.push({ logRef: logRef(id), title: '⚠️ Bütçe aşıldı', body: `${b.category}: ₺${spent.toFixed(2)} / ₺${limit.toFixed(2)}.` });
            }
        }
    }

    // 3) Tamamlanan hedefler
    const goalsSnap = await db.collection('users').doc(uid).collection('goals').get();
    for (const doc of goalsSnap.docs) {
        const g = doc.data();
        if (Number(g.amount) > 0 && Number(g.current) >= Number(g.amount)) {
            const id = `goal-${doc.id}-100`;
            if (await isLogged(id)) continue;
            candidates.push({ logRef: logRef(id), title: '🎉 Hedef tamamlandı', body: `${g.name} hedefine ulaştın!` });
        }
    }

    if (!candidates.length) return { sent: false, candidateCount: 0 };

    // Tek aday birebir gönderilir (payload korunur); çok adayda bayt
    // sınırına kadar TÜMÜ sığdırılır. Sığmayan aday loglanmaz → sonraki
    // koşuya devredilir; böylece "gönderilmeyen ama loglanan" kayıp olmaz.
    const { notification, included, excludedCount } = buildBatchNotification(candidates);
    const res = await messaging.sendEachForMulticast({ tokens, notification });
    const outcome = summarizeBatchResponse(res);
    // Yanıtlar token bazlıdır; gövdedeki tüm dahil edilen adaylar aynı
    // sonucu paylaşır. successCount > 0 ise (kısmi başarı dahil) dahil
    // edilen adaylar kabul sayılır ve pushLog'a yazılır; 0 ise hiçbir
    // aday loglanmaz (FCM hiçbir token'a teslim etmediğini bildirdi).
    if (outcome.accepted) {
        for (const c of included) {
            batch.set(c.logRef, { at: serverTimestamp() });
        }
    }
    if (excludedCount > 0) {
        logger.log(`Bilgi: ${excludedCount} aday gövdeye sığmadı, sonraki koşuya devredildi.`);
    }
    logger.log(`FCM: ${outcome.successCount} başarılı, ${outcome.failureCount} hatalı`);

    // Yanıtlar token sırasıyla eşleşir (sdk: responses, MulticastMessage.tokens
    // sırasındadır). Yalnızca KESİN geçersizlik kodlarında token belgesi silinir;
    // invalid-argument gibi genel/müphem kodlar ve geçici hatalar token'ı KORUR
    // (bkz. send-helpers DEAD_TOKEN_CODES yorumları).
    const dead = [];
    res.responses.forEach((r, i) => {
        if (!r.success && isDeadTokenCode(r.error?.code)) dead.push(tokens[i]);
        if (!r.success) logger.log(`Token hata: ${tokens[i].slice(0, 12)}… ${r.error?.code} ${r.error?.message}`);
    });
    for (const t of dead) {
        await db.collection('users').doc(uid).collection('pushTokens').doc(t).delete();
    }
    await batch.commit();
    if (outcome.accepted) {
        logger.log(`Gönderildi: ${uid} (${included.length} uyarı)`);
    } else {
        logger.log(`Gönderilemedi: ${uid} (FCM kabul etmedi; adaylar sonraki koşuya devredildi)`);
    }
    return {
        sent: outcome.accepted,
        candidateCount: candidates.length,
        includedCount: included.length,
        excludedCount,
        successCount: outcome.successCount,
        failureCount: outcome.failureCount,
        deadCount: dead.length
    };
}

module.exports = { processUser, localDateString, addDays };
