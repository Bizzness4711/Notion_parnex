import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts } from '../test-helpers/app-context.mjs';

// Merkezi para katmanı: kuruş hassasiyeti, girdi ayrıştırma ve doğrulama.
const context = loadAppScripts(['js/utils.js']);

const {
    currencyDecimals, isMoneyValue, isPositiveMoney,
    roundToDecimals, roundMoney, toMinor, fromMinor,
    addMoney, subMoney, sumMoney, mulMoney,
    roundPercent, percentOf, convertCurrency, investmentProfitLoss,
    parseAmount, formatMoney
} = context;

// ---- 0.1 + 0.2 sınıfı kayan nokta tuzağı ----

test('0.1 + 0.2 para hassasiyetinde tam olarak 0.3 (float 0.30000000000000004 değil)', () => {
    const result = addMoney(0.1, 0.2, 'TRY');
    assert.strictEqual(result, 0.3);
    assert.notStrictEqual(result, 0.1 + 0.2);
});

test('0.10 + 0.20 = 0.30', () => {
    assert.strictEqual(addMoney(0.10, 0.20, 'TRY'), 0.30);
});

test('10.25 - 3.10 = 7.15', () => {
    assert.strictEqual(subMoney(10.25, 3.10, 'TRY'), 7.15);
    assert.strictEqual(parseAmount('10.25') !== null, true);
});

// ---- Çok sayıda işlemin toplamı ----

test('300 × 0.1 toplamı tam 30 (ham art arda toplama 30.000000000000156 yapar)', () => {
    let naive = 0;
    for (let i = 0; i < 300; i++) naive += 0.1;
    assert.notStrictEqual(naive, 30);
    assert.strictEqual(sumMoney(new Array(300).fill(0.1), 'TRY'), 30);
    assert.strictEqual(sumMoney([1.1, 2.2], 'TRY'), 3.3);
    assert.notStrictEqual(1.1 + 2.2, 3.3); // ham toplama kayar, katman kaydırmaz
});

test('karışık tutar listesi toplamı kuruş hassasiyetinde birebir', () => {
    assert.strictEqual(sumMoney([19.99, 0.01, 4.99, 0.01], 'TRY'), 25);
    assert.strictEqual(sumMoney([10.1, 10.1, 10.1], 'TRY'), 30.3);
});

test('boş/null değerli liste toplamı 0 döner ve katlanmayı bozmaz', () => {
    assert.strictEqual(sumMoney([], 'TRY'), 0);
    assert.strictEqual(sumMoney([null, undefined, NaN, 5], 'TRY'), 5);
});

// ---- Negatif tutarlar ve sıfır ----

test('negatif toplama/çıkarma simetriktir: -0.1 + -0.2 = -0.3', () => {
    assert.strictEqual(addMoney(-0.1, -0.2, 'TRY'), -0.3);
});

test('sıfır işlemleri', () => {
    assert.strictEqual(addMoney(0, 0, 'TRY'), 0);
    assert.strictEqual(subMoney(0, 0, 'TRY'), 0);
    assert.strictEqual(subMoney(0, 0.01, 'TRY'), -0.01);
    assert.strictEqual(addMoney(100, 0, 'TRY'), 100);
});

// ---- Yuvarlama ve ondalık basamak sınırları ----

test('yarım değerler sıfırdan uzak yuvarlanır (± simetrik)', () => {
    assert.strictEqual(roundMoney(1.005, 'TRY'), 1.01);
    assert.strictEqual(roundMoney(-1.005, 'TRY'), -1.01);
    assert.strictEqual(roundMoney(1.004, 'TRY'), 1);
    assert.strictEqual(roundMoney(1.006, 'TRY'), 1.01);
});

test('TRY 2 basamakla sınırlıdır: 10.999 → 11.00', () => {
    assert.strictEqual(roundMoney(10.999, 'TRY'), 11);
    assert.strictEqual(roundMoney(10.994, 'TRY'), 10.99);
});

test('USD/EUR 2 basamak; GRAM_ALTIN 4 birim hassasiyeti kullanır', () => {
    assert.strictEqual(currencyDecimals('TRY'), 2);
    assert.strictEqual(currencyDecimals('USD'), 2);
    assert.strictEqual(currencyDecimals('EUR'), 2);
    assert.strictEqual(currencyDecimals('GRAM_ALTIN'), 4);
    assert.strictEqual(currencyDecimals('BILINMEYEN'), 2);
    assert.strictEqual(roundMoney(1.005, 'USD'), 1.01);
    assert.strictEqual(roundMoney(0.123456, 'GRAM_ALTIN'), 0.1235);
    assert.strictEqual(roundMoney(0.123456, 'TRY'), 0.12);
});

test('kuruş ara birimi dönüşümü birebir gider gelir', () => {
    assert.strictEqual(toMinor(10.25, 'TRY'), 1025);
    assert.strictEqual(fromMinor(1025, 'TRY'), 10.25);
    assert.strictEqual(toMinor(-0.01, 'TRY'), -1);
    assert.strictEqual(toMinor(0.5, 'GRAM_ALTIN'), 5000);
    assert.strictEqual(toMinor(NaN), 0);
    assert.strictEqual(toMinor(Infinity), 0);
    assert.strictEqual(fromMinor(NaN), 0);
});

