import WebSocket from 'ws';
import { hata, log } from '../util.js';

/**
 * HAREM ALTIN — Türkiye'nin fiili altın/döviz piyasa fiyatları.
 *
 * Neden bu kaynak: Yahoo'dan türettiğim gram altın teorik "spot" değerdir;
 * Harem ise GERÇEK alış/satış fiyatlarını verir. Aradaki fark önemli —
 * ölçüldü: sentetik 6.984 TL iken piyasa satışı 6.893 TL.
 * Ayrıca çeyrek/yarım/tam/ata/gremse gibi fiilen alınıp satılan ürünler
 * ve her birinin MAKASI (alış-satış farkı) burada.
 *
 * Teknik: fiyatlar yalnızca socket.io WebSocket'inden akıyor.
 * HTTP polling transportu sunucu tarafından reddediliyor ("Transport unknown"),
 * sayfa HTML'inde de gömülü fiyat yok — bu yüzden WebSocket şart.
 *
 * Nezaket kuralı: bu, sitenin kendi herkese açık canlı beslemesi (kimlik
 * doğrulama yok). Tek bağlantı yeter, veri zaten push ediliyor; sürekli
 * yeniden bağlanarak yormayın. Kişisel kullanım içindir.
 */

const SOKET =
  'wss://hrmsocketonly.haremaltin.com/socket.io/?EIO=4&transport=websocket';

const BASLIKLAR = {
  Origin: 'https://www.haremaltin.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/** Panelde göstereceğimiz ürünler ve okunabilir adları. */
export const URUNLER = {
  ALTIN:        { ad: 'Gram Altın',      grup: 'altin', sira: 1 },
  KULCEALTIN:   { ad: 'Külçe Altın',     grup: 'altin', sira: 2 },
  CEYREK_YENI:  { ad: 'Çeyrek (yeni)',   grup: 'altin', sira: 3 },
  CEYREK_ESKI:  { ad: 'Çeyrek (eski)',   grup: 'altin', sira: 4 },
  YARIM_YENI:   { ad: 'Yarım (yeni)',    grup: 'altin', sira: 5 },
  YARIM_ESKI:   { ad: 'Yarım (eski)',    grup: 'altin', sira: 6 },
  TEK_YENI:     { ad: 'Tam (yeni)',      grup: 'altin', sira: 7 },
  TEK_ESKI:     { ad: 'Tam (eski)',      grup: 'altin', sira: 8 },
  ATA_YENI:     { ad: 'Ata Lira (yeni)', grup: 'altin', sira: 9 },
  ATA_ESKI:     { ad: 'Ata Lira (eski)', grup: 'altin', sira: 10 },
  ATA5_YENI:    { ad: 'Ata 5\'li (yeni)', grup: 'altin', sira: 11 },
  GREMESE_YENI: { ad: 'Gremse (yeni)',   grup: 'altin', sira: 12 },
  AYAR22:       { ad: '22 Ayar Bilezik', grup: 'altin', sira: 13 },
  AYAR14:       { ad: '14 Ayar',         grup: 'altin', sira: 14 },
  ONS:          { ad: 'Ons Altın',       grup: 'altin', sira: 15, birim: 'USD' },

  USDTRY:       { ad: 'Dolar',           grup: 'doviz', sira: 1 },
  EURTRY:       { ad: 'Euro',            grup: 'doviz', sira: 2 },
  GBPTRY:       { ad: 'Sterlin',         grup: 'doviz', sira: 3 },
  CHFTRY:       { ad: 'İsviçre Frangı',  grup: 'doviz', sira: 4 },
  SARTRY:       { ad: 'Suudi Riyali',    grup: 'doviz', sira: 5 },

  GUMUSTRY:     { ad: 'Gümüş (gram)',    grup: 'diger', sira: 1 },
  XAGUSD:       { ad: 'Gümüş (ons)',     grup: 'diger', sira: 2, birim: 'USD' },
  PLATIN:       { ad: 'Platin',          grup: 'diger', sira: 3 },
  PALADYUM:     { ad: 'Paladyum',        grup: 'diger', sira: 4 },
};

const sayi = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Tek seferlik fiyat çekimi: bağlan, ilk fiyat paketini al, kapat.
 * Netlify fonksiyonları ve tek atımlık tarama için uygundur (~1-2 sn).
 */
export function haremFiyatlari({ zamanAsimi = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let ws;
    let bitti = false;

    const kapat = (sonuc, err) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(sayac);
      try { ws?.close(); } catch { /* zaten kapalı */ }
      err ? reject(err) : resolve(sonuc);
    };

    const sayac = setTimeout(
      () => kapat(null, new Error('Harem: zaman aşımı, fiyat paketi gelmedi')),
      zamanAsimi,
    );

    try {
      ws = new WebSocket(SOKET, { headers: BASLIKLAR });
    } catch (e) {
      return kapat(null, e);
    }

    // socket.io v4 el sıkışması: "40" ile varsayılan namespace'e katıl
    ws.on('open', () => ws.send('40'));

    ws.on('message', (ham) => {
      const s = ham.toString();
      if (!s.startsWith('42')) return; // 0=açılış, 40=namespace, 2/3=ping/pong

      let olay, govde;
      try { [olay, govde] = JSON.parse(s.slice(2)); } catch { return; }
      if (olay !== 'price_changed' || !govde?.data) return;

      kapat(donustur(govde.data));
    });

    ws.on('error', (e) => kapat(null, e));
    ws.on('close', () => kapat(null, new Error('Harem: bağlantı veri gelmeden kapandı')));
  });
}

