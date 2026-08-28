# Finans Ajanı

7/24 çalışan piyasa gözcüsü. Anormal fiyat hareketlerini yakalar, haber akışıyla eşleştirir,
sebebini açıklayan bir bilgi notu üretir ve Telegram'dan gönderir.

**Ne yapar:**
- 11 varlığı 5 dakikada bir tarar (altın, gümüş, USD/TRY, EUR/TRY, BIST100/30, Brent, DXY, VIX, S&P500, Bitcoin + türetilmiş gram altın)
- Her varlığın **kendi normaline göre** anormal hareketi tespit eder (z-skor) — altın için %1 serttir, Bitcoin için sıradan
- Aynı anda 2+ varlık oynadığında bunu **rejim hareketi** olarak işaretler ve önceliği yükseltir
- 7 haber kaynağını tarar, hareketin saatiyle örtüşen başlıkları puanlar
- Claude'a hareketi + çapraz varlık tablosunu + haberleri verip yapılandırılmış bilgi notu ürettirir
- Takvimi belli olayları (TÜFE, tarım dışı istihdam) öncesinden hatırlatır
- Her sabah 09:00'da panorama gönderir

**Ne yapmaz (bilerek):**
- Fiyat tahmini yapmaz. "Yarın altın şu olur" diyen sistem yalan söyler.
- Al/sat sinyali vermez. Ne olduğunu ve neden olmuş olabileceğini söyler.
- Planlanmamış olayları (tweet, savaş) önceden bilmez — kimse bilemez. Takvimi belli
  olayları önceden hatırlatır, plansız olanlara 15 dakikada tepki verir.

---

## Kurulum

```bash
cd C:\Users\Habibe\Desktop\FinansAjan
npm install
```

`.env` dosyası hazır; Telegram tarafı dolu. Eksik olan tek şey:

```
ANTHROPIC_API_KEY=      # console.anthropic.com -> API Keys
```

Bu anahtar olmadan da bot çalışır — hareketi ve ilgili haber başlıklarını gönderir,
sadece yorumlanmış analiz notunu üretemez.

### Doğrulama

```bash
npm run test-veri     # tüm veri kaynaklarını sırayla dener, sonucu ekrana basar
npm run panorama      # Telegram'a tek seferlik panorama gönderir
npm run tek-tur       # bir tam tarama yapar (panorama + takvim + anomali)
```

---

## Panel (görsel arayüz)

```bash
npm run panel         # → http://localhost:7333
```

Tek ekranda: makro varlıklar (fiyat, değişim, mini grafik, teknik özet), tıklanabilir
teknik detay (indikatör indikatör döküm + ibreli gösterge), BIST tarayıcısı
(sıralanabilir tablo, 6 hazır sekme), haber akışı ve yaklaşan olaylar.
Veri arka planda 30 dakikada bir tazelenir; "Yenile" ile elle tetiklenir.

Konsol raporu isteyen için:

```bash
npm run rapor         # aynı analizin terminal tablosu
```

### Teknik özet nasıl hesaplanıyor?

TradingView metodolojisi: **12 hareketli ortalama** (SMA ve EMA; 10/20/30/50/100/200) +
**7 osilatör** (RSI 14, MACD 12-26-9, Stochastic 14-3-3, CCI 20, ADX 14, Williams %R 14,
Momentum 10). Her gösterge Al (+1) / Nötr (0) / Sat (−1) oyu verir; ortalama puan
−1 ile +1 arasında bir etikete çevrilir:

| Puan | Etiket |
|---|---|
| ≥ +0,5 | GÜÇLÜ AL |
| +0,1 … +0,5 | AL |
| −0,1 … +0,1 | NÖTR |
| −0,5 … −0,1 | SAT |
| ≤ −0,5 | GÜÇLÜ SAT |