test('çarpım para hassasiyetine yuvarlanır (miktar × kur)', () => {
    assert.strictEqual(mulMoney(4, 6660.39, 'TRY'), 26641.56);
    assert.strictEqual(mulMoney(0.1, 0.2, 'TRY'), 0.02);
    assert.strictEqual(mulMoney(NaN, 3, 'TRY'), 0);
    assert.strictEqual(mulMoney(1e9, 1e9, 'TRY'), 0); // sınır aşımı → 0
});

// ---- Geçersiz girdiler ve aşırı büyük değerler ----

test('parseAmount: geçersiz girdilerin tamamı null döner', () => {
    assert.strictEqual(parseAmount(null), null);
    assert.strictEqual(parseAmount(undefined), null);
    assert.strictEqual(parseAmount(''), null);
    assert.strictEqual(parseAmount('     '), null);
    assert.strictEqual(parseAmount('abc'), null);
    assert.strictEqual(parseAmount('12abc'), null);
    assert.strictEqual(parseAmount('NaN'), null);
    assert.strictEqual(parseAmount('Infinity'), null);
    assert.strictEqual(parseAmount('-Infinity'), null);
    assert.strictEqual(parseAmount(NaN), null);
    assert.strictEqual(parseAmount(Infinity), null);
    assert.strictEqual(parseAmount(-Infinity), null);
    assert.strictEqual(parseAmount({}), null);
    assert.strictEqual(parseAmount(true), null);
    assert.strictEqual(parseAmount([]), null);
    assert.strictEqual(parseAmount('1e300'), null); // MONEY_MAX sınırı
    assert.strictEqual(parseAmount(1e300), null);
});

test('parseAmount: sayısal girdi ve ondalık biçimler ayrıştırılır', () => {
    assert.strictEqual(parseAmount(42.5), 42.5);
    assert.strictEqual(parseAmount('1234.56'), 1234.56);
    assert.strictEqual(parseAmount('1234,56'), 1234.56);
    assert.strictEqual(parseAmount('1.234,56'), 1234.56);
    assert.strictEqual(parseAmount('1,234.56'), 1234.56);
    assert.strictEqual(parseAmount(' ₺1,000.50 '), 1000.5);
    assert.strictEqual(parseAmount('$250'), 250);
    assert.strictEqual(parseAmount('1.234'), 1.23); // tek nokta ondalıktır: 1.234 → 2 basamağa yuvarlanır
    assert.strictEqual(parseAmount('1.234', { currency: 'GRAM_ALTIN' }), 1.234); // 4 basamakta aynen korunur
    assert.strictEqual(parseAmount('1,234,567'), 1234567); // İngilizce binlik
    assert.strictEqual(parseAmount('1.234.567'), 1234567); // çoklu nokta binliktir
    assert.strictEqual(parseAmount('-50.25'), -50.25);
});

test('parseAmount: para birimi hassasiyetine yuvarlar ve limitleri uygular', () => {
    assert.strictEqual(parseAmount('0.001', { currency: 'TRY' }), 0);
    assert.strictEqual(parseAmount('10.999', { currency: 'TRY' }), 11);
    assert.strictEqual(parseAmount('0.123456', { currency: 'GRAM_ALTIN' }), 0.1235);
    assert.strictEqual(parseAmount('-5', { allowNegative: false }), null);
    assert.strictEqual(parseAmount('-5'), -5);
    assert.strictEqual(parseAmount('1000', { max: 999 }), null);
    assert.strictEqual(parseAmount('1000', { max: 1000 }), 1000);
});

test('isMoneyValue / isPositiveMoney doğrulayıcıları', () => {
    assert.strictEqual(isMoneyValue(10.5), true);
    assert.strictEqual(isMoneyValue(-3), true);
    assert.strictEqual(isMoneyValue(0), true);
    assert.strictEqual(isMoneyValue(NaN), false);
    assert.strictEqual(isMoneyValue(Infinity), false);
    assert.strictEqual(isMoneyValue(-Infinity), false);
    assert.strictEqual(isMoneyValue('10'), false);
    assert.strictEqual(isMoneyValue(1e13), false);
    assert.strictEqual(isPositiveMoney(0.01), true);
    assert.strictEqual(isPositiveMoney(0), false);
    assert.strictEqual(isPositiveMoney(-1), false);
    assert.strictEqual(isPositiveMoney(NaN), false);
});

// ---- Para birimleri arası ----

test('convertCurrency: TL <-> döviz, kur yoksa sabit, aynı para birimi sabit', () => {
    const rates = { USD: 42, EUR: 45 };
    assert.strictEqual(convertCurrency(100, 'USD', 'TRY', rates), 4200);
    assert.strictEqual(convertCurrency(4200, 'TRY', 'USD', rates), 100);
    assert.strictEqual(convertCurrency(100, 'USD', 'EUR', rates), 93.33);
    assert.strictEqual(convertCurrency(50, 'USD', 'USD', rates), 50);
    assert.strictEqual(convertCurrency(50, 'USD', 'TRY', {}), 50); // kur yok → sabit
    assert.strictEqual(convertCurrency(NaN, 'USD', 'TRY', rates), 0);
});

