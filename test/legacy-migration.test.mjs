import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext, APP_SCRIPTS } from '../test-helpers/app-context.mjs';

// Legacy migration (accounts.js: window.migrateLegacyFirebaseData) izole testleri.
// Sahte eski uygulama + bellek içi hedef depo kullanılır; gerçek Firebase'e,
// üretim verisine veya ağa dokunulmaz.

const LEGACY_UID = 'legacy-1';

function makeHarness({
    prompts = [],
    legacyUserSnap = { exists: true, data: () => ({ currency: 'USD', currentMonth: '2025-05', evil: 'x', email: 'leak@x' }) },
    legacyCollections = {},
    legacyAuthError = null,
    targetStore = { u1: { __settings: {} } }
} = {}) {
    const context = loadAppScripts(APP_SCRIPTS);
    const state = {
        writes: [],
        settingsWrites: [],
        batchCommits: [],
        toasts: [],
        signIn: null,
        signOuts: 0,
        inits: 0,
        promptCalls: 0
    };

    // --- Hedef (mevcut proje) sahte Firestore ---
    const collOf = (uid, name) => {
        const user = (targetStore[uid] = targetStore[uid] || { __settings: {} });
        return (user[name] = user[name] || {});
    };
    const usersCollection = {
        doc(uid) {
            return {
                async get() {
                    const u = targetStore[uid];
                    return u
                        ? { exists: true, data: () => ({ ...u.__settings }) }
                        : { exists: false, data: () => ({}) };
                },
                async set(data, opts) {
                    const u = (targetStore[uid] = targetStore[uid] || { __settings: {} });
                    Object.assign(u.__settings, data);
                    state.settingsWrites.push({ uid, data: { ...data }, merge: !!(opts && opts.merge) });
                },
                collection(name) {
                    return {
                        async get() {
                            const c = collOf(uid, name);
                            return {
                                docs: Object.entries(c).map(([id, data]) => ({ id, data: () => structuredClone(data) }))
                            };
                        },
                        doc(id) {
                            return {
                                _set: async (data, opts) => {
                                    const c = collOf(uid, name);
                                    c[id] = opts && opts.merge ? { ...(c[id] || {}), ...structuredClone(data) } : structuredClone(data);
                                    state.writes.push({ uid, name, id });
                                }
                            };
                        }
                    };
                }
            };
        }
    };
    const dbObj = evalInContext(context, 'db');
    dbObj.collection = (path) => {
        assert.equal(path, 'users', 'migration yalnız users koleksiyonuna yazmalı');
        return usersCollection;
    };
    dbObj.batch = () => {
        const ops = [];
        return {
            set(ref, data, opts) { ops.push({ ref, data, opts }); },
            async commit() { state.batchCommits.push(ops.length); for (const op of ops) await op.ref._set(op.data, op.opts); }
        };
    };

    // --- Eski (legacy) sahte uygulama ---
    const legacyApp = {
        auth: () => ({
            signInWithEmailAndPassword: async (email, password) => {
                state.signIn = { email, password };
                if (legacyAuthError) throw new Error(legacyAuthError);
                return { user: { uid: LEGACY_UID } };
            },
            signOut: async () => { state.signOuts++; }
        }),
        firestore: () => ({
            collection: (name) => {
                assert.equal(name, 'users');
                return {
                    doc: (uid) => ({
                        get: async () => (uid === LEGACY_UID ? legacyUserSnap : { exists: false, data: () => ({}) }),
                        collection: (c) => ({
                            get: async () => ({
                                docs: (legacyCollections[c] || []).map(d => ({ id: d.id, data: () => structuredClone(d.data) }))
                            })
                        })
                    })
                };
            }
        })
    };
    const firebaseObj = evalInContext(context, 'firebase');
    firebaseObj.initializeApp = (cfg, name) => { state.inits++; state.initName = name; return legacyApp; };
    firebaseObj.app = () => { throw new Error('legacyMigration uygulaması önceden yok'); };

    // --- Ortam stub'ları (global özellik atamaları; currentUser `let` olduğu için vm içinden) ---
    const promptQueue = [...prompts];
    context.prompt = () => {
        state.promptCalls++;
        return promptQueue.length ? promptQueue.shift() : null;
    };
    context.showToast = (m, t) => state.toasts.push({ m, t });
    context.loadUserData = () => { state.loadedCount++; };
    evalInContext(context, 'currentUser = { uid: "u1", email: "yeni@ornek.com" };');

    state.context = context;
    state.targetStore = targetStore;
    state.loadedCount = 0;
    state.migrate = evalInContext(context, 'window.migrateLegacyFirebaseData');
    return state;
}