**Bunun ne olmadığı önemli:** fiyat tahmini değil. "Şu anda momentum ne durumda"
sorusunun mekanik cevabıdır. Yapısı gereği geriden gelir ve trendsiz (yatay)
piyasada sık sık yön değiştirir — bu yüzden panelde ADX (trend gücü) hep yanında
gösterilir: **ADX 20'nin altındaysa Al/Sat sinyalleri güvenilmezdir.**

### Panelin özellikle işe yarayan tarafı: fiyat + hacim birlikte

"Hacim / Ort" sütunu, o günkü işlem hacminin son 60 günlük ortalamaya oranıdır.
Aynı yükselişin iki farklı anlamı olabilir:

- **+%10 ama hacim 0,34x** → hareket teyitsiz, az katılımlı
- **+%4 ama hacim 3,02x** → hareket hacimle teyitli

Hiçbir "GÜÇLÜ AL" etiketi bunu tek başına söylemez. Sıralamak için sütun başlığına tıkla.

### Renk erişilebilirliği

Yeşil/kırmızı çifti kırmızı-yeşil renk körlüğünde ayırt edilemez (ölçüldü: deuteranopi
altında ΔE 4,1). Bu yüzden panelde renk **hiçbir yerde tek taşıyıcı değildir** — her
değerde işaret (+/−), yön oku (▲/▼) ve yazılı etiket vardır; teknik puan ayrıca ibrenin
açısı olarak da kodlanır.

### Sürekli çalıştırma

```bash
npm start
```

Terminal açık kaldığı sürece çalışır. Bilgisayar kapanınca durur.

**Windows'ta arka planda 7/24:**

```powershell
npm install -g pm2
pm2 start src/index.js --name finans-ajan
pm2 save
pm2 startup   # çıktıdaki komutu yönetici PowerShell'de çalıştır
```

Bilgisayarını sürekli açık tutmak istemiyorsan bir VPS'e taşımak gerekir
(Oracle Cloud ücretsiz katmanı veya ~5$/ay bir sunucu yeter).

---

## Telegram komutları

| Komut | Ne yapar |
|---|---|
| `/durum` | Anlık panorama — tüm varlıklar, gün/hafta/ay/yıl değişimi |
| `/takvim` | Önümüzdeki 14 günün olayları |
| `/tara` | Hemen bir tarama yap (test için) |
| `/yardim` | Komut listesi |

---

## Ayarlar

`src/config.js`:

- **`ASSETS`** — takip edilen varlıklar ve eşikleri. `esik.z` kaç standart sapmalık
  30 dakikalık hareket "anormal" sayılsın; `esik.gun` gün içi yüzde eşiği.
  Bir BIST hissesi eklemek için: `{ key: 'thyao', ad: 'THY', sembol: 'THYAO.IS', ... }`
- **`FEEDS`** — haber kaynakları. Google News satırlarındaki `q=` parametresini
  değiştirerek istediğin konuyu takip ettirebilirsin.
- **`AYARLAR.tarama_saniye`** — tarama sıklığı (varsayılan 300 sn).
- **`AYARLAR.gunluk_bildirim_limiti`** — günde en fazla kaç normal bildirim (varsayılan 12).
  Kritik olanlar bu limite takılmaz.
- **`AYARLAR.panorama_saati`** — günlük özet saati (varsayılan 09:00).

`.env` içindeki `SESSIZ_BASLANGIC` / `SESSIZ_BITIS` arasında sadece kritik bildirim gider.

### Takvim

`data/calendar.json`. İki bölüm var:

- **`tekrarlayan`** — kurallı olaylar, otomatik hesaplanır (`ayin-gunu:3`, `ayin-ilk-cuma`).
  TÜİK enflasyonu ve ABD tarım dışı istihdam hazır girili.
- **`planli`** — tarihi her yıl değişen olaylar. **Uydurma tarih koymadım**, kendin
  doğrulayıp gireceksin:
  - TCMB PPK: `tcmb.gov.tr` → Para Politikası → PPK Toplantı Takvimi
  - Fed FOMC: `federalreserve.gov/monetarypolicy/fomccalendars.htm`
  - ABD TÜFE: `bls.gov/schedule/news_release/cpi.htm`

  Biçim: `{ "id": "fomc-eylul", "ad": "Fed Faiz Kararı", "tarih": "2026-09-16T21:00:00+03:00", "etkiler": ["ons_altin","dxy"], "onem": "kritik", "not": "..." }`

