import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(ROOT, file), 'utf8');

// sw.js tarayıcıda çalışan bir global betiği; Node'da import edilemez.
// Bu yüzden PRECACHE dizisini kaynak metinden çıkarıyoruz.
function readPrecache() {
    const source = read('sw.js');
    const match = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
    assert.ok(match, 'sw.js içinde PRECACHE dizisi bulunamadı');
    // Yalnızca dizi girdileri: satır yorumlarındaki dizeleri sayma.
    return [...match[1].matchAll(/^\s*'([^']+)',?\s*$/gm)].map(entry => entry[1]);
}

test('sw.js CDN betiklerini CORS modunda önbelleğe alıyor', () => {
    // SRI kullanan <script integrity crossorigin> etiketleri 'cors' modunda
    // istek atar. Varsayılan modda sunucu opaque (status 0) yanıt döner ve
    // offline'ta boş gövde gelir; uygulama mount olmaz.
    const sw = read('sw.js');
    assert.match(sw, /mode:\s*'cors'/);
    assert.match(sw, /gstatic\.com\/firebasejs/);
});

test('sw.js çevrimdışı yönlendirme sayfasını önbelleğe alıyor', () => {
    const sw = read('sw.js');
    assert.ok(readPrecache().includes('./www/index.html'), 'www/index.html PRECACHE içinde olmalı');
    assert.match(sw, /OFFLINE_FALLBACK = '\.\/www\/index\.html'/);
});

test('sw.js dizin navigasyonlarını index.html dosyasına eşliyor', () => {
    // "/butce/" isteği cache'te "/butce/index.html" olarak durur; eşleme
    // yapılmazsa navigasyon yanlışlıkla ana sayfaya düşer.
    const sw = read('sw.js');
    assert.match(sw, /function directoryCandidates/);
    assert.match(sw, /url\.pathname \+ 'index\.html'/);
});

test('js/pwa.js yalnızca güvenli bağlamda kayıt yapıyor', () => {
    // Service worker file:// üzerinde çalışmaz; sessizce hata vermesin.
    // isSecureContext, localhost ve 127.0.0.1'i de kapsar.
    const pwa = read('js/pwa.js');
    assert.match(pwa, /if \(!window\.isSecureContext\) return;/);
});

test('sw.js PRECACHE girdilerinin tamamı diskte var', () => {
    const missing = readPrecache().filter(entry => entry !== './' && !existsSync(path.join(ROOT, entry)));
    assert.deepEqual(missing, [], `Önbellek listesinde olmayan dosya: ${missing.join(', ')}`);
});

test('PRECACHE ana giriş sayfasını içerir (offline açılış)', () => {
    const precache = readPrecache();
    assert.ok(precache.includes('./'), 'PRECACHE "./" içermeli');
    assert.ok(precache.includes('./index.html'), 'PRECACHE "./index.html" içermeli');
});

test('sw.js uygulamanın kendi JS dosyalarının tamamını önbelleğe alıyor', () => {
    // Yeni bir js/ dosyası eklendiğinde SW listesine girmeyi unutursa
    // çevrimdışı açılışta uygulama sessizce eksik çalışır.
    const manifest = read('index.html');
    const referenced = [...manifest.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
    assert.ok(referenced.length > 10, 'index.html script referansları okunamadı');
    const precache = readPrecache();
    const missing = referenced.filter(file => !precache.includes(`./${file}`));
    assert.deepEqual(missing, [], `Önbellekte olmayan betik: ${missing.join(', ')}`);
});

test('sw.js uygulamanın kendi CSS dosyalarının tamamını önbelleğe alıyor', () => {
    const manifest = read('index.html');
    const referenced = [...manifest.matchAll(/<link[^>]+href="(css\/[^"]+)"/g)].map(m => m[1]);
    assert.ok(referenced.length > 0, 'index.html CSS referansları okunamadı');
    const precache = readPrecache();
    // Sürüm sorgusu (?v=...) cache anahtarını etkiler; yol kısmını karşılaştır.
    const missing = referenced
        .map(href => href.split('?')[0])
        .filter(file => !precache.includes(`./${file}`));
    assert.deepEqual(missing, [], `Önbellekte olmayan stil: ${missing.join(', ')}`);
});

test('manifest.webmanifest geçerli JSON', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.equal(manifest.name, 'Parnex | Kişisel Finans');
    assert.ok(manifest.short_name.length <= 12, 'short_name 12 karakteri aşmamalı');
});

test('manifest start_url ve scope göreli (localhost ve Capacitor için)', () => {
    // Mutlak yol ("/Notion_parnex/") GitHub Pages dışında kırılır:
    // localhost'ta ve Capacitor webDir altında olmayan bir scope'a işaret eder.
    const manifest = JSON.parse(read('manifest.webmanifest'));
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.id, './');
});

test('manifest ikonları diskte var', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'));
    const missing = manifest.icons
        .map(icon => icon.src)
        .filter(src => !existsSync(path.join(ROOT, src)));
    assert.deepEqual(missing, [], `Eksik ikon: ${missing.join(', ')}`);
});

test('manifest en az bir 192 ve 512 ikon içerir', () => {
    // Chrome kurulumu bu iki boyutu zorunlu koşar.
    const manifest = JSON.parse(read('manifest.webmanifest'));
    const sizes = manifest.icons.map(icon => icon.sizes);
    assert.ok(sizes.includes('192x192'), '192x192 ikon yok');
    assert.ok(sizes.includes('512x512'), '512x512 ikon yok');
});

