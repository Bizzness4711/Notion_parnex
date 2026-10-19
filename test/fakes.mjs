// Push testleri için paylaşılan sahte FCM/Firestore altyapısı.
// Gerçek FCM/Firestore çağrısı YAPMAZ. (node --test tarafından test dosyası
// sayılmaz; yalnızca import edilir.)
import sendUser from '../tools/push/send-user.js';

const { localDateString, addDays } = sendUser;

export const TZ = 'Europe/Istanbul';
export const todayStr = localDateString(new Date(), TZ);
export const tomorrowStr = addDays(todayStr, 1);
export const monthStr = todayStr.substring(0, 7);

export const userDoc = { id: 'u-test', data: () => ({ timeZone: TZ }) };
export const serverTimestamp = () => ({ fakeTs: true });
export const makeLogger = () => {
    const lines = [];
    return { lines, log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
};

function snapshot(items) {
    const docs = items.map(it => ({ id: it.id, data: () => it.data }));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => { docs.forEach(fn); } };
}

// processUser'nin kullandığı Firestore alt kümesi: collection/doc/get/where/
// batch(set+commit)/doc.delete. commit ÖNCESİNDE hiçbir yazım kalıcı değildir
// (gerçek batch davranışıyla aynı) — bu yüzden "yazım yok" iddiası
// commits===0 ve writes===0 ile ölçülür.
export function makeDb(seed = {}) {
    const state = {
        logged: new Set(seed.logged || []),
        writes: [],
        commits: 0,
        deleted: [],
        // Sorgu maliyet testleri için: gönderilen filtreler ve dönen belge
        // sayıları (Firestore'ta faturalanan okuma = dönen belge sayısı).
        queries: [],
        reads: {},
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
                state.queries.push({ name, filters: filters.slice() });
                state.reads[name] = (state.reads[name] || 0) + items.length;
                return snapshot(items);
            }
        };
    }
    function docRef(name, id) {
        return {
            id,
            name,
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
        batch: () => {
            const pending = [];
            return {
                set(ref, data) { const entry = { ref, data }; pending.push(entry); state.writes.push(entry); },
                async commit() {
                    state.commits += 1;
                    // Gerçek Firestore gibi: COMMIT edilen pushLog belgeleri
                    // sonraki koşularda "loglanmış" görünür (saatlik koşular
                    // arası dedup zinciri testleri). Commit edilmeyen yazım
                    // hiçbir zaman logged'a geçmez.
                    for (const w of pending) {
                        if (w.ref && w.ref.name === 'pushLog') state.logged.add(w.ref.id);
                    }
                }
            };
        },
        _state: state
    };
}

export function makeMessaging(impl) {
    const calls = [];
    return {
        calls,
        async sendEachForMulticast(message) {
            calls.push(message);
            return impl(message);
        }
    };
}

export const okBatch = n => ({
    successCount: n,
    failureCount: 0,
    responses: Array.from({ length: n }, () => ({ success: true, messageId: 'm-ok' }))
});
