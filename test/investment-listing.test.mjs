import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from '../test-helpers/app-context.mjs';

// Yatırım işlemleri listeleme garantileri: alış/satış/yatırma/çekme/kâr-zarar
// kayıtları genel İşlemler listesinde görünür; tür/hesap filtreleri, arama,
// tarih sıralaması ve çift listeleme kontrolü. Kayıt yolu (ana form) e2e ile
// ayrıca doğrulanır; burada okuma/taraştırma katmanı kilitlenir.

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

evalInContext(context, `
    currentUser = { uid: 'u1', email: 't@t.com', providerData: [{ providerId: 'password' }], displayName: '' };
    currentMonth = '2026-10';
    isHidden = false;
    totalBalanceVisible = false;
    accounts = [
        { id: 'cash', name: 'Nakit', currency: 'TRY', type: 'cash', balance: 50000 },
        { id: 'usd', name: 'USD Kasa', currency: 'USD', type: 'investment', balance: 1000, quantity: 1000, openingRate: 41.2, buyPrice: 41.2 }
    ];
    selectedAccounts = new Set(['cash']);
    transfers = [
        { id: 'tf1', fromAccountId: 'cash', fromAccountName: 'Nakit', toAccountId: 'usd', toAccountName: 'USD Kasa', amount: 1500, date: '2026-10-08', description: 'Yatırıma transfer' }
    ];
    goals = []; budgets = []; recurringTransactions = []; notifications = [];
    transactions = [
        { id: 'tx-buy', type: 'income', amount: 500, category: '💰 Maaş', description: 'USD alımı', date: '2026-10-02', accountId: 'usd', accountName: 'USD Kasa', accountCurrency: 'USD', purchaseRate: 41.5, transactionRate: 42, profitLoss: 0, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 500, installmentAmount: 500 },
        { id: 'tx-sell', type: 'sell', amount: 200, category: '💰 Maaş', description: 'USD satışı', date: '2026-10-04', accountId: 'usd', accountName: 'USD Kasa', accountCurrency: 'USD', purchaseRate: 41.2, transactionRate: 42.5, sellRate: 42.5, sellTargetAccountId: 'cash', sellTargetAccountName: 'Nakit', profitLoss: 260, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 200, installmentAmount: 200 },
        { id: 'tx-deposit', type: 'income', amount: 1500, category: '💰 Maaş', description: 'Hesaba para yatırma', date: '2026-10-05', accountId: 'usd', accountName: 'USD Kasa', accountCurrency: 'USD', purchaseRate: 42, transactionRate: 42, profitLoss: 0, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 1500, installmentAmount: 1500 },
        { id: 'tx-withdraw', type: 'expense', amount: 300, category: '🛒 Market', description: 'Hesaptan para çekme', date: '2026-10-06', accountId: 'usd', accountName: 'USD Kasa', accountCurrency: 'USD', transactionRate: 42, profitLoss: 0, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 300, installmentAmount: 300 },
        { id: 'tx-pl', type: 'sell', amount: 100, category: '💰 Maaş', description: 'Zarar kapatma', date: '2026-10-07', accountId: 'usd', accountName: 'USD Kasa', accountCurrency: 'USD', transactionRate: 40, sellRate: 40, sellTargetAccountId: 'cash', profitLoss: -120, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 100, installmentAmount: 100 },
        { id: 'tx-normal-in', type: 'income', amount: 30000, category: '💰 Maaş', description: 'Normal maaş', date: '2026-10-01', accountId: 'cash', accountName: 'Nakit', accountCurrency: 'TRY', isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 30000, installmentAmount: 30000 },
        { id: 'tx-normal-out', type: 'expense', amount: 250, category: '🛒 Market', description: 'Normal market', date: '2026-10-03', accountId: 'cash', accountName: 'Nakit', accountCurrency: 'TRY', isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 250, installmentAmount: 250 }
    ];
`);

function render({ filterType = 'all', filterAccount = 'all', search = '', hidden = false } = {}) {
    evalInContext(context, `
        isHidden = ${hidden};
        document.getElementById('filterType').value = ${JSON.stringify(filterType)};
        document.getElementById('filterAccount').value = ${JSON.stringify(filterAccount)};
        document.getElementById('transactionSearch').value = ${JSON.stringify(search)};
        updateTransactionsUI();
    `);
    return {
        all: elements.get('allTransactionsList')?.innerHTML || '',
        recent: elements.get('recentTransactionsList')?.innerHTML || ''
    };
}

