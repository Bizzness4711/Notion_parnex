// Onboarding turu: yalnızca yeni kullanıcılara, ilk girişte bir kez gösterilir.
// Adımlar gerçek arayüz öğelerinin üzerine gelir; tur bitince Firestore'a yazılır.
const ONBOARDING_STEPS = [
    {
        target: 'dashboardQuickActions',
        title: 'Hızlı işlemler',
        text: 'İlk işleminizi, hesabınızı ve hedefinizi buradan tek tıkla ekleyin. İlk işlem girildiğinde bu kutu kendiliğinden kaybolur.',
        page: 'dashboard'
    },
    {
        target: 'quickAddBtn',
        title: 'Artı butonu — her şeyin kısayolu',
        text: 'Bu butona her yerden dokunun: yeni işlem, hesap, transfer, hedef ve bütçe ekleme menüsü açılır.',
        page: 'dashboard'
    },
    {
        target: 'balanceCard',
        title: 'Toplam bakiyeniz',
        text: 'Seçili hesaplarınızdaki toplam para burada. Kutuya dokunup hesap seçimlerini yönetebilirsiniz.',
        page: 'dashboard'
    },
    {
        target: 'exchangeRatesCard',
        title: 'Canlı kurlar',
        text: 'Dolar, euro ve altın kurları burada güncellenir. Döviz/altın hesaplarınız bu kurlarla değerlenir.',
        page: 'dashboard'
    },
    {
        target: 'notificationBtn',
        title: 'Bildirimler',
        text: 'Bütçe aşımı, hedef ilerlemesi ve hatırlatıcılar bu zilde toplanır. Masaüstü bildirim iznini ayarlardan açabilirsiniz.',
        page: 'dashboard'
    },
    {
        target: 'commandPaletteBtn',
        title: 'Hızlı arama (Ctrl+K)',
        text: 'Klavyeden Ctrl+K ile herhangi bir sayfaya veya işleme saniyeler içinde ulaşın.',
        page: 'dashboard'
    }
];

let onboardingIndex = 0;
let onboardingActive = false;

function onboardingEnsurePage(pageId) {
    const active = document.querySelector('.page.active');
    if (active && active.id === pageId) return;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(pageId);
    if (el) el.classList.add('active');
}

function onboardingHighlight(targetId) {
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    const el = document.getElementById(targetId);
    if (el) el.classList.add('onboarding-highlight');
    return el;
}

function showOnboardingStep() {
    const overlay = document.getElementById('onboardingOverlay');
    const card = document.getElementById('onboardingCard');
    if (!overlay || !card) { finishOnboardingTour(); return; }

    if (onboardingIndex >= ONBOARDING_STEPS.length) { finishOnboardingTour(); return; }
    const step = ONBOARDING_STEPS[onboardingIndex];

    onboardingEnsurePage(step.page);
    const target = onboardingHighlight(step.target);
    overlay.hidden = false;
    onboardingActive = true;

    document.getElementById('onboardingTitle').textContent = step.title;
    document.getElementById('onboardingText').textContent = step.text;
    document.getElementById('onboardingStepLabel').textContent = `${onboardingIndex + 1} / ${ONBOARDING_STEPS.length}`;
    document.getElementById('onboardingBackBtn').disabled = onboardingIndex === 0;
    document.getElementById('onboardingSkipBtn').textContent = onboardingIndex === ONBOARDING_STEPS.length - 1 ? 'Tur\'u bitir' : 'Atla';
    document.getElementById('onboardingNextBtn').textContent = onboardingIndex === ONBOARDING_STEPS.length - 1 ? 'Başla! 🎉' : 'İleri →';

    // Kartı hedefin yanına konumla (ekran dışına taşmayan güvenli yerleşim)
    card.style.top = '50%';
    card.style.left = '50%';
    if (target) {
        const r = target.getBoundingClientRect();
        const cardW = Math.min(360, window.innerWidth - 32);
        let left = r.right + 16;
        if (left + cardW > window.innerWidth - 12) left = Math.max(12, r.left - cardW - 16);
        if (left < 12) left = 12;
        let top = Math.max(80, Math.min(window.innerHeight - 260, r.top - 20));
        card.style.left = left + 'px';
        card.style.top = top + 'px';
    } else {
        card.style.left = '50%';
        card.style.transform = 'translateX(-50%)';
    }
    if (window.innerWidth < 700) {
        // Mobilde alt sayfa gibi göster
        card.style.left = '50%';
        card.style.transform = 'translateX(-50%)';
        card.style.top = 'auto';
        card.style.bottom = '18px';
    }
}

function finishOnboardingTour() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.hidden = true;
    document.querySelectorAll('.onboarding-highlight').forEach(el => el.classList.remove('onboarding-highlight'));
    onboardingActive = false;
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).set({ onboardingDone: true }, { merge: true }).catch(() => {});
    }
    updateDashboard();
}

function startOnboardingTour(force) {
    if (onboardingActive) return;
    if (typeof currentUser === 'undefined' || !currentUser) return;
    // Zaten gördüyse tekrar açma (force ile ayarlardan yeniden başlatılabilir).
    if (!force && window.__onboardingSeenThisSession) return;
    window.__onboardingSeenThisSession = true;
    onboardingIndex = 0;
    showOnboardingStep();
}

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    document.getElementById('onboardingNextBtn')?.addEventListener('click', () => {
        onboardingIndex++;
        showOnboardingStep();
    });
    document.getElementById('onboardingBackBtn')?.addEventListener('click', () => {
        if (onboardingIndex > 0) { onboardingIndex--; showOnboardingStep(); }
    });
    document.getElementById('onboardingSkipBtn')?.addEventListener('click', finishOnboardingTour);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { /* dış tık: turu kapatma, bilinçli olsun */ }
    });
    document.addEventListener('keydown', (e) => {
        if (!onboardingActive) return;
        if (e.key === 'Escape') finishOnboardingTour();
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { onboardingIndex++; showOnboardingStep(); }
        else if (e.key === 'ArrowLeft' && onboardingIndex > 0) { onboardingIndex--; showOnboardingStep(); }
    });
    // Pencere boyutu değişince adımı yeniden konumlandır
    window.addEventListener('resize', () => { if (onboardingActive) showOnboardingStep(); });
});
