import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from '../test-helpers/app-context.mjs';

// Para matematiği: kredi kartı, taksit, yatırım ve TL değerlendirme hesapları.
const context = loadAppScripts([
    'js/utils.js',
    'js/firebase-config.js',
    'js/rates.js',
    'js/categories.js',
    'js/accounts.js'
]);

const {
    getCreditCardMetrics,
    getInstallmentMonthDifference,
    calendarDateAddMonths,
    isInvestmentAccount,
    getInvestmentMetrics,
    getAccountValueTL,
    getTransactionValueTL
} = context;

// ---- Kredi kartı metrikleri ----

test('kredi kartı: limit, borç, kullanılabilir ve asgari ödeme doğru hesaplanır', () => {
    // vm bağlamından geldiği için nesne kimliği değil alanları karşılaştırıyoruz.
    const metrics = getCreditCardMetrics({ creditLimit: 10000, balance: -3000, minimumPaymentRate: 20 });
    assert.equal(metrics.limit, 10000);
    assert.equal(metrics.debt, 3000);
    assert.equal(metrics.available, 7000);
    assert.equal(metrics.minimum, 600);
});

test('kredi kartı: minimumPaymentRate yoksa varsayılan %20 kullanılır', () => {
    const metrics = getCreditCardMetrics({ creditLimit: 1000, balance: -100 });
    assert.equal(metrics.minimum, 20);
});

test('kredi kartı: negatif limit ve borç negatiflere sıkıştırılır', () => {
    const metrics = getCreditCardMetrics({ creditLimit: -500, balance: 250 });
    assert.equal(metrics.limit, 0);
    assert.equal(metrics.debt, 250); // mutlak değer
    assert.equal(metrics.available, 0);
    assert.equal(metrics.minimum, 250 * 0.2);
});

test('kredi kartı: borç limiti aşınca kullanılabilir 0 kalır', () => {
    const metrics = getCreditCardMetrics({ creditLimit: 500, balance: -900 });
    assert.equal(metrics.available, 0);
});

// ---- Taksit ay farkı ----

test('taksit ay farkı: aynı ay 0, ilerleyen aylar pozitif', () => {
    assert.equal(getInstallmentMonthDifference('2026-01-15', '2026-01'), 0);
    assert.equal(getInstallmentMonthDifference('2026-01-15', '2026-04'), 3);
    assert.equal(getInstallmentMonthDifference('2026-12-31', '2027-01'), 1);
});

test('taksit ay farkı: yıl atlaması doğru toplanır', () => {
    assert.equal(getInstallmentMonthDifference('2026-01-15', '2027-01'), 12);
});

test('taksit ay farkı: geçersiz tarih null döndürür', () => {
    assert.equal(getInstallmentMonthDifference('not-a-date', '2026-01'), null);
    assert.equal(getInstallmentMonthDifference('2026-01-15', 'geçersiz'), null);
});

// ---- Takvim tarihi + ay ----

test('ay sonu kısa olan aylarda gün kısılır (31 Ocak + 1 ay → 28 Şubat)', () => {
    assert.equal(calendarDateAddMonths('2026-01-31', 1), '2026-02-28');
});

test('ay ekleme: normal ve 12 aylık adım', () => {
    assert.equal(calendarDateAddMonths('2026-01-15', 1), '2026-02-15');
    assert.equal(calendarDateAddMonths('2026-01-15', 12), '2027-01-15');
    assert.equal(calendarDateAddMonths('2026-01-15', 0), '2026-01-15');
});

test('ay ekleme: geçersiz tarih boş döndürür', () => {
    assert.equal(calendarDateAddMonths('geçersiz', 1), '');
});

// ---- Yatırım hesabı tespiti ----

test('yatırım hesabı: USD/EUR/altın kabul, TRY ve boş değer reddedilir', () => {
    assert.equal(isInvestmentAccount({ currency: 'USD' }), true);
    assert.equal(isInvestmentAccount({ currency: 'EUR' }), true);
    assert.equal(isInvestmentAccount({ currency: 'GRAM_ALTIN' }), true);
    assert.equal(isInvestmentAccount({ currency: 'CEYREK_ALTIN' }), true);
    assert.equal(isInvestmentAccount({ currency: 'TRY' }), false);
    assert.equal(isInvestmentAccount(null), false);
    assert.equal(isInvestmentAccount(undefined), false);
});

// ---- Yatırım kâr/zarar ----