test('yüzde: 1/3 = 33.33, sıfıra bölme 0, yuvarlama iki basamak', () => {
    assert.strictEqual(percentOf(1, 3), 33.33);
    assert.strictEqual(percentOf(5, 0), 0);
    assert.strictEqual(percentOf(30, 300), 10);
    assert.strictEqual(roundPercent(99.999), 100);
    assert.strictEqual(roundPercent(NaN), 0);
});

// ---- Gelir, gider, transfer ve bakiye akışı ----

test('gelir/gider/bakiye: sıralı işlemler kuruş kaybı üretmez', () => {
    let balance = 1000.10;
    balance = addMoney(balance, 0.20, 'TRY');   // gelir
    balance = subMoney(balance, 0.30, 'TRY');   // gider
    assert.strictEqual(balance, 1000);
    const income = 0.1 + 0.2;                    // bilinçli olarak hatalı ham değer
    assert.strictEqual(addMoney(1000, 0, 'TRY') + roundMoney(income, 'TRY'), 1000.3);
});

test('transfer: para birimi korunur, çift kayıt birbirini tam götürür', () => {
    const src = 500.75;
    const dst = 250.25;
    const amount = 100.55;
    const nextSrc = subMoney(src, amount, 'TRY');
    const nextDst = addMoney(dst, amount, 'TRY');
    assert.strictEqual(nextSrc, 400.20);
    assert.strictEqual(nextDst, 350.80);
    assert.strictEqual(sumMoney([nextSrc, nextDst], 'TRY'), sumMoney([src, dst], 'TRY'));
});

test('çoklu para birimi transferinde her taraf kendi hassasiyetinde yuvarlanır', () => {
    const usdBalance = 12.34;
    const nextUsd = subMoney(usdBalance, 0.10, 'USD');
    assert.strictEqual(nextUsd, 12.24);
    const gram = 4.0005;
    const nextGram = addMoney(gram, 0.0005, 'GRAM_ALTIN');
    assert.strictEqual(nextGram, 4.001);
});

// ---- Yatırım alım/satış ve kâr/zarar ----

test('yatırım: alış maliyeti, satış hasılatı ve kâr/zarar kuruş hassasiyetinde', () => {
    const buyCost = mulMoney(4, 6660.39, 'TRY');
    assert.strictEqual(buyCost, 26641.56);
    const proceeds = mulMoney(0.5, 7000, 'TRY');
    assert.strictEqual(proceeds, 3500);
    assert.strictEqual(investmentProfitLoss(4, 6660.39, 6750.61), 360.88);
    assert.strictEqual(investmentProfitLoss(4, 6660.39, 6660.39), 0);
    assert.strictEqual(investmentProfitLoss(-2, 6660.39, 6600.39), 120); // satış sonrası kısa pozisyon
});

test('yatırım: kayan nokta ile kâr/zarar sıfıra yakın tutulur (0.1 benzeri fiyat)', () => {
    const pl = investmentProfitLoss(0.3, 10, 10);
    assert.strictEqual(pl, 0);
    assert.strictEqual(investmentProfitLoss(NaN, 10, 10), 0);
    assert.strictEqual(investmentProfitLoss(1, NaN, 10), 0);
});

test('alım-satım zinciri: bakiye ve miktar toplam sermaye kaybı üretmez', () => {
    let tl = 10000;
    let qty = 0;
    const buyPrice = 6660.39;
    tl = subMoney(tl, mulMoney(1, buyPrice, 'TRY'), 'TRY');
    qty = addMoney(qty, 1, 'GRAM_ALTIN');
    assert.strictEqual(tl, 3339.61);
    assert.strictEqual(qty, 1);
    tl = addMoney(tl, mulMoney(1, buyPrice, 'TRY'), 'TRY');
    qty = subMoney(qty, 1, 'GRAM_ALTIN');
    assert.strictEqual(tl, 10000);
    assert.strictEqual(qty, 0);
});

// ---- Biçimlendirme (yalnızca görüntüleme) ----

test('formatMoney: Türkçe para biçimi üretir, hesaplama sonucu değil görüntüdür', () => {
    assert.strictEqual(formatMoney(1234.5, 'TRY'), '₺1.234,50');
    assert.strictEqual(formatMoney(1234.5, 'USD'), new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(1234.5));
    assert.strictEqual(formatMoney(0.5, 'GRAM_ALTIN'), '🪙0.5');
    assert.strictEqual(formatMoney(NaN, 'TRY'), '₺0,00');
});

test('roundToDecimals: geçersiz değerlerde güvenli 0 döner', () => {
    assert.strictEqual(roundToDecimals(NaN, 2), 0);
    assert.strictEqual(roundToDecimals(Infinity, 2), 0);
    assert.strictEqual(roundToDecimals(1.234, 0), 1);
});
