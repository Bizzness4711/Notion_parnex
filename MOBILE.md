# Parnex Mobil Uygulama (Capacitor / Android)

Siteyi saran native Android uygulaması (APK). Push bildirimleri **native FCM** ile gelir:
uygulama kapalıyken bile bildirim merkezine düşer.

> Not: `capacitor.config.json` kullanılıyor (.ts değil) — TypeScript aracı gerektirmez.
> Bu proje daha önce derlendi; aşağıdaki adımlar sıfırdan kurulum içindir.

## Ön koşullar

- Node.js 18+ → https://nodejs.org
- Android Studio → https://developer.android.com/studio
  (İlk açılışta SDK'yı `%LOCALAPPDATA%\Android\Sdk` altına kurar)
- Firebase Console'da Android uygulaması eklenmiş olmalı (aşağıda)

## Bir kerelik Firebase hazırlığı

1. Firebase Console → Proje Ayarları → Genel → "Your apps" → **Android** ekle
2. Paket adı: `com.bizzness4711.parnex` (capacitor.config.json ile aynı)
3. **google-services.json** indirin → proje köküne koyun
4. `npx cap add android` sonrası dosyayı `android/app/` içine kopyalayın
   (cap add kökte bulursa kendisi kopyalar)

Gradle düzenlemesi **gerekmez**: Capacitor'un Android şablonu google-services
classpath'ini ve koşullu plugin uygulamasını zaten içerir; dosya varsa etkinleşir.

## Derleme adımları (proje kökünde)

```bash
npm install
npx cap add android        # android/ klasörünü oluşturur (tek sefer)
npx cap sync android       # config + eklentileri native projeye yazar
```

### Komut satırından APK derleme (Windows)

Gradle iki şeye ihtiyaç duyar — bu makinede karşılıkları:

- **Java:** Android Studio'nun JBR'si çok yenidir (Java 25); Gradle 8.2.1 Java 21 ister.
  Uygun JDK: `C:\Users\pazar\.jdks\jbr-21.0.11`
- **SDK yolu:** `android/local.properties` → `sdk.dir=C\:\\Users\\pazar\\AppData\\Local\\Android\\Sdk`

```bat
cd android
set JAVA_HOME=C:\Users\pazar\.jdks\jbr-21.0.11
gradlew.bat assembleDebug
```

APK çıktısı: `android/app/build/outputs/apk/debug/app-debug.apk`

Android Studio ile derlemek isterseniz `npx cap open android` → **Build → Build APK(s)**
(Studio ayarlarından Gradle JDK = jbr-21.0.11 seçili olmalı).

## Telefona kurulum

`app-debug.apk`'yı telefona kopyalayın (USB, e-posta, Drive…) → dosyayı açın →
"bilinmeyen kaynaklara izin ver" → kurulum biter. İlk açılışta bildirim izni sorulur.

## Logo / uygulama ikonu

`icons/logo-512.png` kaynak: Android Studio'da `app` → `res` sağ tık →
**New → Image Asset → Launcher Icons** → Path: logo-512.png → Next → Finish →
`npx cap sync android` + yeniden derleyin.

## Sorun giderme

- **Bildirim gelmiyor:** Uygulama ayarları → Bildirimler izni açık mı? Xiaomi/Huawei:
  pil optimizasyonundan muaf tutun. GitHub'daki saatlik gönderici çalışıyor mu
  (Actions sekmesi) ve `FIREBASE_SERVICE_ACCOUNT` secret tanımlı mı?
- **`google-services.json` hatası:** Dosya `android/app/` içinde mi? Sonra `npx cap sync android`.
- **"Unsupported class file major version"** → Gradle Java 25 ile çalışmıyor;
  JAVA_HOME'u jbr-21.0.11'e çevirin.
- **"SDK location not found"** → `android/local.properties` içindeki sdk.dir yolunu düzeltin.
- **Beyaz ekran:** İnternet yok; `www/index.html` yedek sayfası görünür.
