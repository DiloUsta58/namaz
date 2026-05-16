# Namaz Öğren – WebApp

Bu klasör XAMPP `htdocs` içinde çalışacak şekilde hazırlanmış basit bir WebApp’tir.

## Çalıştırma

- XAMPP’ta Apache’yi başlat.
- Tarayıcıdan aç:
  - `http://localhost/Android_Projekte/10_NamazOgrenmek/index.html`

## GitHub Pages notu

Bu projede içerik klasörü `Namaz/` altındadır (underscore yok).

## Telefon’a yükleme (PWA)

- Android/Chrome: siteyi aç → menü → **“Ana ekrana ekle / Install app”**
- iPhone/Safari: Paylaş → **“Ana Ekrana Ekle”**

Not: Gerçek “yükle” deneyimi için HTTPS önerilir (localhost zaten çalışır). Bu projede service worker yok; offline cache yapılmaz.

## İçerik

- Tüm içerik dosyaları: `Namaz/`
- Uygulama indeksi: `content-index.json`

## İndeksi güncelleme (dosya eklediğinde)

`content-index.json` içindeki yollar otomatik oluşsun istersen:

- PowerShell:
  - `powershell -ExecutionPolicy Bypass -File .\\tools\\Generate-ContentIndex.ps1`

Not: DOCX dosyaları tarayıcıda doğrudan görüntülenmeyebilir; “Aç/İndir” ile indirip açabilirsin.

## APK (Android)

TWA (Bubblewrap) iskeleti: `C:\\xampp\\htdocs\\Android_Projekte\\10_NamazOgrenmek\\android-twa\\README.md`

Offline (WebView) APK: `C:\\xampp\\htdocs\\Android_Projekte\\10_NamazOgrenmek\\tools\\build-release.ps1 -Offline`

### Release (imzalı) APK

- Release imzalama (keystore otomatik oluşturulur):
  - `powershell -ExecutionPolicy Bypass -File .\\tools\\build-release.ps1 -Offline -ReleaseSign -AppName NamazOgren`