const count = (html, needle) => html.split(needle).length - 1;
const INVEST = ['USD alımı', 'USD satışı', 'Hesaba para yatırma', 'Hesaptan para çekme', 'Zarar kapatma'];

test('Tümü filtresi yatırım alış/satış/yatırma/çekme/kâr-zarar kayıtlarını gösterir', () => {
    const { all } = render();
    for (const desc of INVEST) assert.equal(count(all, desc), 1, `"${desc}" tam 1 kez görünmeli`);
    assert.equal(count(all, 'Normal maaş'), 1, 'normal gelir de görünür kalmalı');
    assert.equal(count(all, 'Normal market'), 1, 'normal gider de görünür kalmalı');
});

test('Tür filtreleri doğru alt kümeleri gösterir', () => {
    const income = render({ filterType: 'income' }).all;
    assert.ok(income.includes('USD alımı') && income.includes('Hesaba para yatırma'), 'gelir filtresi yatırımda alış+yatırma göstermeli');
    assert.ok(!income.includes('USD satışı') && !income.includes('Hesaptan para çekme'), 'gelir filtresi satır saklamamalı ama satış/çekmeyi dışarıda tutmalı');

    const expense = render({ filterType: 'expense' }).all;
    assert.ok(expense.includes('Hesaptan para çekme'), 'masraf filtresi çekmeyi göstermeli');
    assert.ok(!expense.includes('USD alımı') && !expense.includes('USD satışı'), 'masraf filtresi alış/satışı dışarıda tutmalı');

    const sell = render({ filterType: 'sell' }).all;
    assert.ok(sell.includes('USD satışı') && sell.includes('Zarar kapatma'), 'satış filtresi satış + kâr/zarar kaydını göstermeli');
    assert.ok(!sell.includes('USD alımı') && !sell.includes('Hesaba para yatırma'), 'satış filtresi sadece satış satırları');

    const transfer = render({ filterType: 'transfer' }).all;
    assert.ok(transfer.includes('Yatırıma transfer'), 'transfer filtresi transferi göstermeli');
    assert.ok(!transfer.includes('USD alımı'), 'transfer filtresi işlem satırı göstermemeli');
});

test('Yatırım hesap filtresi sadece o hesabın işlemlerini gösterir', () => {
    const { all } = render({ filterAccount: 'usd' });
    for (const desc of INVEST) assert.ok(all.includes(desc), `"${desc}" hesap filtresinde görünmeli`);
    assert.ok(!all.includes('Normal maaş') && !all.includes('Normal market'), 'diğer hesabın işlemleri filtrede olmamalı');
});

test('Arama açıklama ve hesap adıyla yatırım işlemlerini bulur', () => {
    assert.ok(render({ search: 'satış' }).all.includes('USD satışı'), 'açıklama araması satışı bulmalı');
    assert.ok(render({ search: 'usd' }).all.includes('USD alımı'), 'hesap adı araması alış bulmalı');
});

test('Tarih sıralaması yeni den eskiye', () => {
    const { all } = render();
    const order = ['Zarar kapatma', 'Hesaptan para çekme', 'Hesaba para yatırma', 'USD satışı', 'Normal market', 'USD alımı', 'Normal maaş'];
    let last = -1;
    for (const desc of order) {
        const pos = all.indexOf(desc);
        assert.ok(pos > 0, `"${desc}" listede olmalı`);
        assert.ok(pos > last, `"${desc}" daha eski kayıtlardan sonra gelmeli (desc sıralama bozuk)`);
        last = pos;
    }
});

test('Her kayıt yalnızca bir kez listelenir (çift listeleme yok)', () => {
    const { all, recent } = render();
    for (const desc of [...INVEST, 'Normal maaş', 'Normal market', 'Yatırıma transfer']) {
        assert.equal(count(all, desc), 1, `ana liste: "${desc}" tek olmalı`);
    }
    assert.equal(count(recent, 'Zarar kapatma'), 1, 'dashboard listesi de tekrarsız olmalı');
});

test('Gizlilik modu açıkken satırlar görünür, tutarlar maskeli kalır', () => {
    const { all } = render({ hidden: true });
    for (const desc of INVEST) assert.ok(all.includes(desc), `gizliyken "${desc}" satırı kaybolmamalı`);
    assert.ok(all.includes('••••••'), 'tutar maskesi uygulanmalı');
    assert.ok(!all.includes('500.00'), 'gerçek tutar sızmamalı');
    evalInContext(context, 'isHidden = false;');
});
