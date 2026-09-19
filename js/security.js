const SECURITY_PIN_ITERATIONS = 120000;

function securityStorageKey(suffix) {
    return currentUser ? `security-${suffix}-${currentUser.uid}` : null;
}

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}

async function hashSecurityPin(pin, saltHex = null) {
    const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: SECURITY_PIN_ITERATIONS, hash: 'SHA-256' },
        key,
        256
    );
    return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}

async function verifySecurityPin(pin, storedValue) {
    if (!storedValue) return false;
    // Eski SHA-256 kayıtlarıyla uyumluluk; başarılı doğrulamada yeni formata geçilir.
    if (!storedValue.includes(':')) {
        const legacy = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
        return bytesToHex(new Uint8Array(legacy)) === storedValue;
    }
    const [saltHex, expectedHash] = storedValue.split(':');
    if (!saltHex || !expectedHash) return false;
    return (await hashSecurityPin(pin, saltHex)).split(':')[1] === expectedHash;
}

function hasSecurityPin() {
    return Boolean(securityStorageKey('pin') && localStorage.getItem(securityStorageKey('pin')));
}

function isSecurityAppLocked() {
    return Boolean(securityStorageKey('locked') && localStorage.getItem(securityStorageKey('locked')) === 'true');
}

function getSecurityTimeoutMinutes() {
    const value = Number(localStorage.getItem(securityStorageKey('timeout') || '') || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function scheduleSecurityLock() {
    if (securityTimeoutId) clearTimeout(securityTimeoutId);
    if (!currentUser || securityLocked || !hasSecurityPin()) return;
    const minutes = getSecurityTimeoutMinutes();
    if (minutes > 0) securityTimeoutId = setTimeout(lockSecurityApp, minutes * 60 * 1000);
}

function lockSecurityApp() {
    if (!hasSecurityPin() || securityLocked) return;
    securityLocked = true;
    localStorage.setItem(securityStorageKey('locked'), 'true');
    const lock = document.getElementById('securityLock');
    if (lock) lock.hidden = false;
    const pin = document.getElementById('unlockPin');
    if (pin) { pin.value = ''; pin.focus(); }
    if (securityTimeoutId) clearTimeout(securityTimeoutId);
}

function unlockSecurityApp() {
    securityLocked = false;
    localStorage.removeItem(securityStorageKey('locked'));
    const lock = document.getElementById('securityLock');
    if (lock) lock.hidden = true;
    const error = document.getElementById('unlockError');
    if (error) error.textContent = '';
    scheduleSecurityLock();
}

async function configureSecurityUI() {
    const timeout = document.getElementById('securityTimeout');
    if (timeout) timeout.value = String(getSecurityTimeoutMinutes());
    if (!securityActivityBound) {
        ['click', 'keydown', 'pointermove', 'touchstart'].forEach(eventName => {
            document.addEventListener(eventName, () => {
                if (!securityLocked) scheduleSecurityLock();
            }, { passive: true });
        });
        securityActivityBound = true;
    }
    if (isSecurityAppLocked()) {
        securityLocked = false;
        lockSecurityApp();
    } else {
        scheduleSecurityLock();
    }
}

