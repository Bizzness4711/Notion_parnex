const COMMAND_PALETTE_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', hint: 'Finansal özetini gör', icon: 'fa-home', type: 'page', target: 'dashboard' },
    { id: 'accounts', label: 'Hesaplar', hint: 'Hesaplarını yönet', icon: 'fa-wallet', type: 'page', target: 'accounts' },
    { id: 'transactions', label: 'İşlemler', hint: 'Gelir ve masrafları incele', icon: 'fa-list', type: 'page', target: 'transactions' },
    { id: 'goals', label: 'Hedefler', hint: 'Birikim hedeflerini takip et', icon: 'fa-bullseye', type: 'page', target: 'goals' },
    { id: 'budgets', label: 'Bütçeler', hint: 'Aylık limitlerini kontrol et', icon: 'fa-chart-pie', type: 'page', target: 'budgets' },
    { id: 'reports', label: 'Raporlar', hint: 'Finansal raporları görüntüle', icon: 'fa-chart-line', type: 'page', target: 'reports' },
    { id: 'new-transaction', label: 'Yeni işlem ekle', hint: 'Gelir veya masraf kaydet', icon: 'fa-plus', type: 'action', target: 'newTransactionBtn' },
    { id: 'new-account', label: 'Yeni hesap ekle', hint: 'Banka, nakit veya yatırım hesabı', icon: 'fa-credit-card', type: 'action', target: 'fabAddAccount' },
    { id: 'new-goal', label: 'Yeni hedef oluştur', hint: 'Bir sonraki birikim adımını planla', icon: 'fa-flag', type: 'action', target: 'fabAddGoal' },
    { id: 'settings', label: 'Ayarlar', hint: 'Tercihleri ve güvenliği yönet', icon: 'fa-cog', type: 'page', target: 'settings' }
];

function initCommandPalette() {
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandPaletteInput');
    const list = document.getElementById('commandPaletteList');
    const trigger = document.getElementById('commandPaletteBtn');
    if (!palette || !input || !list) return;

    let activeIndex = 0;
    let visibleItems = COMMAND_PALETTE_ITEMS;

    const close = () => {
        palette.hidden = true;
        input.value = '';
        document.body.classList.remove('command-palette-open');
    };

    const run = item => {
        close();
        document.getElementById(item.target)?.click();
    };

    const render = () => {
        const query = input.value.trim().toLocaleLowerCase('tr-TR');
        visibleItems = COMMAND_PALETTE_ITEMS.filter(item =>
            `${item.label} ${item.hint}`.toLocaleLowerCase('tr-TR').includes(query)
        );
        activeIndex = Math.min(activeIndex, Math.max(0, visibleItems.length - 1));
        list.innerHTML = visibleItems.length
            ? visibleItems.map((item, index) => `<button type="button" class="command-item ${index === activeIndex ? 'active' : ''}" data-command-index="${index}">
                <span class="command-item-icon"><i class="fas ${item.icon}" aria-hidden="true"></i></span>
                <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint)}</small></span>
                ${index === activeIndex ? '<i class="fas fa-arrow-right command-item-arrow" aria-hidden="true"></i>' : ''}
            </button>`).join('')
            : '<p class="command-empty">Bu aramaya uygun komut bulunamadı.</p>';
        list.querySelectorAll('[data-command-index]').forEach(button => {
            button.addEventListener('click', () => run(visibleItems[Number(button.dataset.commandIndex)]));
        });
    };

    const open = () => {
        palette.hidden = false;
        document.body.classList.add('command-palette-open');
        activeIndex = 0;
        render();
        requestAnimationFrame(() => input.focus());
    };

    trigger?.addEventListener('click', open);
    palette.querySelector('[data-command-close]')?.addEventListener('click', close);
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        } else if (event.key === 'ArrowDown' && visibleItems.length) {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % visibleItems.length;
            render();
        } else if (event.key === 'ArrowUp' && visibleItems.length) {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
            render();
        } else if (event.key === 'Enter' && visibleItems[activeIndex]) {
            event.preventDefault();
            run(visibleItems[activeIndex]);
        }
    });
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            palette.hidden ? open() : close();
        }
    });
}

document.addEventListener('DOMContentLoaded', initCommandPalette);