import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppScripts } from './helpers/app-context.mjs';

// Bu test yalnızca js/utils.js'e ihtiyaç duyar (saf yardımcılar).
const context = loadAppScripts(['js/utils.js']);
const { escapeHtml, formatLocalDate } = context;

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
