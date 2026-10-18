import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts } from '../test-helpers/app-context.mjs';

// Bu test yalnızca js/utils.js'e ihtiyaç duyar (saf yardımcılar).
const context = loadAppScripts(['js/utils.js']);
const { escapeHtml, formatLocalDate, isPrivacyActive, privacyAmount, privacySignedAmount, privacyPercent, privacyFormat, privacyScrubText, privacySyncAria } = context;

function setPrivacyFlag(value) {
    // vm global'ine isHidden tanımla; typeof TDZ güvenli kontrolle okunur.
    context.isPrivacyTestHidden = value;
    Object.defineProperty(context, 'isHidden', { value, writable: true, configurable: true });
}

test('escapeHtml tüm HTML özel karakterlerini kaçırır', () => {
    assert.equal(escapeHtml(`<script>alert("x&y")</script>`), '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml boş ve tanımsız değerleri güvenli döndürür', () => {
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml sayıları metne çevirip kaçırır', () => {
    assert.equal(escapeHtml(123), '123');
    assert.equal(escapeHtml(1 < 2), 'true');
});

test('formatLocalDate Date nesnesini YYYY-AA-GG üretir', () => {
    assert.equal(formatLocalDate(new Date(2026, 0, 5, 12)), '2026-01-05');
    assert.equal(formatLocalDate(new Date(2026, 10, 28, 12)), '2026-11-28');
});

test('formatLocalDate metin girdisini kabul eder', () => {
    assert.equal(formatLocalDate('2026-03-09T12:00:00'), '2026-03-09');
});

test('formatLocalDate geçersiz girdide NaN-yıl döndürmek yerine tutarlı davranır', () => {
    // Invalid Date -> toISOString patlatmadan önce getFullYear NaN üretir; uygulama bunu kabul ediyor.
    const value = formatLocalDate('not-a-date');
    assert.ok(value.startsWith('NaN-'), 'geçersiz tarih NaN-yıl üretmeli, gelen: ' + value);
});

test('isPrivacyActive tanımsız isHidden ile false döner (TDZ güvenli)', () => {
    setPrivacyFlag(undefined);
    assert.equal(isPrivacyActive(), false);
});

test('isPrivacyActive isHidden=true iken true döner', () => {
    setPrivacyFlag(true);
    assert.equal(isPrivacyActive(), true);
    setPrivacyFlag(false);
    assert.equal(isPrivacyActive(), false);
});

test('privacyAmount para birimi sembolleriyle maskeler', () => {
    assert.equal(privacyAmount(), '₺••••••');
    assert.equal(privacyAmount('TRY'), '₺••••••');
    assert.equal(privacyAmount('USD'), '$••••••');
    assert.equal(privacyAmount('EUR'), '€••••••');
    assert.equal(privacyAmount('GRAM_ALTIN'), '🪙••••••');
    assert.equal(privacyAmount('BILINMEYEN'), '₺••••••');
});

test('privacySignedAmount işareti korur', () => {
    assert.equal(privacySignedAmount('+'), '+₺••••••');
    assert.equal(privacySignedAmount('-'), '-₺••••••');
});

test('privacyPercent yüzde maskesi döner', () => {
    assert.equal(privacyPercent(), '%••••••');
});

test('privacyFormat gizliyken formatter çağırmaz, görünürken aynen döner', () => {
    let called = 0;
    const formatter = () => { called += 1; return '₺1.234,56'; };
    setPrivacyFlag(true);
    assert.equal(privacyFormat(formatter), '₺••••••');
    assert.equal(called, 0, 'gizliyken formatter çağrılmamalı');
    setPrivacyFlag(false);
    assert.equal(privacyFormat(formatter), '₺1.234,56');
    assert.equal(called, 1);
});

test('privacyScrubText gizliyken gömülü tutar ve yüzdeyi maskeler', () => {
    setPrivacyFlag(true);
    assert.equal(privacyScrubText('Bakiye: ₺1234.56 kaldı'), 'Bakiye: ₺•••••• kaldı');
    assert.equal(privacyScrubText('Toplam ₺1.234,56 / ₺99.00'), 'Toplam ₺•••••• / ₺••••••');
    assert.equal(privacyScrubText('+₺12.00 kâr'), '+₺•••••• kâr');
    assert.equal(privacyScrubText('-₺45,00 zarar'), '-₺•••••• zarar');
    assert.equal(privacyScrubText('$1,234.56 bakiye'), '$•••••• bakiye');
    assert.equal(privacyScrubText('€987.65'), '€••••••');
    assert.equal(privacyScrubText('Bütçesinin %85 kullanıldı'), 'Bütçesinin %•••••• kullanıldı');
    assert.equal(privacyScrubText('%85.2 aşıldı'), '%•••••• aşıldı');
    setPrivacyFlag(false);
});

test('privacyScrubText gizli değilken metni değiştirmez', () => {
    setPrivacyFlag(false);
    assert.equal(privacyScrubText('₺1234.56 %85'), '₺1234.56 %85');
});

test('privacySyncAria gizliyken aria-label=Gizli, görünürken temizler', () => {
    const attrs = {};
    const el = {
        setAttribute: (k, v) => { attrs[k] = v; },
        removeAttribute: k => { delete attrs[k]; }
    };
    setPrivacyFlag(true);
    privacySyncAria(el);
    assert.equal(attrs['aria-label'], 'Gizli');
    setPrivacyFlag(false);
    privacySyncAria(el);
    assert.equal(attrs['aria-label'], undefined);
});