---

## Veri kaynakları — durum

| Kaynak | Durum | Not |
|---|---|---|
| Yahoo Finance | ✅ Çalışıyor | Hisse, emtia, kur, endeks. Hız limiti var — istekler 1,5 sn aralıklı gider |
| TCMB günlük kur | ✅ Çalışıyor | Resmî kur, anahtarsız |
| Google News / CNBC / MarketWatch / AA / Investing RSS | ✅ Çalışıyor | ~80-100 başlık/tarama |
| TCMB EVDS (enflasyon, politika faizi) | ⏳ Anahtar gerekli | evds2.tcmb.gov.tr'den ücretsiz kayıt |
| TEFAS (fonlar) | ❌ WAF korumalı | Düz HTTP ile çekilemiyor, tarayıcı otomasyonu gerekiyor (Faz 2) |
| KAP (halka arz) | ❌ Endpoint bulunamadı | Site Next.js'e geçmiş, devtools'tan doğru adres yakalanacak (Faz 2) |

---

## Telefona kurmak (PWA)

Panel kurulabilir bir uygulamadır: ana ekrana ikon, tam ekran, çevrimdışı açılış.

### Seçenek A — Netlify (önerilen, ücretsiz)

**Neden gerekli:** PWA yalnızca **HTTPS** üzerinde kurulabilir. `192.168.1.104:7333`
gibi düz HTTP adreste service worker çalışmaz, telefona kurulmaz. Netlify ücretsiz
HTTPS verir ve bu sorunu çözer.

```bash
git init && git add -A && git commit -m "finans ajani"
# GitHub'a push et, sonra Netlify'da "Add new site > Import an existing project"
```

Netlify ayarları `netlify.toml` içinde hazır — yayın klasörü `public`, fonksiyonlar
`netlify/functions`. Ek yapılandırma gerekmiyor.

Deploy sonrası telefonda siteyi aç → Chrome menüsü → **"Ana ekrana ekle"**.

**Netlify'da ne çalışır / ne çalışmaz:**

| | Durum |
|---|---|
| Panel, canlı fiyatlar, teknik analiz, haberler | ✅ Çalışır |
| Telegram botu (7/24 izleme, anlık uyarı) | ❌ Çalışmaz — Netlify sürekli çalışan süreç barındırmaz |

### Seçenek B — Aynı Wi-Fi (kurulum yok, hemen)

```bash
npm run panel
```

Sunucu başlarken telefondan erişilecek adresi yazar (ör. `http://192.168.1.104:7333`).
Tarayıcıda açılır ve çalışır — ama **HTTPS olmadığı için ana ekrana kurulamaz**,
sekme olarak kalır. Bilgisayar açıkken ve aynı Wi-Fi'dayken geçerlidir.

Windows Güvenlik Duvarı sorarsa "Özel ağlarda izin ver" de.

### Android APK

Netlify'a deploy ettikten sonra PWA'yı APK'ya çevirmek mümkün
([Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) ile TWA paketi).
Bunun ön koşulu **public HTTPS adres**tir — yani önce Netlify adımı yapılmalı.
Android Studio ve JDK zaten kurulu olduğu için araç zinciri hazır.

---

## Botu ücretsiz 7/24 çalıştırmak

Panel Netlify'da barınır ama bot sürekli çalışan bir süreç ister. İki ücretsiz yol:

### GitHub Actions (kolay, 5 dakikada bir)

`.github/workflows/bot.yml` hazır. Kurulum:

1. Depoyu GitHub'a **public** olarak yükle (public repo = sınırsız Actions dakikası;
   private'ta ücretsiz kota aylık 2000 dakika ve 5 dakikalık cron bunu aşar)
