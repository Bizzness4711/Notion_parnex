import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, evalInContext } from './helpers/app-context.mjs';

// Tekrarlayan işlem tarihleri ve kategori listesi yardımcıları.
const context = loadAppScripts([
    'js/utils.js',
    'js/firebase-config.js',
    'js/categories.js'
]);

const { getNextRecurringDate, getCategories } = context;

// ---- Tekrarlayan işlem sonraki tarihi ----

test('aylık tekrarlayan işlem bir sonraki ayın aynı gününe atlar', () => {
    assert.equal(getNextRecurringDate('2026-01-15', 'monthly'), '2026-02-15');
    assert.equal(getNextRecurringDate('2026-11-15', 'monthly'), '2026-12-15');
});

test('yıllık tekrarlayan işlem bir yıl ileri gider', () => {
    assert.equal(getNextRecurringDate('2026-03-09', 'yearly'), '2027-03-09');
});

test('haftalık tekrarlayan işlem 7 gün ileri gider', () => {
    assert.equal(getNextRecurringDate('2026-01-15', 'weekly'), '2026-01-22');
    assert.equal(getNextRecurringDate('2026-12-28', 'weekly'), '2027-01-04');
});

test('bilinmeyen sıklık aylık gibi davranır', () => {
    assert.equal(getNextRecurringDate('2026-01-15', 'bilinmiyor'), '2026-02-15');
    assert.equal(getNextRecurringDate('2026-01-15', undefined), '2026-02-15');
});

// NOT: 31 Ocak gibi ay sonu taşan günler için setMonth davranışı (1 Şubat 31 ->
// 3 Mart) bugün uygulamanın mevcut davranışıdır; bu test bilinçli olarak o
// kenar durumu kilitlemez, aksine raporlanması gereken bir sınırlılıktır.

// ---- Kategori listesi ----

test('varsayılan gider kategorileri listelenir', () => {
    const categories = getCategories('expense');
    assert.ok(categories.length > 0);
    assert.ok(categories.includes('🍔 Yemek'));
    assert.ok(categories.includes('🏠 Kira'));
});

test('gelir ve gider kategorileri ayrıdır', () => {
    assert.ok(getCategories('income').includes('💰 Maaş'));
    assert.ok(!getCategories('income').includes('🍔 Yemek'));
});

test('satış (sell) türü gelir kategorilerini kullanır', () => {
    assert.ok(getCategories('sell').includes('💰 Maaş'));
});

test('kullanıcı kategorileri varsayılanların sonuna eklenir', () => {
    evalInContext(context, `
        customCategories = [
            { id: 'c1', name: 'Market', type: 'expense' },
            { id: 'c2', name: 'Kurs Ücreti', type: 'expense' }
        ];
    `);
    const categories = getCategories('expense');
    assert.ok(categories.includes('Kurs Ücreti'));
    assert.ok(categories.indexOf('Kurs Ücreti') > categories.indexOf('🏠 Kira'));
});

test('aynı kategori (büyük/küçük harf duyarsız) yalnızca bir kez listelenir', () => {
    evalInContext(context, `
        customCategories = [
            { id: 'c1', name: 'market', type: 'expense' },
            { id: 'c2', name: '  Market  ', type: 'expense' }
        ];
    `);
    const categories = getCategories('expense');
    const count = categories.filter(name => name.toLocaleLowerCase('tr-TR') === 'market').length;
    assert.equal(count, 1);
});

test('boş/geçersiz kullanıcı kategorisi listeye girmez', () => {
    evalInContext(context, `
        customCategories = [
            { id: 'c1', name: '', type: 'expense' },
            { id: 'c2', name: null, type: 'expense' }
        ];
    `);
    const categories = getCategories('expense');
    assert.ok(!categories.includes(''));
    assert.ok(!categories.includes('null'));
});