test('manifest maskable amaçlı ikon sağlar', () => {
    // Maskable olmayan ikon Android'in dairesel maskesinde kenarları kırpar.
    const manifest = JSON.parse(read('manifest.webmanifest'));
    const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable');
    assert.ok(maskable.length >= 2, 'maskable ikon (192 + 512) gerekli');
    maskable.forEach(icon => {
        assert.ok(existsSync(path.join(ROOT, icon.src)), `maskable ikon eksik: ${icon.src}`);
    });
});

test('maskable ikonlar "any" olarak da işaretli değil', () => {
    // purpose "any maskable" tek girdide hem normal hem maskable kullanılır;
    // güvenli alanı dolu "any" ikonu maskeyle kesilince bozulur.
    const manifest = JSON.parse(read('manifest.webmanifest'));
    const combined = manifest.icons.filter(icon => icon.purpose && icon.purpose.includes(' '));
    assert.deepEqual(combined.map(i => i.src), [], 'Ayrı "any" ve "maskable" ikonları kullanın');
});

test('index.html apple-touch-icon 180px opak ikon kullanıyor', () => {
    // iOS saydam arka planlı ikonu siyah gösterir.
    const manifest = read('index.html');
    assert.match(manifest, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
    assert.ok(existsSync(path.join(ROOT, 'icons/apple-touch-icon.png')));
});

test('index.html iOS standalone meta etiketlerini içerir', () => {
    const manifest = read('index.html');
    assert.match(manifest, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(manifest, /name="apple-mobile-web-app-title" content="Parnex"/);
});

test('index.html viewport-fit=cover kullanıyor (çentikli ekran güvenli alanı)', () => {
    assert.match(read('index.html'), /viewport-fit=cover/);
});

test('js/push.js artık ayrı bir push service worker kaydetmiyor', () => {
    // Aynı scope'a ikinci worker kaydedilemez; son kayıt olan kazanır ve
    // push handler'ı sessizce kaybolur.
    const push = read('js/push.js');
    assert.match(push, /serviceWorker\.register\('sw\.js'\)/);
    assert.doesNotMatch(push, /firebase-messaging-sw\.js/);
});

test('sw.js push ve offline işlevlerinin ikisini de içerir', () => {
    const sw = read('sw.js');
    assert.match(sw, /addEventListener\('push'/);
    assert.match(sw, /addEventListener\('notificationclick'/);
    assert.match(sw, /addEventListener\('fetch'/);
    assert.match(sw, /addEventListener\('install'/);
});

test('sw.js kura API\'lerini önbelleğe almıyor', () => {
    // Kurlar bayatlanınca kullanıcı yanlış bakiye görür; her zaman ağdan çekilmeli.
    const sw = read('sw.js');
    const currencyHosts = sw.match(/const CURRENCY_HOSTS = \[([\s\S]*?)\];/);
    assert.ok(currencyHosts, 'CURRENCY_HOSTS tanımlı olmalı');
    ['open.er-api.com', 'api.gold-api.com', 'data-asg.goldprice.org'].forEach(host => {
        assert.ok(currencyHosts[1].includes(host), `CURRENCY_HOSTS içinde ${host} yok`);
    });
    // Fetch işleyicisi bu listeyi erken çıkışla atlamalı.
    assert.match(sw, /CURRENCY_HOSTS[\s\S]{0,200}return;/);
});

test('sw.js Firebase SDK\'yı install aşamasında yüklemiyor', () => {
    // importScripts install'da çağrılırsa çevrimdışı ilk kurulumda
    // gstatic'e ulaşılamadığı için worker hiç kurulamaz.
    const sw = read('sw.js');
    const installBlock = sw.match(/addEventListener\('install'[\s\S]*?\n\}\);/);
    assert.ok(installBlock, 'install işleyicisi bulunamadı');
    assert.doesNotMatch(installBlock[0], /importScripts/);
    assert.match(sw, /function loadFirebase\(\)/);
});

test('js/pwa.js yalnızca güvenli bağlamda kayıt yapıyor', () => {
    // Service worker file:// üzerinde çalışmaz; sessizce hata vermesin.
    // isSecureContext, localhost ve 127.0.0.1'i de kapsar.
    const pwa = read('js/pwa.js');
    assert.match(pwa, /if \(!window\.isSecureContext\) return;/);
});

test('js/pwa.js Capacitor native modda devre dışı', () => {
    // Native APK zaten ana ekranda; içinde ikinci bir cache katmanı gereksiz.
    const pwa = read('js/pwa.js');
    assert.match(pwa, /function isNativeApp\(\)/);
    assert.match(pwa, /if \(isNativeApp\(\)\) return;/);
});

test('js/pwa.js offline durumunu kullanıcıya bildiriyor', () => {
    const pwa = read('js/pwa.js');
    assert.match(pwa, /addEventListener\('offline'/);
    assert.match(pwa, /addEventListener\('online'/);
});

test('css/pwa.css çentikli ekran için üst güvenli alanı uygular', () => {
    // viewport-fit=cover yalnızca env() kullanımıyla anlamlıdır.
    const pwa = read('css/pwa.css');
    assert.match(pwa, /--safe-top:\s*env\(safe-area-inset-top/);
    assert.match(pwa, /\.header\s*\{[^}]*var\(--safe-top\)/);
});

test('Ayarlar sayfasında uygulama kurulum düğmesi var', () => {
    const manifest = read('index.html');
    assert.match(manifest, /id="pwaInstallBtn"/);
    assert.match(manifest, /id="pwaInstallHint"/);
});