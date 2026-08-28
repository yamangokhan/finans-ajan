import { AYARLAR, ASSETS, ONS_GRAM } from '../config.js';
import { getir, sleep, stdev, hata } from '../util.js';

// Yahoo hız limiti gerçek: istekler arka arkaya gidince "Connect Timeout" dönüyor.
// TÜM Yahoo istekleri (grafik + canlı fiyat) tek paylaşımlı kuyruktan geçer —
// yoksa eşzamanlı çalışan tarama ve canlı döngü birbirini boğuyor.
//
// Netlify'da kuyruk gereksiz: her fonksiyon çağrısı ayrı konteyner/IP ve
// birkaç istek atıyor. Orada seri bekleme 10 sn sınırını aşırdı.
const PARALEL_MOD = Boolean(process.env.NETLIFY) || process.env.YAHOO_PARALEL === '1';

const kuyruk = [];
let aktifIstek = 0;
let sonBaslangic = 0;

function kuyrugaAl(fn, { oncelikli = false } = {}) {
  if (PARALEL_MOD) return fn();
  return new Promise((resolve, reject) => {
    const is = { fn, resolve, reject };
    if (oncelikli) kuyruk.unshift(is);
    else kuyruk.push(is);
    kuyrukIsle();
  });
}

async function kuyrukIsle() {
  if (aktifIstek >= 1 || !kuyruk.length) return;
  const is = kuyruk.shift();
  aktifIstek++;
  try {
    const bekle = AYARLAR.istek_araligi_ms - (Date.now() - sonBaslangic);
    if (bekle > 0) await sleep(bekle);
    sonBaslangic = Date.now();
    is.resolve(await is.fn());
  } catch (e) {
    is.reject(e);
  } finally {
    aktifIstek--;
    kuyrukIsle();
  }
}

const siraliGetir = (url, opts) => kuyrugaAl(() => getir(url, {}, { deneme: 3, zamanAsimi: 20000 }), opts);

/** Yahoo chart API'sinden bar listesi çeker. */
async function chart(sembol, range, interval) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}` +
    `?range=${range}&interval=${interval}`;
  const res = await siraliGetir(url);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`${sembol}: veri yok (${j?.chart?.error?.description ?? 'bilinmeyen'})`);
  const q = r.indicators.quote[0];
  const barlar = r.timestamp
    .map((t, i) => ({ t: t * 1000, c: q.close?.[i], h: q.high?.[i], l: q.low?.[i], v: q.volume?.[i] }))
    .filter((b) => Number.isFinite(b.c));
  return { barlar, meta: r.meta };
}

// Günlük veri saatte bir tazelenir; her taramada yeniden çekmeye gerek yok.
const gunlukOnbellek = new Map(); // sembol -> { zaman, barlar }
const GUNLUK_TAZELIK_MS = 60 * 60 * 1000;

async function gunlukBarlar(sembol) {
  const kayit = gunlukOnbellek.get(sembol);
  if (kayit && Date.now() - kayit.zaman < GUNLUK_TAZELIK_MS) return kayit.barlar;
  const { barlar } = await chart(sembol, '1y', '1d');
  gunlukOnbellek.set(sembol, { zaman: Date.now(), barlar });
  return barlar;
}

/**
 * Teknik analiz geçmişi.
 *
 * ÖLÇÜLDÜ: `range=2y` isteği ~28 sn sürüyor (Yahoo boğuyor), oysa açık tarih
 * aralığı (period1/period2) 400 gün için ~0,2-1,4 sn. Ayrıca `range=1y` tam
 * 365 günü ancak kapsadığı için yıllık getiri sınırda null kalabiliyordu.
 * Bu yüzden varsayılan: açık tarih aralığıyla 400 gün.
 */
const VARSAYILAN_GUN = 400;
const uzunOnbellek = new Map();

export async function uzunBarlar(sembol, gunSayisi = VARSAYILAN_GUN) {
  // Geriye dönük uyumluluk: '1y' / '2y' gibi eski çağrılar da çalışsın
  if (typeof gunSayisi === 'string') {
    gunSayisi = { '1y': 400, '2y': 730, '6mo': 190, '3mo': 95 }[gunSayisi] ?? VARSAYILAN_GUN;
  }

  const anahtar = `${sembol}:${gunSayisi}`;
  const kayit = uzunOnbellek.get(anahtar);
  if (kayit && Date.now() - kayit.zaman < GUNLUK_TAZELIK_MS) return kayit.barlar;

  const simdi = Math.floor(Date.now() / 1000);
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sembol)}` +
    `?period1=${simdi - gunSayisi * 86400}&period2=${simdi}&interval=1d`;

  const res = await siraliGetir(url);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r?.timestamp) {
    throw new Error(`${sembol}: veri yok (${j?.chart?.error?.description ?? 'bilinmeyen'})`);
  }
  const q = r.indicators.quote[0];
  const barlar = r.timestamp
    .map((t, i) => ({ t: t * 1000, c: q.close?.[i], h: q.high?.[i], l: q.low?.[i], v: q.volume?.[i] }))
    .filter((b) => Number.isFinite(b.c));

  uzunOnbellek.set(anahtar, { zaman: Date.now(), barlar });
  return barlar;
}

