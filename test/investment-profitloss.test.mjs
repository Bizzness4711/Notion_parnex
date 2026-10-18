import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from '../test-helpers/app-context.mjs';

// Birikim kartı ve raporlar: gerçekleşen kâr/zarar 'expense' (eski satış) VE
// 'sell' (yeni satış) kayıtlarından toplanmalı; 'income' (alış anındaki kâr)
// gerçekleşmemiş sayıldığı için dahil edilmemeli.

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
    exchangeRates = { TRY: 1, USD: 42 };
    accounts = [
        { id: 'cash', name: 'Nakit', currency: 'TRY', type: 'cash', balance: 50000 },
        { id: 'usd', name: 'USD Yatırım', currency: 'USD', type: 'investment', balance: 1000, quantity: 1000, openingRate: 41.2, buyPrice: 41.2 }
    ];
    selectedAccounts = new Set(['cash']);
    transfers = [];
    goals = []; budgets = []; recurringTransactions = []; notifications = [];
    transactions = [
        // Gerçekleşen eski tip satış (expense + profitLoss)
        { id: 'tx-legacy-sell', type: 'expense', amount: 10, category: '📈 Yatırım', description: 'Eski tip satış', date: '2026-10-03', accountId: 'usd', accountName: 'USD Yatırım', accountCurrency: 'USD', profitLoss: 50, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 10, installmentAmount: 10 },
        // Yeni tip satış (sell + profitLoss)
        { id: 'tx-sell', type: 'sell', amount: 20, category: '💰 Maaş', description: 'USD satışı', date: '2026-10-04', accountId: 'usd', accountName: 'USD Yatırım', accountCurrency: 'USD', sellRate: 43, sellTargetAccountId: 'cash', profitLoss: 260, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 20, installmentAmount: 20 },
        { id: 'tx-sell2', type: 'sell', amount: 5, category: '💰 Maaş', description: 'Zarar satışı', date: '2026-10-05', accountId: 'usd', accountName: 'USD Yatırım', accountCurrency: 'USD', sellRate: 39, sellTargetAccountId: 'cash', profitLoss: -120, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 5, installmentAmount: 5 },
        // Alış anındaki gerçekleşmemiş kâr: gerçekleşen toplama GİRMEMELİ
        { id: 'tx-buy', type: 'income', amount: 100, category: '💰 Maaş', description: 'USD alımı', date: '2026-10-02', accountId: 'usd', accountName: 'USD Yatırım', accountCurrency: 'USD', purchaseRate: 41.5, profitLoss: 9999, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 100, installmentAmount: 100 },
        // Yatırım dışı masrafın profitLoss'i toplanmamalı
        { id: 'tx-normal', type: 'expense', amount: 75, category: '🛒 Market', description: 'Market', date: '2026-10-06', accountId: 'cash', accountName: 'Nakit', accountCurrency: 'TRY', profitLoss: 777, isInstallment: false, installmentCount: 1, installmentInterestRate: 0, installmentInterestAmount: 0, installmentTotal: 75, installmentAmount: 75 }
    ];
`);

test('Birikim kartı gerçekleşen kâr/zararı expense + sell kayıtlarından toplar, income hariç', () => {
    evalInContext(context, 'updateDashboard();');
    const badge = elements.get('investmentProfitLoss')?.textContent || '';
    // gerçekleşen: 50 + 260 - 120 = 190; gerçekleşmemiş: (42 - 41.2) * 1000 = 800
    // toplam: 990. income (9999) ve yatırım dışı masraf (777) girmemeli.
    assert.equal(badge, 'Kâr/Zarar: +₺990.00', `rozet beklenen değerde olmalı, gelen: ${badge}`);
    const summary = elements.get('investmentSummary')?.textContent || '';
    assert.equal(summary, '₺42000.00', `Birikim toplamı quantity × güncel kur olmalı, gelen: ${summary}`);
});

test('Kâr/zarar raporu gerçekleşen sütununda sell kayıtları görünür', () => {
    evalInContext(context, 'updateProfitLossReport();');
    const html = elements.get('profitLossReportBody')?.innerHTML || '';
    // gerçekleşen (USD): 50 + 260 - 120 = 190
    assert.ok(html.includes('+₺190.00'), `raporda gerçekleşen +₺190.00 olmalı; gelen: ${html.slice(0, 400)}`);
    // gerçekleşmemiş: 800, toplam: 990
    assert.ok(html.includes('+₺800.00'), 'gerçekleşmemiş +₺800.00 olmalı');
    assert.ok(html.includes('+₺990.00'), 'toplam +₺990.00 olmalı');
});

test('Gelişmiş rapor toplam kâr/zararı sell kayıtlarını içerir', () => {
    evalInContext(context, 'updateAdvancedReports();');
    const el = elements.get('advancedProfitLoss');
    const text = typeof el?.innerHTML === 'string' && el.innerHTML ? el.innerHTML : (el?.textContent || '');
    assert.ok(text.includes('₺990.00'), `toplam kâr/zarar ₺990.00 olmalı; gelen: ${text}`);
    assert.ok(!text.includes('9999'), 'income profitLoss\'i (9999) sızmamalı');
});