2. Repo → Settings → Secrets and variables → Actions → şu üçünü ekle:
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`
3. Actions sekmesinden iş akışını etkinleştir

> ⚠️ **Dürüst uyarı.** GitHub dokümanı açıkça şunu söylüyor: zamanlanmış işler
> yoğunluk anlarında gecikebilir ve **"yoğun saatler her saatin başıdır"**.
> Fed ve TCMB kararları da tam `:00`'da açıklanır — yani en kritik anda 10–15 dakika
> geç kalabilirsin. Ayrıca public repoda **60 gün hareketsizlik** olursa zamanlanmış
> iş otomatik devre dışı kalır.
>
> `.env` dosyası `.gitignore`'da — token'lar repoya girmez, GitHub Secrets'ta durur.

### Oracle Cloud Always Free (daha iyi, biraz zahmetli)

Gerçek bir VPS, süresiz ücretsiz (ARM Ampere). Gecikme yok, saniyelik tarama yapar,
Telegram komutları anında yanıtlanır. Kurulumu: hesap aç → ARM instance oluştur →
SSH ile bağlan → repoyu klonla → `pm2 start src/index.js`.

| | GitHub Actions | Oracle Free VPS | Kendi bilgisayarın |
|---|---|---|---|
| Ücret | Ücretsiz | Ücretsiz | Ücretsiz |
| Tarama sıklığı | 5 dk (gecikebilir) | Saniyelik | Saniyelik |
| Bilgisayar kapalıyken | ✅ Çalışır | ✅ Çalışır | ❌ Durur |
| Telegram komutları | ❌ (sadece cron) | ✅ Anında | ✅ Anında |
| Kurulum zahmeti | Düşük | Orta | Yok |

---

## Öğrenilen teknik kısıtlar

Bunlar deneyerek ölçüldü, tahmin değil — kodda da yorum olarak duruyor:

| Kısıt | Ölçüm | Nasıl çözüldü |
|---|---|---|
| Yahoo `2y` isteği çok yavaş | 27,8 sn vs `1y` 0,2 sn | Her yerde `1y` (255 bar, SMA 200'e yeter) |
| Yahoo toplu fiyat sınırı | 20 sembolde `Bad Request` | Parça boyutu 18 |
| Yahoo hız limiti birikimli | Aşırı istekten sonra timeout, ~90 sn'de düzelir | Tek paylaşımlı sıralı kuyruk + CDN önbelleği |
| Netlify zamanlanmış görev | Minimum **saatte bir** | Bot Netlify'da değil, Actions/VPS'te |
| Service worker | HTTPS zorunlu | PWA kurulumu için Netlify şart |

---

## Yol haritası

- **Faz 2** — TEFAS fon radarı (günde 1 kez tarayıcı oturumuyla), KAP halka arz takvimi,
  EVDS ile gerçek enflasyon → **reel getiri** hesabı
- **Faz 3** — Portföy takibi, hedef dağılım ve sapma uyarısı (rebalance alarmı)
- **Faz 4** — Karar günlüğü: her alım/satımda "neden?" sorusu, 3 ay sonra davranış raporu
- **Faz 5** — Kullanıcı tanımlı kural motoru (`/kural gram altın 30 günlük ortalamanın %7 altına inerse`)

---

## Maliyet

- Veri kaynakları: **ücretsiz**
- Telegram: **ücretsiz**
- Claude API: sadece anomali tetiklendiğinde çağrılır. Sistem prompt'u önbelleğe alınır
  (tekrar eden isteklerde ~%90 ucuz). Günde 5-10 bildirim varsayımıyla aylık maliyet düşük;
  `src/analyst.js` içindeki `effort: 'medium'` ayarını `low` yaparak daha da düşürebilirsin.

---

## Sorumluluk reddi

Bu araç kişisel kullanım içindir. Ürettiği hiçbir çıktı yatırım tavsiyesi değildir,
öyle yorumlanamaz. Yatırım kararlarının sorumluluğu tamamen sana aittir.