test('migration: temel akış — yazma, beyaz liste ayarlar, oturum kapatma', async () => {
    const h = makeHarness({
        prompts: ['esi@ornek.com', 'gizli-parola'],
        legacyCollections: {
            accounts: [{ id: 'acc1', data: { balance: 100, name: 'Eski Nakit' } }],
            transactions: [{ id: 'tx1', data: { amount: 50, type: 'income' } }]
        }
    });

    await h.migrate();

    assert.equal(h.signIn.email, 'esi@ornek.com');
    assert.equal(h.signIn.password, 'gizli-parola');
    assert.deepEqual(h.targetStore.u1.accounts.acc1, { balance: 100, name: 'Eski Nakit' });
    assert.deepEqual(h.targetStore.u1.transactions.tx1, { amount: 50, type: 'income' });
    // Ayarlar: yalnız beyaz liste + hedefte eksik alanlar kopyalanır.
    assert.deepEqual(h.targetStore.u1.__settings, { currency: 'USD', currentMonth: '2025-05' });
    // Tüm hedef yazımları mevcut kullanıcıya (u1) ait.
    assert.ok(h.writes.every(w => w.uid === 'u1'));
    assert.equal(h.signOuts, 1);
    assert.equal(h.loadedCount, 1);
    const last = h.toasts.at(-1);
    assert.equal(last.t, 'success');
    assert.ok(last.m.includes('accounts: 1'), last.m);
    assert.ok(last.m.includes('transactions: 1'), last.m);
});

test('migration: mevcut belgeler EZİLMEZ — ID çakışmasında hedef veri korunur', async () => {
    const targetStore = {
        u1: {
            __settings: { themeColor: '#123456' },
            accounts: { acc1: { balance: 999, userEdited: true } }
        }
    };
    const h = makeHarness({
        prompts: ['esi@ornek.com', 'gizli-parola'],
        legacyCollections: {
            accounts: [
                { id: 'acc1', data: { balance: 100 } },
                { id: 'acc2', data: { balance: 200 } }
            ]
        },
        targetStore
    });

    await h.migrate();

    // Mevcut acc1 aynen kaldı; acc2 eklendi.
    assert.deepEqual(targetStore.u1.accounts.acc1, { balance: 999, userEdited: true });
    assert.deepEqual(targetStore.u1.accounts.acc2, { balance: 200 });
    // Ayarlar: mevcut themeColor ezilmedi, eksik currency dolduruldu, evil kopyalanmadı.
    assert.equal(targetStore.u1.__settings.themeColor, '#123456');
    assert.equal(targetStore.u1.__settings.currency, 'USD');
    assert.equal(targetStore.u1.__settings.evil, undefined);
    const last = h.toasts.at(-1);
    assert.equal(last.t, 'success');
    assert.ok(last.m.includes('accounts: 1'), last.m);
    assert.ok(last.m.includes('1 mevcut kayıt korundu'), last.m);
});

test('migration: kimlik doğrulama hatası — yazma yok, hata toastu, oturum kapatılır', async () => {
    const h = makeHarness({
        prompts: ['esi@ornek.com', 'yanlis'],
        legacyAuthError: 'auth/wrong-password',
        legacyCollections: { accounts: [{ id: 'acc1', data: { balance: 1 } }] }
    });

    await h.migrate();

    assert.equal(h.writes.length, 0);
    assert.equal(h.settingsWrites.length, 0);
    assert.equal(h.signOuts, 1);
    assert.equal(h.loadedCount, 0);
    const last = h.toasts.at(-1);
    assert.equal(last.t, 'error');
    assert.ok(last.m.includes('aktarılmadı'), last.m);
});

test('migration: eski hesapta kullanıcı belgesi yoksa hata, yazma yok', async () => {
    const h = makeHarness({
        prompts: ['esi@ornek.com', 'parola'],
        legacyUserSnap: { exists: false, data: () => ({}) },
        legacyCollections: { accounts: [{ id: 'acc1', data: { balance: 1 } }] }
    });

    await h.migrate();

    assert.equal(h.writes.length, 0);
    const last = h.toasts.at(-1);
    assert.equal(last.t, 'error');
    assert.ok(last.m.includes('bulunamadı'), last.m);
});

test('migration: prompt iptali — hiçbir bağlantı/yazma yapılmaz', async () => {
    const h = makeHarness({ prompts: [] });

    await h.migrate();

    assert.equal(h.inits, 0);
    assert.equal(h.signIn, null);
    assert.equal(h.writes.length, 0);
    assert.equal(h.toasts.length, 0);
});

test('migration: 450+ belge batch sınırlarına bölünür', async () => {
    const docs = Array.from({ length: 460 }, (_, i) => ({ id: 'a' + i, data: { balance: i } }));
    const h = makeHarness({
        prompts: ['esi@ornek.com', 'parola'],
        legacyCollections: { accounts: docs }
    });

    await h.migrate();

    assert.deepEqual(h.batchCommits, [450, 10]);
    assert.equal(Object.keys(h.targetStore.u1.accounts).length, 460);
    assert.ok(h.toasts.at(-1).m.includes('accounts: 460'));
});