export { chart };

function degisim(sonra, once) {
  if (!Number.isFinite(sonra) || !Number.isFinite(once) || once === 0) return NaN;
  return (sonra / once - 1) * 100;
}

/** N gün önceki kapanışa göre değişim. */
function gunOncesineGore(gunluk, gunSayisi, son) {
  const hedef = Date.now() - gunSayisi * 24 * 3600 * 1000;
  // hedef tarihe en yakın (ondan önceki) barı bul
  let aday = null;
  for (const b of gunluk) {
    if (b.t <= hedef) aday = b;
    else break;
  }
  return aday ? degisim(son, aday.c) : NaN;
}

/**
 * Tek bir varlığın tam görüntüsü:
 * fiyat, 30dk hareketi + z-skoru, gün/hafta/ay/yıl değişimi, 30 günlük ortalamaya uzaklık.
 */
export async function varlikOku(asset) {
  const { barlar: ic } = await chart(asset.sembol, '5d', '15m'); // ~5 günlük 15dk barlar
  const gunluk = await gunlukBarlar(asset.sembol);

  if (ic.length < 6) throw new Error(`${asset.ad}: yetersiz gün içi veri`);

  const son = ic.at(-1).c;

  // 30 dakikalık hareket = 2 bar geri
  const otuzDk = degisim(son, ic.at(-3)?.c);
  // 2 saatlik hareket = 8 bar geri
  const ikiSaat = degisim(son, ic.at(-9)?.c);

  // Baz oynaklık: son 5 gündeki tüm 30 dakikalık getirilerin standart sapması.
  const otuzDkGetiriler = [];
  for (let i = 2; i < ic.length; i++) otuzDkGetiriler.push(degisim(ic[i].c, ic[i - 2].c));
  const sigma = stdev(otuzDkGetiriler);
  const z = Number.isFinite(sigma) && sigma > 0 ? otuzDk / sigma : NaN;

  // Gün değişimi: dünkü kapanışa göre (gün içi ilk bardan daha güvenilir)
  const dunku = gunluk.length >= 2 ? gunluk.at(-2).c : NaN;
  const gun = degisim(son, dunku);

  // 30 günlük basit ortalamaya uzaklık — "dip mi tepe mi" için kaba ama işe yarar gösterge
  const son30 = gunluk.slice(-30).map((b) => b.c);
  const ort30 = son30.length ? son30.reduce((a, b) => a + b, 0) / son30.length : NaN;
  const ort30Fark = degisim(son, ort30);

  return {
    key: asset.key,
    ad: asset.ad,
    grup: asset.grup,
    birim: asset.birim,
    fiyat: son,
    otuzDk,
    ikiSaat,
    z,
    sigma,
    gun,
    hafta: gunOncesineGore(gunluk, 7, son),
    ay: gunOncesineGore(gunluk, 30, son),
    ucAy: gunOncesineGore(gunluk, 90, son),
    yil: gunOncesineGore(gunluk, 365, son),
    ort30Fark,
    zaman: ic.at(-1).t,
  };
}

/** Yahoo spark uç noktasının tek istekte kabul ettiği azami sembol sayısı (ölçüldü). */
export const SPARK_AZAMI = 18;

/**
 * CANLI FİYATLAR — tek istekte tüm semboller.
 * Yahoo'nun spark uç noktası toplu sorguyu destekliyor (v7/quote artık 401 veriyor).
 * Ağır teknik analizden ayrı: bu saniyeler içinde döner, sık çağrılabilir.
 */
