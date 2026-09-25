// Firebase yapılandırması
const firebaseConfig = {

  apiKey: "AIzaSyDc5VzYalm9J39uHHNNpVgVA_FZolKOMQM",

  authDomain: "parnex-97d1b.firebaseapp.com",

  projectId: "parnex-97d1b",

  storageBucket: "parnex-97d1b.firebasestorage.app",

  messagingSenderId: "909377657628",

  appId: "1:909377657628:web:44192bd16b27046834b8d9",

  measurementId: "G-YES1LH1WGV"

};


firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let accounts = [];
let transactions = [];
let transfers = [];
let recurringTransactions = [];
let goals = [];
let selectedType = 'expense';
let currentCurrency = 'TRY';
let selectedAccounts = new Set();
let currentMonth = new Date().toISOString().substring(0, 7);
let reportPeriod = 'month';
let currentThemeColor = '#9C27B0';
let exchangeRates = { TRY: 1, USD: 0, EUR: 0, GRAM_ALTIN: 0, CEYREK_ALTIN: 0 };
let isHidden = false;
let totalBalanceVisible = false;
let privacyModeUnsubscribe = null;
let securityTimeoutId = null;
let securityLocked = false;
let securityActivityBound = false;
let rateRefreshIntervalId = null;
let editingTransactionId = null;
let recurringProcessingPromise = null;
let notifications = [];
let budgets = [];
let customCategories = [];

const DEFAULT_CATEGORIES = {
    expense: ['🍔 Yemek', '🚗 Ulaşım', '🏠 Kira', '💡 Faturalar', '🛒 Market', '🎮 Eğlence', '💊 Sağlık', '📚 Eğitim', '👕 Giyim', '📱 Teknoloji', '🎁 Hediyeler', '📋 Diğer'],
    income: ['💰 Maaş', '💼 Serbest Çalışma', '📈 Yatırım', '🎁 Hediye', '🏠 Kira Geliri', '📋 Diğer']
};

// Özel kategoriler: ilk girişte varsayılanlar tohumlanır, sonra kullanıcı yönetir.
async function loadCategories() {
    customCategories = [];
    if (!currentUser) return;
    try {
        const snap = await db.collection('users').doc(currentUser.uid).collection('categories').get();
        snap.forEach(doc => customCategories.push({ id: doc.id, ...doc.data() }));
        if (!customCategories.length) {
            for (const type of ['expense', 'income']) {
                for (const name of DEFAULT_CATEGORIES[type]) {
                    const ref = await db.collection('users').doc(currentUser.uid).collection('categories').add({ name, type, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                    customCategories.push({ id: ref.id, name, type });
                }
            }
        }
    } catch (error) {
        console.warn('Kategoriler yüklenemedi.', error);
        customCategories = [];
    }
}