/** Ham socket verisini panelin kullandığı biçime çevirir. */
function donustur(veri) {
  const sonuc = {};

  for (const [kod, tanim] of Object.entries(URUNLER)) {
    const v = veri[kod];
    if (!v) continue;

    const alis = sayi(v.alis);
    const satis = sayi(v.satis);
    if (!alis || !satis || satis <= 0) continue; // fiyatı olmayan ürünü gösterme

    // NOT: gelen veride bir `kapanis` alanı var ama "dünkü kapanış" DEĞİL.
    // Doğrulandı: USDTRY kapanis=44,675, güncel=48,15 -> %7,8 fark. Oysa doların
    // günlük hareketi %0,5, yıllık %17,5. Yani bu alan başka bir referans
    // (muhtemelen yıl başı). Ne olduğu kesinleşmeden "günlük değişim" diye
    // göstermek yanlış olurdu — günlük değişimi Yahoo'dan alıyoruz.
    // Buradan sadece anlamı kesin olan alanları kullanıyoruz.

    sonuc[kod] = {
      kod,
      ad: tanim.ad,
      grup: tanim.grup,
      sira: tanim.sira,
      birim: tanim.birim ?? 'TRY',
      alis,
      satis,
      // MAKAS: alıp hemen geri satsan kaybedeceğin yüzde. Yatırımcının en çok
      // gözden kaçırdığı maliyet — bu yüzden birinci sınıf veri olarak duruyor.
      makas: Number((((satis / alis) - 1) * 100).toFixed(2)),
      gunDusuk: sayi(v.dusuk),
      gunYuksek: sayi(v.yuksek),
      yon: v.dir?.satis_dir ?? null,   // 'up' | 'down' — son fiyat hareketinin yönü
      tarih: v.tarih ?? null,
    };
  }

  return sonuc;
}

/**
 * Sunucu için kalıcı bağlantı: soket zaten push ediyor, sürekli yeniden
 * bağlanmak yerine tek bağlantıyı açık tutup son fiyatı bellekte tutarız.
 */
export function haremAkis({ onGuncelleme } = {}) {
  let ws = null;
  let sonVeri = null;
  let sonZaman = null;
  let kapaniyor = false;
  let yenidenDeneme = 0;

  const bagla = () => {
    if (kapaniyor) return;
    try {
      ws = new WebSocket(SOKET, { headers: BASLIKLAR });
    } catch (e) {
      return planla(e.message);
    }

    ws.on('open', () => {
      yenidenDeneme = 0;
      ws.send('40');
      log('Harem Altın akışı bağlandı');
    });

    ws.on('message', (ham) => {
      const s = ham.toString();
      if (s === '2') return ws.send('3'); // ping -> pong, bağlantı düşmesin
      if (!s.startsWith('42')) return;
      try {
        const [olay, govde] = JSON.parse(s.slice(2));
        if (olay !== 'price_changed' || !govde?.data) return;
        sonVeri = donustur(govde.data);
        sonZaman = Date.now();
        onGuncelleme?.(sonVeri);
      } catch { /* bozuk paket, atla */ }
    });

    ws.on('error', (e) => hata('Harem soket:', e.message));
    ws.on('close', () => planla('bağlantı kapandı'));
  };

  const planla = (sebep) => {
    if (kapaniyor) return;
    // Üstel geri çekilme, en fazla 60 sn — sunucuyu yormayalım
    const bekle = Math.min(60000, 3000 * 2 ** yenidenDeneme++);
    hata(`Harem yeniden bağlanacak (${sebep}), ${Math.round(bekle / 1000)} sn sonra`);
    setTimeout(bagla, bekle);
  };

  bagla();

  return {
    veri: () => sonVeri,
    zaman: () => sonZaman,
    kapat: () => { kapaniyor = true; try { ws?.close(); } catch {} },
  };
}