export async function canliFiyatlar(semboller) {
  const url =
    'https://query1.finance.yahoo.com/v7/finance/spark' +
    `?symbols=${encodeURIComponent(semboller.join(','))}&range=1d&interval=5m`;

  // Yahoo spark uç noktası tek istekte EN FAZLA 20 sembol kabul eder;
  // fazlası "Bad Request" döner. Çağıran tarafın buna uyması gerekir.
  if (semboller.length > SPARK_AZAMI) {
    throw new Error(`spark en fazla ${SPARK_AZAMI} sembol kabul eder (${semboller.length} verildi)`);
  }

  // Öncelikli: canlı fiyat, arka plandaki toplu taramanın arkasında beklemesin
  const res = await siraliGetir(url, { oncelikli: true });
  const j = await res.json();

  // Hatayı sessizce yutma — boş sonuç döndürmek teşhisi imkânsızlaştırıyor
  if (j?.spark?.error) {
    throw new Error(`Yahoo spark: ${j.spark.error.description ?? j.spark.error.code}`);
  }

  const sonuc = {};

  for (const r of j?.spark?.result ?? []) {
    const yanit = r.response?.[0];
    const meta = yanit?.meta;
    if (!meta) continue;

    const fiyat = meta.regularMarketPrice;
    const oncekiKapanis = meta.previousClose ?? meta.chartPreviousClose;
    if (!Number.isFinite(fiyat)) continue;

    // Gün içi seri (mini grafik ve kısa vadeli hareket için)
    const kapanislar = (yanit.indicators?.quote?.[0]?.close ?? []).filter(Number.isFinite);

    sonuc[r.symbol] = {
      sembol: r.symbol,
      fiyat,
      oncekiKapanis: Number.isFinite(oncekiKapanis) ? oncekiKapanis : null,
      gun: Number.isFinite(oncekiKapanis) && oncekiKapanis !== 0
        ? (fiyat / oncekiKapanis - 1) * 100
        : null,
      // son ~2 saatlik hareket (24 x 5dk bar)
      ikiSaat: kapanislar.length > 24
        ? (fiyat / kapanislar[kapanislar.length - 25] - 1) * 100
        : null,
      seri: kapanislar.slice(-60),
      birim: meta.currency ?? null,
      piyasaAcik: meta.marketState ? meta.marketState === 'REGULAR' : null,
      zaman: Date.now(),
    };
  }

  return sonuc;
}

/** TCMB resmî kuru (efektif satış). Anahtarsız, güvenilir. */
export async function tcmbKur() {
  try {
    const res = await getir('https://www.tcmb.gov.tr/kurlar/today.xml');
    const t = await res.text();
    const al = (kod) => {
      const m = t.match(new RegExp(`<Currency[^>]*Kod="${kod}"[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>`));
      return m ? Number(m[1]) : NaN;
    };
    return { usd: al('USD'), eur: al('EUR'), kaynak: 'TCMB' };
  } catch (e) {
    hata('TCMB kuru alınamadı:', e.message);
    return null;
  }
}

/** Tüm varlıkları sırayla tarar; biri patlarsa diğerleri devam eder. */
export async function piyasayiTara() {
  const sonuc = {};
  for (const asset of ASSETS) {
    try {
      sonuc[asset.key] = await varlikOku(asset);
    } catch (e) {
      hata(`${asset.ad} okunamadı:`, e.message);
    }
  }

  // Gram altını türet: ons altın (USD) x USD/TRY / 31.1034768
  const ons = sonuc.ons_altin;
  const kur = sonuc.usdtry;
  if (ons && kur) {
    const carpan = kur.fiyat / ONS_GRAM;
    sonuc.gram_altin = {
      key: 'gram_altin',
      ad: 'Gram Altın',
      grup: 'metal',
      birim: 'TL',
      fiyat: ons.fiyat * carpan,
      // Gram altın = ons x kur olduğundan yüzde değişimler yaklaşık olarak toplanır
      otuzDk: ons.otuzDk + kur.otuzDk,
      ikiSaat: ons.ikiSaat + kur.ikiSaat,
      z: NaN,
      gun: ons.gun + kur.gun,
      hafta: ons.hafta + kur.hafta,
      ay: ons.ay + kur.ay,
      ucAy: ons.ucAy + kur.ucAy,
      yil: ons.yil + kur.yil,
      ort30Fark: NaN,
      turetilmis: true,
      zaman: ons.zaman,
    };
  }

  return sonuc;
}
