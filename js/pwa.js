// PWA katmani: service worker kaydi, ana ekrana kurulum, guncelleme akisi,
// cevrimdisi bildirimi. Capacitor (native APK) modunda sessizce devre disi kalir;
// native zaten ana ekranda durur ve ek bir cache katmani gereksinir.
(function () {
    'use strict';

    const SW_URL = 'sw.js';
    const INSTALL_DISMISSED = 'pwa-install-dismissed';

    let deferredPrompt = null;
    let registration = null;

    function isNativeApp() {
        return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.matchMedia('(display-mode: window-controls-overlay)').matches
            || window.navigator.standalone === true;
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(window.navigator.userAgent)
            // iPadOS 13+ kendini Mac gibi tanitir; dokunmatik ayrimi gerekir.
            || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    }

    // iOS'ta beforeinstallprompt gelmez; kurulum yolu Paylas > Ana Ekrana Ekle.
    function needsIOSInstructions() {
        return isIOS() && !isStandalone();
    }

    async function registerServiceWorker() {
        if (isNativeApp()) return;
        if (!('serviceWorker' in navigator)) return;
        // Service worker yalnizca guvenli baglamda calisir. isSecureContext
        // localhost ve 127.0.0.1'i de dogru tanir; protokol/hostname
        // kontrolu ikisini de atlardi.
        if (!window.isSecureContext) return;

        try {
            registration = await navigator.serviceWorker.register(SW_URL);

            // Kontrol sayfada zaten ele gecmisse (sayfa yeniden yuklendi) guncelleme
            // bekleyen bir worker olabilir; sessizce beklemesin.
            if (registration.waiting && navigator.serviceWorker.controller) {
                showUpdateBar(registration);
            }

            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                    // "installed" + controller var = mevcut worker varken yeni sürüm hazır.
                    if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBar(registration);
                    }
                });
            });

            // Periyodik kontrol: kullanici uygulamayi haftalarca acik tutabilir.
            setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') registration.update().catch(() => {});
            });
        } catch (err) {
            console.warn('Service worker kaydedilemedi:', err);
        }
    }

    function showUpdateBar(reg) {
        if (document.querySelector('.pwa-update-bar')) return;
        const bar = document.createElement('div');
        bar.className = 'pwa-update-bar';
        bar.setAttribute('role', 'status');

        const text = document.createElement('span');
        text.textContent = 'Yeni sürüm hazır.';
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'pwa-update-btn';
        apply.textContent = 'Yenile';
        apply.addEventListener('click', () => {
            const waiting = (reg && reg.waiting) || navigator.serviceWorker.getRegistration().then(r => r && r.waiting);
            Promise.resolve(waiting).then(worker => {
                if (!worker) { location.reload(); return; }
                worker.postMessage({ type: 'SKIP_WAITING' });
            });
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'pwa-update-dismiss';
        dismiss.setAttribute('aria-label', 'Bildirimi kapat');
        dismiss.innerHTML = '<i class="fas fa-xmark"></i>';
        dismiss.addEventListener('click', () => bar.remove());

        bar.append(text, apply, dismiss);
        document.body.appendChild(bar);
        requestAnimationFrame(() => bar.classList.add('show'));
    }

    // Chromium: tarayici "install" diyalogunu biz tetikleriz.
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        updateInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        localStorage.removeItem(INSTALL_DISMISSED);
        hideInstallBanner();
        updateInstallButton();
        if (typeof showToast === 'function') showToast('Parnex ana ekrana eklendi.', 'success');
    });

    async function promptInstall() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
            await deferredPrompt.userChoice;
        } catch (err) {
            console.warn('Kurulum istemi hata verdi:', err);
        }
        deferredPrompt = null;
        updateInstallButton();
    }

    function hideInstallBanner() {
        const banner = document.querySelector('.pwa-install-banner');
        if (banner) banner.remove();
    }

    // Chromium'da tarayici zaten ipucu veriyor; ayrica banner gostermek gurultu.
    // iOS'ta elle yapilan adimlar acilanma olmadigi icin yalnizca orada gosterilir.
    function maybeShowInstallBanner() {
        if (isStandalone() || isNativeApp()) return;
        if (localStorage.getItem(INSTALL_DISMISSED)) return;
        if (!needsIOSInstructions()) return;
        if (document.querySelector('.pwa-install-banner')) return;

        const banner = document.createElement('div');
        banner.className = 'pwa-install-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Uygulamayı yükle');

        const icon = document.createElement('img');
        icon.src = 'icons/logo-192.png';
        icon.alt = '';
        icon.width = 40;
        icon.height = 40;

        const copy = document.createElement('div');
        copy.className = 'pwa-install-copy';
        const title = document.createElement('strong');
        title.textContent = 'Parnex’i ana ekrana ekle';
        const desc = document.createElement('span');
        desc.textContent = 'Paylaş → Ana Ekrana Ekle';
        copy.append(title, desc);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pwa-install-close';
        close.setAttribute('aria-label', 'Kapat');
        close.innerHTML = '<i class="fas fa-xmark"></i>';
        close.addEventListener('click', () => {
            localStorage.setItem(INSTALL_DISMISSED, '1');
            hideInstallBanner();
        });

        banner.append(icon, copy, close);
        document.body.appendChild(banner);
        requestAnimationFrame(() => banner.classList.add('show'));
    }

    // Ayarlar sayfasindaki "Uygulamayi yukle" dugmesi her platforma uyar.
    function updateInstallButton() {
        const button = document.getElementById('pwaInstallBtn');
        if (!button) return;
        const hint = document.getElementById('pwaInstallHint');
        const installed = isStandalone();

        // Buton etiketi HTML'de <span id="pwaInstallBtnText"> icinde; ikon atne
    // degismemesi icin yalnizca metni degistiriyoruz.
    const label = button.querySelector('#pwaInstallBtnText') || button;
    const setLabel = text => { label.textContent = text; };

    if (installed) {
            setLabel('Uygulama yüklü');
            button.disabled = true;
            if (hint) hint.textContent = 'Parnex ana ekranınızda çalışıyor.';
            return;
        }
        if (needsIOSInstructions()) {
            setLabel('Nasıl kurulur?');
            button.disabled = false;
            if (hint) hint.textContent = 'Safari’de Paylaş → Ana Ekrana Ekle seçeneğini kullanın.';
            button.onclick = () => {
                if (typeof showToast === 'function') {
                    showToast('Safari paylaş menüsünden “Ana Ekrana Ekle” seçin.', 'info');
                }
            };
            return;
        }
        if (deferredPrompt) {
            setLabel('Uygulamayı yükle');
            if (hint) hint.textContent = 'Telefonunuzun ana ekranına ekleyin; tam ekran açılır.';
            button.disabled = false;
            button.onclick = promptInstall;
            return;
        }
        setLabel('Uygulamayı yükle');
        button.disabled = true;
        if (hint) hint.textContent = 'Tarayıcınızın menüsünden “Yükle” veya “Ana ekrana ekle” seçeneğini kullanın.';
    }

    // Cevrimdisi: kullanici veri girmeden once bilsin. Firestore cevrimdisi
    // calisirsa hata verir; once uyari gostermek daha iyi bir deneyim.
    function trackConnection() {
        const notify = () => {
            if (typeof showToast === 'function') {
                showToast(navigator.onLine
                    ? 'Bağlantı geri geldi.'
                    : 'Çevrimdışısınız. Girdileriniz kaydedilmez.', navigator.onLine ? 'success' : 'error');
            }
        };
        window.addEventListener('offline', notify);
        window.addEventListener('online', notify);
    }

    function syncThemeColor() {
        // Tema degisince manifest rengi degissin diye meta'yi senkronla.
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const dark = document.documentElement.dataset.theme === 'dark';
        meta.setAttribute('content', dark ? '#171827' : '#f4f5fb');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        registerServiceWorker();
        trackConnection();
        updateInstallButton();
        syncThemeColor();
        // iOS kullaniciyi kuruluma davet eder; Chromium'da tarayici ipucu verir.
        setTimeout(maybeShowInstallBanner, 4000);

        window.addEventListener('pwa:themechange', syncThemeColor);
        // Geri gelen sayfalarda buton durumu (beforeinstallprompt) guncel kalsin.
        window.addEventListener('focus', updateInstallButton);
    }
})();