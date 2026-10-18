import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from '../test-helpers/app-context.mjs';

// Gizlilik modu DOM sızıntı taraması: isHidden=true iken hiçbir güncelleme
// gerçek tutarı/ yüzdesi DOM'a yazmamalı. Aykırı değer tutarlar seed edilir
// ve tüm eleman çıktıları taranır. (Chart vm'de yok; grafikler erken döner.)

const SCRIPTS = [
    'js/utils.js',
    'js/firebase-config.js',
    'js/rates.js',
    'js/categories.js',
    'js/transactions.js',
    'js/accounts.js',
    'js/budgets.js',
    'js/health.js',
    'js/notifications.js',
    'js/sprint1.js'
];

const context = loadAppScripts(SCRIPTS);

// --- Zengin DOM stub: kayıt defteri + permissive eleman ---
const elements = new Map();
function makeEl(id) {
    return {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        hidden: false,
        className: '',
        style: { display: '', width: '', setProperty: () => {}, removeProperty: () => {} },
        classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
        dataset: {},
        options: [],
        setAttribute: () => {},
        removeAttribute: () => {},
        getAttribute: () => null,
        appendChild: () => {},
        append: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
        focus: () => {}
    };
}
const documentStub = evalInContext(context, 'document');
documentStub.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
};
documentStub.body.appendChild = () => {};
documentStub.body.classList.toggle = () => {};
documentStub.createElement = () => makeEl('created');

// --- Seed veri: aykırı değerli işaretçiler ---
const MARKERS = ['98765', '5432', '1234.56', '23456', '8765', '765.43', '345.67', '1300.00', '2500.00', '900.00'];

evalInContext(context, `
    currentUser = { uid: 'u1', email: 't@t.com', providerData: [{ providerId: 'password' }], displayName: '' };
    currentMonth = '2026-10';
    isHidden = false;
    totalBalanceVisible = false;
    accounts = [
        { id: 'acc1', name: 'Ziraat', currency: 'TRY', type: 'bank', balance: 98765.43 },
        { id: 'acc2', name: 'USD Kasa', currency: 'USD', type: 'investment', balance: 5432.10, quantity: 5432.10 }
    ];
    selectedAccounts = new Set(['acc1']);
    transactions = [
        { id: 'tx1', type: 'expense', amount: 1234.56, category: 'Market', description: 'Market alışveriş', date: '2026-10-05', accountId: 'acc1', accountName: 'Ziraat', accountCurrency: 'TRY' },
        { id: 'tx2', type: 'income', amount: 23456.78, category: 'Maaş', description: 'Maaş ödemesi', date: '2026-10-01', accountId: 'acc1', accountName: 'Ziraat', accountCurrency: 'TRY' },
        { id: 'tx3', type: 'expense', amount: 900, category: 'Elektronik', description: 'TV', date: '2026-10-03', accountId: 'acc1', accountName: 'Ziraat', accountCurrency: 'TRY', isInstallment: true, installmentCount: 9, installmentAmount: 100, installmentInterestRate: 2.5, installmentTotal: 900 },
        { id: 'tx4', type: 'expense', amount: 100, profitLoss: 345.67, category: 'Döviz', description: 'USD satışı', date: '2026-10-04', accountId: 'acc2', accountName: 'USD Kasa', accountCurrency: 'USD' }
    ];
    transfers = [
        { id: 'tf1', fromAccountId: 'acc1', fromAccountName: 'Ziraat', toAccountId: 'acc2', toAccountName: 'USD Kasa', amount: 765.43, date: '2026-10-06', description: 'Döviz alımı' }
    ];
    goals = [{ id: 'g1', name: 'Tatil', amount: 10000, current: 2500, accountName: 'Ziraat' }];
    budgets = [{ id: 'b1', category: 'Market', month: '2026-10', limit: 1300 }];
    recurringTransactions = [{ id: 'r1', type: 'expense', description: 'Kira ödemesi', amount: 8765.43, nextDate: '2026-10-20', accountCurrency: 'TRY', active: true, accountId: 'acc1' }];
    notifications = [{ id: 'n1', key: 'seed', message: 'Bildirim: ₺8765.43 aşıldı %90', icon: 'fa-bell', title: 'Parnex', read: false, ts: 1 }];
`);

