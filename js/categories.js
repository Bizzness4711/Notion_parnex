function getCategories(type) {
    // Satış işlemleri kategori olarak gelir kategorilerini kullanır.
    const categoryType = type === 'sell' ? 'income' : type;
    const defaults = DEFAULT_CATEGORIES[categoryType] || [];
    const custom = customCategories
        .filter(c => c && c.type === categoryType)
        .map(c => c.name)
        .filter(Boolean);

    const seen = new Set();
    return [...defaults, ...custom].filter(name => {
        const key = String(name).trim().toLocaleLowerCase('tr-TR');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function updateCategorySelect() {
    const select = document.getElementById('category');
    if (select) {
        const keep = select.value;
        select.innerHTML = '<option value="">Kategori Seçin</option>';
        getCategories(typeof selectedType !== 'undefined' ? selectedType : 'expense').forEach(category => {
            select.innerHTML += `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
        });
        if (getCategories(typeof selectedType !== 'undefined' ? selectedType : 'expense').includes(keep)) select.value = keep;
    }
    // Bütçe kategorisi: ana sayfa formu VEYA modal (FAB menü) hangisi varsa
    const budgetSelect = document.getElementById('budgetCategory') || document.getElementById('budgetModalCategory');
    if (budgetSelect) {
        const keepB = budgetSelect.value;
        budgetSelect.innerHTML = '<option value="">Kategori Seçin</option>';
        getCategories('expense').forEach(category => {
            budgetSelect.innerHTML += `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
        });
        if (keepB) budgetSelect.value = keepB;
    }
    updateCategoryManagerUI();
}

function updateCategoryManagerUI() {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    // Varsayılanlar + kullanıcı kategorileri birlikte gösterilir.
    const defaultItems = [
        ...DEFAULT_CATEGORIES.expense.map(name => ({ name, type: 'expense', isDefault: true })),
        ...DEFAULT_CATEGORIES.income.map(name => ({ name, type: 'income', isDefault: true }))
    ];
    const customItems = customCategories.map(c => ({ ...c, isDefault: false }));

    const seen = new Set();
    const items = [...defaultItems, ...customItems].filter(c => {
        const key = `${c.type}|${String(c.name || '').trim().toLocaleLowerCase('tr-TR')}`;
        if (!c.name || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    list.innerHTML = items.map(c => {
        const del = c.isDefault || !c.id
            ? ''
            : `<button class="delete-btn" onclick="deleteCategory('${c.id}')" title="Kategoriyi sil"><i class="fas fa-trash"></i></button>`;
        const badge = c.isDefault ? '<span class="category-default-badge">Varsayılan</span>' : '';
        return `<div class="transaction-card-modern"><div class="transaction-info-modern">
            <div class="transaction-title-modern">${escapeHtml(c.name)} ${badge}</div>
            <div class="transaction-subtitle-modern">${c.type === 'income' ? 'Gelir' : 'Masraf'}</div>
        </div>${del}</div>`;
    }).join('');
}

window.deleteCategory = async function (id) {
    if (!currentUser || !confirm('Bu kategori silinsin mi? Mevcut işlemler etkilenmez.')) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('categories').doc(id).delete();
        customCategories = customCategories.filter(c => c.id !== id);
        updateCategorySelect();
        showToast('Kategori silindi.', 'success');
    } catch (error) { showToast('Silinemedi: ' + error.message, 'error'); }
};
let isAdmin = false;
let userRole = 'user';
const APP_VERSION = 'v2026.09';

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

function getNextRecurringDate(dateString, frequency) {
    const date = new Date(`${dateString}T12:00:00`);
    if (frequency === 'weekly') date.setDate(date.getDate() + 7);
    else if (frequency === 'yearly') date.setFullYear(date.getFullYear() + 1);
    else date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
}
