import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts, APP_SCRIPTS, evalInContext } from '../test-helpers/app-context.mjs';

// Transfer görünürlüğü: ay filtresi, tarih normalizasyonu ve güncel hesap adı.
const context = loadAppScripts(APP_SCRIPTS);

const elements = new Map();
const makeEl = (value = '') => ({ value, textContent: '', innerHTML: '' });
evalInContext(context, 'document').getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, makeEl());
    return elements.get(id);
};
evalInContext(context, 'isHidden = false; currentMonth = "2026-10";');

test('transferMonthKey ISO ve DD.MM.YYYY tarihlerini ay anahtarına çevirir', () => {
    assert.equal(evalInContext(context, `transferMonthKey('2026-09-15')`), '2026-09');
    assert.equal(evalInContext(context, `transferMonthKey('2026-10')`), '2026-10');
    assert.equal(evalInContext(context, `transferMonthKey('15.09.2026')`), '2026-09');
    assert.equal(evalInContext(context, `transferMonthKey('')`), '');
    assert.equal(evalInContext(context, `transferMonthKey(undefined)`), '');
    assert.equal(evalInContext(context, `transferMonthKey('geçersiz')`), '');
});

test('resolveAccountName güncel adı kullanır, eski adı fallback yapar', () => {
    evalInContext(context, `accounts = [{ id: 'a1', name: 'Kasa Cüzdanı' }]`);
    assert.equal(evalInContext(context, `resolveAccountName('a1', 'Eski Ad')`), 'Kasa Cüzdanı');
    assert.equal(evalInContext(context, `resolveAccountName('yok', 'Kayıt İçi Ad')`), 'Kayıt İçi Ad');
    assert.equal(evalInContext(context, `resolveAccountName('yok', '')`), 'Bilinmeyen hesap');
});

function renderMonth(month) {
    elements.clear();
    evalInContext(context, `document.getElementById('transferFilterMonth').value = ${JSON.stringify(month)}; updateMonthlyTransfersUI();`);
    return elements.get('monthlyTransfersList').innerHTML;
}

test('Transferler: tarihsiz transfer her ayda görünür, tarihliler yalnız kendi ayında', () => {
    evalInContext(context, `accounts = [
        { id: 'a1', name: 'Kasa Cüzdanı' },
        { id: 'a2', name: 'Ahmet Bey - Borç' }
    ];
    transfers = [
        { id: 't1', fromAccountId: 'a1', fromAccountName: 'Eski Ad', toAccountId: 'a2', toAccountName: 'Ahmet Bey - Borç', amount: 1500, description: 'Eski borç devri', date: '2026-03-15' },
        { id: 't2', fromAccountId: 'a1', fromAccountName: 'Kasa', toAccountId: 'a2', toAccountName: 'Ahmet Bey - Borç', amount: 250, description: 'Tarihsiz taşıma', date: '' },
        { id: 't3', fromAccountId: 'a1', fromAccountName: 'Kasa', toAccountId: 'a2', toAccountName: 'Ahmet Bey - Borç', amount: 300, description: 'Nokta tarihli', date: '15.07.2026' }
    ]`);

    const october = renderMonth('2026-10');
    assert.ok(october.includes('Tarihsiz taşıma'), 'tarihsiz transfer geçerli ayda görünmeli');
    assert.ok(!october.includes('Eski borç devri'), 'Mart transferi Ekim listesinde görünmemeli');
    assert.ok(!october.includes('Nokta tarihli'), 'Temmuz (nokta tarihli) transferi Ekim listesinde görünmemeli');
    assert.ok(october.includes('Kasa Cüzdanı'), 'güncel hesap adı görünmeli');
    assert.ok(!october.includes('Eski Ad'), 'kayıttaki eski hesap adı görünmemeli');

    const july = renderMonth('2026-07');
    assert.ok(july.includes('Nokta tarihli'), 'DD.MM.YYYY tarihi kendi ayında görünmeli');

    const march = renderMonth('2026-03');
    assert.ok(march.includes('Eski borç devri'), 'Mart transferi Mart listesinde görünmeli');
    assert.ok(march.includes('Tarihsiz taşıma'), 'tarihsiz transfer her ayda görünür kalmalı');
});