function collectDomText() {
    let out = '';
    for (const el of elements.values()) {
        out += '\n' + String(el.innerHTML || '') + '\n' + String(el.textContent || '');
    }
    return out;
}

function renderAll(hidden) {
    elements.clear();
    evalInContext(context, `isHidden = ${hidden}; _shownBudgetAlerts && _shownBudgetAlerts.clear(); setPrivacyModeUI(${hidden});`);
    return collectDomText();
}

test('Görünür modda gerçek tutarlar DOM\'da görünür (test boşluklu değil)', () => {
    const visible = renderAll(false);
    for (const marker of MARKERS) {
        assert.ok(visible.includes(marker), `görünür modda ${marker} görünmeli; DOM: ${visible.slice(0, 500)}`);
    }
});

test('Gizli modda hiçbir işaretçi tutar/ yüzde DOM\'a sızmaz', () => {
    const hiddenText = renderAll(true);
    for (const marker of MARKERS) {
        assert.ok(!hiddenText.includes(marker), `gizli modda ${marker} sızdı; DOM: ${hiddenText.slice(0, 800)}`);
    }
});

test('Gizli modda maskeler görünür (••••••)', () => {
    const hiddenText = renderAll(true);
    assert.ok(hiddenText.includes('••••••'), 'maske metni DOM\'da olmalı');
});

test('Gizli modda hesap adları, kategoriler ve tarihler korunur', () => {
    const hiddenText = renderAll(true);
    assert.ok(hiddenText.includes('Ziraat'), 'hesap adı görünür kalmalı');
    assert.ok(hiddenText.includes('Market'), 'kategori adı görünür kalmalı');
    assert.ok(hiddenText.includes('2026-10-05') || hiddenText.includes('Ekim'), 'tarih bilgisi görünür kalmalı');
});

test('Bütçe aşım toast\'ı gizliyken rakam içermiyor, görünürken uyarı metni gerçek', () => {
    const toasts = [];
    const originalShowToast = context.showToast;
    context.showToast = (message, type) => { toasts.push(String(message)); };
    try {
        // Gizli: toast maskelenmiş olmalı (tek bir rakam bile yok).
        evalInContext(context, 'isHidden = true; _shownBudgetAlerts.clear(); checkBudgetAlerts();');
        assert.equal(toasts.length, 1, 'aşım uyarısı bir kez tetiklenmeli');
        assert.ok(!/\d/.test(toasts[0]), `gizli toast rakam içermemeli: ${toasts[0]}`);
        assert.ok(toasts[0].includes('₺••••••'), `gizli toast maske içermeli: ${toasts[0]}`);

        // Görünür: gerçek değerler görünmeli.
        toasts.length = 0;
        evalInContext(context, 'isHidden = false; _shownBudgetAlerts.clear(); checkBudgetAlerts();');
        assert.equal(toasts.length, 1);
        assert.ok(/\d/.test(toasts[0]), `görünür toast gerçek değer içermeli: ${toasts[0]}`);
    } finally {
        context.showToast = originalShowToast;
    }
});

test('Gizli → görünür geçişinde maskeler kalkar, gerçek değerler döner', () => {
    renderAll(true);
    const visibleAgain = renderAll(false);
    for (const marker of ['98765', '1234.56', '765.43', '2500.00']) {
        assert.ok(visibleAgain.includes(marker), `geçiş sonrası ${marker} görünmeli`);
    }
});

test('Transferler sayfası gizliyken satırları korur, tutar maskeli', () => {
    const hiddenText = renderAll(true);
    assert.ok(hiddenText.includes('Döviz alımı'), 'transfer açıklaması görünür kalmalı');
    assert.ok(hiddenText.includes('Ziraat') && hiddenText.includes('USD Kasa'), 'hesap adları görünür kalmalı');
    assert.ok(!hiddenText.includes('765.43'), 'transfer tutarı sızmemeli');
});
