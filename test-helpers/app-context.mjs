// Parnex uygulama betiklerini Node içinde çalıştırılabilir yapmak için yardımcı yükleyici.
// Tarayıcı/Firebase bağımlılıkları stub'lanır; yalnızca saf hesap fonksiyonları test edilir.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createLocalStorageStub() {
    const store = new Map();
    return {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key),
        clear: () => store.clear()
    };
}

function createDocumentStub() {
    const noop = () => {};
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop } }),
        body: { classList: { add: noop, remove: noop } },
        documentElement: { style: { setProperty: noop } }
    };
}

function createFirebaseStub() {
    const noop = () => {};
    const authStub = {
        languageCode: null,
        setPersistence: () => Promise.resolve(),
        onAuthStateChanged: noop
    };
    const persistenceLevels = { LOCAL: 'LOCAL', SESSION: 'SESSION', NONE: 'NONE' };
    const authFn = () => authStub;
    // categories.js/firebase-config.js hem `firebase.auth.Auth.Persistence.LOCAL` hem
    // `auth.setPersistence(...)` şeklinde erişir; her iki yüz için de stub gerekli.
    authFn.Auth = { Persistence: persistenceLevels };
    authStub.Auth = { Persistence: persistenceLevels };
    const docStub = {
        set: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        get: () => Promise.resolve({ exists: false, data: () => ({}) })
    };
    const collectionStub = {
        doc: () => docStub,
        add: () => Promise.resolve({ id: 'stub-id' }),
        where: () => collectionStub,
        orderBy: () => collectionStub,
        limit: () => collectionStub,
        get: () => Promise.resolve({ empty: true, size: 0, forEach: noop, docs: [] })
    };
    const firestoreStub = {
        collection: () => collectionStub,
        FieldValue: { serverTimestamp: () => null }
    };
    return {
        initializeApp: () => ({}),
        auth: authFn,
        firestore: () => firestoreStub
    };
}

function createSandboxGlobals() {
    const noop = () => {};
    return {
        console,
        window: { addEventListener: noop, removeEventListener: noop, location: { href: 'https://localhost/' } },
        document: createDocumentStub(),
        navigator: { language: 'tr-TR', userAgent: 'parnex-test' },
        location: { href: 'https://localhost/', pathname: '/' },
        localStorage: createLocalStorageStub(),
        sessionStorage: createLocalStorageStub(),
        alert: noop,
        confirm: () => false,
        prompt: () => null,
        fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
        setTimeout: () => 0,
        clearTimeout: noop,
        setInterval: () => 0,
        clearInterval: noop,
        firebase: createFirebaseStub()
    };
}

// Verilen uygulama dosyalarını sırayla aynı bağlamda çalıştırır; böylece
// firebase-config.js'teki `let` global'leri sonraki dosyalar tarafından görünür olur.
export function loadAppScripts(scripts) {
    const context = vm.createContext(createSandboxGlobals());
    for (const script of scripts) {
        const source = readFileSync(path.join(PROJECT_ROOT, script), 'utf8');
        vm.runInContext(source, context, { filename: script });
    }
    return context;
}

export const APP_SCRIPTS = [
    'js/utils.js',
    'js/firebase-config.js',
    'js/rates.js',
    'js/categories.js',
    'js/accounts.js'
];

// Test içinden uygulama global'lerini (let/const dahil) okumak/atamak için.
export function evalInContext(context, expression) {
    return vm.runInContext(expression, context, { filename: 'test-expression.js' });
}
