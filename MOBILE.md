# Parnex Mobil Uygulama (Capacitor / Android)

Siteyi saran native Android uygulaması (APK). Push bildirimleri **native FCM** ile gelir:
uygulama kapalıyken bile bildirim merkezine düşer.

## Ön koşullar

- Node.js 18+ → https://nodejs.org
- Android Studio → https://developer.android.com/studio (kurulumda "Android SDK" ve "Android SDK Platform-Tools" seçili olsun)
- Firebase Console'da Android uygulaması eklenmiş olmalı (aşağıda)

## Bir kerelik Firebase hazırlığı

1. Firebase Console → Proje Ayarları (⚙️) → **Genel** sekmesi
2. "Uygulamalarınız" kartında **Android simgesine** tıklayın
3. Paket adı: `com.bizzness4711.parnex` (capacitor.config.ts ile aynı olmalı)
4. Uygulama adı: `Parnex` → "Uygulamayı kaydet"
5. **google-services.json** dosyasını indirin → projenin **android/app/** klasörüne koyun
   (adım 4'te `npx cap add android` çalıştırılmadan önce indirip proje köküne kaydedin; cap add otomatik kopyalar)

## Derleme adımları (proje kökünde, komut satırı)

```bash
npm install                 # Capacitor + eklentileri indirir
npx cap add android         # android/ klasörünü oluşturur (tek sefer)
```

### Firebase Gradle eklentisi (cap add sonrası, tek sefer)

`@capacitor-firebase/messaging` native FCM için Google Services eklentisi ister:

1. `android/build.gradle` açın → `buildscript { dependencies { ... } }` içine şu satırı ekleyin:
   ```
   classpath 'com.google.gms:google-services:4.4.2'
   ```
2. `android/app/build.gradle` açın → en üstteki `apply plugin: 'com.android.application'` satırının hemen altına:
   ```
   apply plugin: 'com.google.gms.google-services'
   ```
3. `google-services.json` dosyasının `android/app/` içinde olduğunu doğrulayın.

Sonra devam:

```bash
npx cap sync android        # config + eklentileri native projeye yazar
npx cap open android        # Android Studio'yu açar
```

Android Studio'da: **Build → Build Bundle(s)/APK(s) → Build APK(s)**
APK çıktısı: `android/app/build/outputs/apk/debug/app-debug.apk`

Telefona kurmak için APK'yı telefona kopyalayıp açın ("bilinmeyen kaynaklara izin ver" gerekir)
veya USB ile bağlıyken Android Studio'dan doğrudan **Run ▶** ile kurun.

## Güncelleme yapmak

Site içeriği GitHub Pages'ten yüklendiği için **kod değişikliklerinde APK yeniden derlemek gerekmez**;
site güncellenir, uygulama açılınca yeni sürüm yüklenir. Yalnızca native taraflı değişiklik
(eklenti ekleme, config değişimi) durumunda:

```bash
npx cap sync android
```

## Logo / uygulama ikonu

`icons/logo-512.png` dosyasını kullanarak Android Studio içinde sağ tık →
**New → Image Asset → Launcher Icons** ile tüm boyutlar otomatik üretilir.
(Mobile-panel ikonları ve splash ekranı da aynı menüden ayarlanır.)

## Sorun giderme

- **Bildirim gelmiyor:** Uygulama ayarları → Bildirimler → izin açık mı? Xiaomi/Huawei'de:
  Pil optimizasyonundan muaf tutun.
- **`google-services.json` hatası:** Dosyanın `android/app/` içinde olduğundan emin olun, sonra `npx cap sync android`.
- **Beyaz ekran:** İnternet yok; `www/index.html` yedek sayfası görünür, bağlantı sağlanınca site yüklenir.
