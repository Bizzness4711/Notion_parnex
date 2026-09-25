import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bizzness4711.parnex',
  appName: 'Parnex',
  // www/ sadece yedek (offline) sayfa tutar; uygulama asagidaki server.url'u yukler.
  webDir: 'www',
  server: {
    // Canli site WebView icinde yuklenir; sunucu/kod degisikligi yapmadan guncel kalir.
    url: 'https://bizzness4711.github.io/Notion_parnex/',
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
