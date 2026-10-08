# Parnex - Kişisel Finans ve Bütçe Yönetimi

Parnex, gelir-gider takibi, bütçe yönetimi, birikim hedefleri ve yatırım takibini tek bir platformda sunan ücretsiz bir kişisel finans uygulamasıdır.

## 🚀 Özellikler

- **Gelir-Gider Takibi**: Tüm finansal işlemlerinizi kolayca kaydedin ve takip edin
- **Bütçe Yönetimi**: Aylık bütçenizi planlayın ve harcama limitlerinizi belirleyin
- **Birikim Hedefleri**: Finansal hedeflerinizi oluşturun ve ilerlemenizi takip edin
- **Yatırım Takibi**: Altın, döviz ve diğer yatırımlarınızı izleyin
- **Harcama Analizi**: Harcamalarınızı kategorilere göre analiz edin
- **Responsive Tasarım**: Mobil, tablet ve masaüstü cihazlarda mükemmel görünüm
- **Karanlık Mod**: Otomatik karanlık mod desteği
- **PWA**: Ana ekrana eklenir, tam ekran çalışır, çevrimdışı açılır
- **Çevrimdışı Çalışma**: Uygulama kabuğu önbelleklenir; kura verileri her zaman taze

## 📁 Proje Yapısı

```
├── index.html          # Ana HTML dosyası
├── sw.js               # Service worker (önbellek + offline + push)
├── js/                 # JavaScript dosyaları
├── css/                # Stil dosyaları (bölünmüş)
├── icons/              # Uygulama ikonları (any + maskable + apple-touch)
├── data/               # Veri dosyaları
├── tools/              # Hesaplama araçları
├── test/               # Birim testler (node:test)
├── www/                # Capacitor webDir + çevrimdışı yönlendirme sayfası
├── altin/              # Altın takibi modülü
├── birikim/            # Birikim hedefleri modülü
├── butce/              # Bütçe yönetimi modülü
├── butce-hesapla/      # Bütçe hesaplama aracı
├── gelir-gider/        # Gelir-gider takibi modülü
├── harcama/            # Harcama analizi modülü
└── yatirim/            # Yatırım takibi modülü
```

## 🧪 Testler

Para matematiği (kredi kartı, taksit, yatırım kâr/zarar, kur çevrimi) ve yardımcı fonksiyonlar için birim testler `test/` altındadır. Node'un yerleşik test çalıştırıcısı kullanılır, ek bağımlılık yok:

```bash
npm test
```

Testler `main` dalına yapılan push ve PR'larda GitHub Actions ile otomatik koşar (`.github/workflows/tests.yml`).

## 🛠️ Teknolojiler

- HTML5
- CSS3
- JavaScript (Vanilla JS)
- Firebase (Firestore)
- PWA (Progressive Web App)

## 📱 Telefonda kullanma (PWA)

Parnex, kurulum gerektirmeyen bir uygulamadır: tarayıcıda açılır, ana ekrana
eklenir ve tam ekran çalışır.

- **Android / Chrome:** Menü → **Yükle** ya da uygulamadaki **Ayarlar →
  Telefonda Kullan → Uygulamayı yükle**
- **iOS / Safari:** Paylaş → **Ana Ekrana Ekle** (iOS'ta tarayıcı kurulum
  diyaloğu göstermediği için uygulama adımı hatırlatır)

Çevrimdışıyken uygulama kabuğu açılır, kura verileri ise her zaman ağdan
çekilir — böylece ekranda bayat bakiye gösterilmez.

> Service worker yalnızca `https://` veya `localhost` üzerinde çalışır.
> GitHub Pages `https` kullandığı için canlı demoda kurulum hazırdır.

### Yeni dosya eklerken

`sw.js` içindeki `PRECACHE` listesine yeni bir `js/`, `css/` veya sayfa
eklediğinizde o dosyayı da listeye ekleyin; `test/pwa.test.mjs` bu eşleşmeyi
kontrol eder ve eksik bırakırsanız test kırmızıya döner. Kabuk değiştiğinde
`CACHE_VERSION` değerini artırın — eski önbellekler otomatik temizlenir.

## 📦 Kurulum

1. Bu repoyu klonlayın:
```bash
git clone https://github.com/Bizzness4711/Notion_parnex.git
```

2. `index.html` dosyasını bir web tarayıcısında açın veya bir web sunucusunda barındırın.

3. GitHub Pages ile barındırma:
   - Repository ayarlarından Pages'i etkinleştirin
   - Kaynak olarak `main` branch'ini seçin

## 🌐 Canlı Demo

[https://bizzness4711.github.io/Notion_parnex/](https://bizzness4711.github.io/Notion_parnex/)

## 📱 PWA Desteği

Parnex, Progressive Web App (PWA) olarak çalışır ve şu özellikleri sunar:
- Çevrimdışı çalışma
- Ana ekrana ekleme
- Push bildirimleri

## 🔧 Firebase Kurulumu

Firebase Firestore kullanmak için:

1. [Firebase Console](https://console.firebase.google.com/)'dan yeni bir proje oluşturun
2. Firestore Database'i etkinleştirin
3. `firestore.rules` dosyasını projenize yükleyin
4. Firebase yapılandırma bilgilerinizi ilgili JS dosyalarına ekleyin

## 📄 Lisans

Bu proje açık kaynaklıdır ve kişisel kullanım için ücretsizdir.

## 🤝 Katkıda Bulunma

Katkılarınızı bekliyoruz! Lütfen katkıda bulunmadan önce issue açın veya pull request gönderin.

## 📞 İletişim

Sorularınız ve önerileriniz için issue açabilirsiniz.

---

**Parnex** - Finansal özgürlüğünüz için yanınızda 💰
