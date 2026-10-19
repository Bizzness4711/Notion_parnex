function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function formatLocalDate(date = new Date()) {
    const value = date instanceof Date ? date : new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Merkezi gizlilik yardımcıları ---
// isHidden global'ine bağımlı; TDZ'de typeof ReferenceError fırlatır, o yüzden try-catch.

const PRIVACY_MASK = '••••••';
const PRIVACY_SYMBOLS = { TRY: '₺', USD: '$', EUR: '€', GRAM_ALTIN: '🪙', CEYREK_ALTIN: '🪙', YARIM_ALTIN: '🪙', TAM_ALTIN: '🪙' };

function isPrivacyActive() {
    try { return typeof isHidden !== 'undefined' && Boolean(isHidden); }
    catch (e) { return false; }
}

function privacyAmount(currency = 'TRY') {
    const symbol = PRIVACY_SYMBOLS[currency] || '₺';
    return `${symbol}${PRIVACY_MASK}`;
}

function privacySignedAmount(sign, currency = 'TRY') {
    return `${sign}${privacyAmount(currency)}`;
}

function privacyPercent() {
    return `%${PRIVACY_MASK}`;
}

// Gizliyken formatter'ı hiç çağırmaz; görünürken formatter çıktısını döner.
function privacyFormat(visibleFormatter) {
    if (isPrivacyActive()) return privacyAmount();
    return visibleFormatter();
}

// Saklanmış/serbest metinlerde gömülü tutar ve yüzde maskelerini uygular.
function privacyScrubText(text) {
    if (!isPrivacyActive()) return String(text ?? '');
    return String(text ?? '')
        .replace(/([₺$€🪙])\s?-?\d[\d.,\d]*/g, '$1' + PRIVACY_MASK)
        .replace(/%\d+(?:[.,]\d+)?/g, '%' + PRIVACY_MASK);
}

// Gizliyken aria-label='Gizli'; görünürken temizler.
function privacySyncAria(el) {
    if (!el) return;
    if (isPrivacyActive()) el.setAttribute('aria-label', 'Gizli');
    else el.removeAttribute('aria-label');
}

// privacyScrubText testlerinde aktif/pasif anahtarını kontrol eder; uygulamada doğrudan isHidden kullanılır.

// --- Merkezi para hesaplama katmanı ---
// Kurallar:
// 1) Hesaplama burada yapılır; biçimlendirme (toFixed/Intl) ayrıdır ve hesap sonucuna asla girmez.
// 2) Depolama biçimi DEĞİŞMEZ: Firestore'da tutarlar ondalık sayı olarak kalır (veri sözleşmesi doğrulandı;
//    string tutar veya kuruş tabanlı alan yok → migration gerekmez). Hassasiyet işlem sınırında korunur.
// 3) Toplama/çıkarma tam sayı ara birimde (kuruş/cent) yürür → 0.1 + 0.2 = 0.3.
// 4) NaN, ±Infinity, boş ve aşırı büyük değerler reddedilir.

const MONEY_MAX = 1e12; // Kullanıcı tutarı için mutlak sınır (±1 trilyon)
const CURRENCY_DECIMALS = {
    TRY: 2, USD: 2, EUR: 2, GBP: 2,
    GRAM_ALTIN: 4, CEYREK_ALTIN: 4, YARIM_ALTIN: 4, TAM_ALTIN: 4
};

// Para birimleri 2 ondalık (kuruş/cent); emtia miktarları (gram vb.) 4 birim hassasiyeti.
// Tanımsız para birimleri güvenli biçimde 2 varsayılır (eski davranışa en yakın).
function currencyDecimals(currency) {
    return Object.prototype.hasOwnProperty.call(CURRENCY_DECIMALS, currency) ? CURRENCY_DECIMALS[currency] : 2;
}

function isMoneyValue(value) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MONEY_MAX;
}

function isPositiveMoney(value) {
    return isMoneyValue(value) && value > 0;
}

// Yuvarlama: mutlak değere göre, yarı değerlerde sıfırdan uzak (± simetrik).
// Epsilon, IEEE754 ondalık temsil kaynaklı 0.1*100=10.000000000000002 gibi sapmaları temizler.
function roundToDecimals(value, decimals) {
    if (!Number.isFinite(value)) return 0;
    const scale = 10 ** decimals;
    const sign = value < 0 ? -1 : 1;
    return (Math.round(Math.abs(value) * scale + 1e-9) * sign) / scale;
}

function roundMoney(value, currency = 'TRY') {
    return roundToDecimals(value, currencyDecimals(currency));
}

// Tam sayı ara birim: örn. TRY için kuruş.
function toMinor(value, currency = 'TRY') {
    if (!Number.isFinite(value)) return 0;
    const scale = 10 ** currencyDecimals(currency);
    const sign = value < 0 ? -1 : 1;
    return Math.round(Math.abs(value) * scale + 1e-9) * sign;
}

function fromMinor(minor, currency = 'TRY') {
    if (!Number.isFinite(minor)) return 0;
    return minor / 10 ** currencyDecimals(currency);
}

