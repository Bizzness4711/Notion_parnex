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