test('yatırım metriği: maliyet, güncel değer ve kâr-zarar', () => {
    evalInContext(context, 'exchangeRates.USD = 40');
    const metrics = getInvestmentMetrics({ currency: 'USD', balance: 10, openingRate: 38 });
    assert.equal(metrics.quantity, 10);
    assert.equal(metrics.buyPrice, 38);
    assert.equal(metrics.currentPrice, 40);
    assert.equal(metrics.cost, 380);
    assert.equal(metrics.currentValue, 400);
    assert.equal(metrics.profitLoss, 20);
});

test('yatırım metriği: kur değişmediyse kâr-zarar sıfır', () => {
    evalInContext(context, 'exchangeRates.EUR = 45');
    const metrics = getInvestmentMetrics({ currency: 'EUR', quantity: 5, openingRate: 45 });
    assert.equal(metrics.profitLoss, 0);
});

// ---- Hesap TL değeri ----

test('TRY hesabın TL değeri bakiyenin kendisidir', () => {
    assert.equal(getAccountValueTL({ currency: 'TRY', balance: 250.5 }), 250.5);
});

test('döviz hesabı güncel kur ile TL\'ye çevrilir', () => {
    evalInContext(context, 'exchangeRates.USD = 40');
    assert.equal(getAccountValueTL({ currency: 'USD', balance: 2 }), 80);
});

test('kur 0 iken döviz hesabı 0 döner (uygulama mevcut davranışı: rate > 0 şartı)', () => {
    // getAccountValueTL sadece rate > 0 iken çarpım döner; rate 0 ise 0 döner.
    evalInContext(context, 'exchangeRates.GRAM_ALTIN = 0');
    assert.equal(getAccountValueTL({ currency: 'GRAM_ALTIN', balance: 3 }), 0);
});

// ---- İşlem TL değeri ----

test('TRY işlemi işlem kuruna ihtiyaç duymaz', () => {
    evalInContext(context, `
        accounts = [{ id: 'a1', currency: 'TRY' }];
        transactions = [];
    `);
    const value = evalInContext(context, `getTransactionValueTL({ accountId: 'a1', amount: 120, type: 'expense' })`);
    assert.equal(value, 120);
});

test('yatırım işlemi işlem kuru ile çarpılır', () => {
    evalInContext(context, `
        accounts = [{ id: 'a2', currency: 'USD' }];
        exchangeRates.USD = 40;
    `);
    const value = evalInContext(context, `getTransactionValueTL({ accountId: 'a2', amount: 3, transactionRate: 41 })`);
    assert.equal(value, 123);
});

test('yatırım işlemi: işlemde accountCurrency yoksa hesabın açılış kuru kullanılır', () => {
    // transactionRate yok, transaction.accountCurrency yok → exchangeRates[undefined]
    // tanımsız → getAccountOpeningRate (38) devreye girer; 2×38=76.
    // NOT: accountCurrency alanını işlemde iletmeyi atlasaydık bile ilerleme kuralları aynı.
    evalInContext(context, `
        accounts = [{ id: 'a3', currency: 'USD', openingRate: 38 }];
        exchangeRates.USD = 40;
    `);
    const value = evalInContext(context, `getTransactionValueTL({ accountId: 'a3', amount: 2 })`);
    assert.equal(value, 76);
});

test('yatırım işlemi: accountCurrency işlemde verildiyse güncel kur kullanılır', () => {
    // transactionRate yok, transaction.accountCurrency='USD' → exchangeRates.USD=40; 2×40=80.
    evalInContext(context, `
        accounts = [{ id: 'a3b', currency: 'USD', openingRate: 38 }];
        exchangeRates.USD = 40;
    `);
    const value = evalInContext(context, `getTransactionValueTL({ accountId: 'a3b', amount: 2, accountCurrency: 'USD' })`);
    assert.equal(value, 80);
});

test('yatırım işlemi: exchangeRates sıfırsa hesabın açılış kuru kullanılır', () => {
    // transactionRate yok, exchangeRates.USD = 0 → getAccountOpeningRate (38) devreye girer; 2×38=76.
    evalInContext(context, `
        accounts = [{ id: 'a4', currency: 'USD', openingRate: 38 }];
        exchangeRates.USD = 0;
    `);
    const value = evalInContext(context, `getTransactionValueTL({ accountId: 'a4', amount: 2 })`);
    assert.equal(value, 76);
});