function addMoney(a, b, currency = 'TRY') {
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    return fromMinor(toMinor(a, currency) + toMinor(b, currency), currency);
}

function subMoney(a, b, currency = 'TRY') {
    if (!Number.isFinite(a)) a = 0;
    if (!Number.isFinite(b)) b = 0;
    return fromMinor(toMinor(a, currency) - toMinor(b, currency), currency);
}

function sumMoney(values, currency = 'TRY') {
    let minor = 0;
    if (values && typeof values[Symbol.iterator] === 'function') {
        for (const value of values) minor += toMinor(value, currency);
    }
    return fromMinor(minor, currency);
}

// Çarpım (birim × kur gibi): sonuç para hassasiyetine yuvarlanır.
function mulMoney(a, b, currency = 'TRY') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (Math.abs(a * b) > MONEY_MAX) return 0;
    return fromMinor(toMinor(a * b, currency), currency);
}

// Yüzde: yuvarlama yalnızca sonucun kendisinde.
function roundPercent(value, decimals = 2) {
    return roundToDecimals(value, decimals);
}

function percentOf(part, total) {
    if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return 0;
    return roundPercent((part / total) * 100);
}

// Kur dönüşümü: önce TL'ye, sonra hedefe. Kur <= 0 veya yoksa tutar aynen kalır
// (mevcut getAccountValueTL davranışıyla uyumlu).
function convertCurrency(value, fromCurrency, toCurrency, rates = {}) {
    if (!Number.isFinite(value)) return 0;
    if (fromCurrency === toCurrency) return value;
    const asTL = () => {
        if (fromCurrency === 'TRY') return value;
        const rate = Number(rates[fromCurrency]);
        return rate > 0 ? value * rate : value;
    };
    const tl = asTL();
    if (toCurrency === 'TRY') return roundMoney(tl, 'TRY');
    const rate = Number(rates[toCurrency]);
    return roundMoney(rate > 0 ? tl / rate : tl, toCurrency);
}

// Yatırım kâr/zararı (TL): (güncel değer − maliyet), kuruş hassasiyetine yuvarlanır.
function investmentProfitLoss(quantity, buyPrice, currentPrice) {
    if (!Number.isFinite(quantity) || !Number.isFinite(buyPrice) || !Number.isFinite(currentPrice)) return 0;
    return roundMoney(quantity * currentPrice - quantity * buyPrice, 'TRY');
}

// Kontrollü girdi ayrıştırma. Desteklenen biçimler (Türkçe girdi kuralları):
//   "1.234,56" / "1,234.56" (son ayrac ondalık) · "1234.56" · "1234,56" (virgül ondalık)
//   "1.234.567" / "1,234,567" (çoklu ayraç = binlik) · tek nokta HER ZAMAN ondalıktır
//   semboller (₺$€) ve boşluklar atılır; sayısal girdi (type=number) doğrudan kabul edilir.
// Reddedilen: null/undefined/nesne, boş metin, sayısal olmayan metin, ±Infinity,
//   sınırı aşan tutar (max, varsayılan MONEY_MAX) ve allowNegative=false iken negatif.
// Sonuç: para birimi hassasiyetine yuvarlanmış sayı; geçersizse null.
function parseAmount(raw, options = {}) {
    const currency = options.currency || 'TRY';
    const allowNegative = options.allowNegative !== false;
    const max = Number.isFinite(options.max) ? options.max : MONEY_MAX;
    let text;
    if (typeof raw === 'number') {
        text = String(raw);
    } else if (typeof raw === 'string') {
        text = raw.trim().replace(/\s/g, '').replace(/[₺$€]/g, '');
    } else {
        return null;
    }
    if (!text) return null;
    if (text.includes(',') && text.includes('.')) {
        const decimalSep = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
        const groupingSep = decimalSep === ',' ? '.' : ',';
        text = text.split(groupingSep).join('').replace(decimalSep, '.');
    } else if ((text.match(/,/g) || []).length > 1) {
        text = text.replace(/,/g, '');        // "1,234,567" binlik virgülleri (ondalık olamaz)
    } else if (text.includes(',')) {
        text = text.replace(',', '.');        // "1234,56" → ondalık virgül (Türkçe kuralı)
    } else if ((text.match(/\./g) || []).length > 1) {
        text = text.replace(/\./g, '');       // "1.234.567" binlik noktaları; TEK nokta her zaman ondalıktır
    }
    const value = Number(text);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) > max) return null;
    if (!allowNegative && value < 0) return null;
    return roundMoney(value, currency);
}

// Yalnızca GÖRÜNTÜLEME. Hesaplama sonuçlarının girdisi olarak kullanılmaz.
function formatMoney(value, currency = 'TRY', locale = 'tr-TR') {
    const amount = Number.isFinite(value) ? roundMoney(value, currency) : 0;
    if (currency === 'TRY' || currency === 'USD' || currency === 'EUR' || currency === 'GBP') {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    }
    const symbol = PRIVACY_SYMBOLS[currency] || '';
    return `${symbol}${amount}`;
}

