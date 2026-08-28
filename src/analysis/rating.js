import {
  sma, ema, rsi, macd, stochastic, cci, williamsR, momentum, adx,
  bollinger, oynaklik, maxDusus,
} from './indicators.js';

// TradingView'ın teknik özet metodolojisi:
// 12 hareketli ortalama + 7 osilatör, her biri Al(+1) / Nötr(0) / Sat(-1) oyu verir.
// Ortalama puan -1 ile +1 arasında; eşiklere göre etikete çevrilir.
//
// ÖNEMLİ: Bu bir TAHMİN DEĞİL. "Şu anda momentum ne durumda" sorusunun mekanik cevabı.
// Yapısı gereği geriden gelir ve yatay piyasada sık yön değiştirir.

const MA_PERIYOTLARI = [10, 20, 30, 50, 100, 200];

function etiketle(puan) {
  if (puan >= 0.5) return { etiket: 'GÜÇLÜ AL', renk: '#0ea86b', kod: 'guclu_al' };
  if (puan >= 0.1) return { etiket: 'AL', renk: '#3fb27f', kod: 'al' };
  if (puan > -0.1) return { etiket: 'NÖTR', renk: '#8b93a7', kod: 'notr' };
  if (puan > -0.5) return { etiket: 'SAT', renk: '#e0654f', kod: 'sat' };
  return { etiket: 'GÜÇLÜ SAT', renk: '#d13b28', kod: 'guclu_sat' };
}

const OY = { al: 1, notr: 0, sat: -1 };
const oyAdi = { 1: 'Al', 0: 'Nötr', '-1': 'Sat' };

/** Son iki geçerli değerden yön: yükseliyor mu? */
function yukseliyor(dizi) {
  const son = dizi.at(-1);
  const onceki = dizi.at(-2);
  if (!Number.isFinite(son) || !Number.isFinite(onceki)) return null;
  return son > onceki;
}

/**
 * Bir varlığın günlük barlarından tam teknik özet çıkarır.
 * @param {{c:number,h:number,l:number,v:number,t:number}[]} barlar - en az 200 bar önerilir
 */
export function teknikOzet(barlar) {
  const kapanis = barlar.map((b) => b.c);
  const yuksek = barlar.map((b) => b.h ?? b.c);
  const dusuk = barlar.map((b) => b.l ?? b.c);
  const fiyat = kapanis.at(-1);

  if (kapanis.length < 35) {
    return { yeterliVeri: false, barSayisi: kapanis.length };
  }

  // --- Hareketli ortalamalar ---
  const maSatirlari = [];
  for (const n of MA_PERIYOTLARI) {
    if (kapanis.length < n) continue; // 200 günlük yoksa atla, uydurma
    for (const [tur, fn] of [['SMA', sma], ['EMA', ema]]) {
      const deger = fn(kapanis, n).at(-1);
      if (!Number.isFinite(deger)) continue;
      const oy = fiyat > deger ? OY.al : fiyat < deger ? OY.sat : OY.notr;
      maSatirlari.push({
        ad: `${tur} ${n}`,
        deger: Number(deger.toFixed(4)),
        oy,
        oyAdi: oyAdi[oy],
      });
    }
  }

  // --- Osilatörler ---
  const osSatirlari = [];
  const ekle = (ad, deger, oy, aciklama) =>
    osSatirlari.push({
      ad,
      deger: Number.isFinite(deger) ? Number(deger.toFixed(2)) : null,
      oy,
      oyAdi: oyAdi[oy],
      aciklama,
    });

  // RSI(14): aşırı satım + yükseliyorsa Al, aşırı alım + düşüyorsa Sat
  const rsiDizi = rsi(kapanis, 14);
  const rsiSon = rsiDizi.at(-1);
  const rsiYon = yukseliyor(rsiDizi);
  ekle(
    'RSI (14)', rsiSon,
    rsiSon < 30 && rsiYon === true ? OY.al : rsiSon > 70 && rsiYon === false ? OY.sat : OY.notr,
    rsiSon < 30 ? 'aşırı satım bölgesi' : rsiSon > 70 ? 'aşırı alım bölgesi' : 'nötr bölge',
  );

  // MACD(12,26,9): çizgi sinyalin üstündeyse Al
  const m = macd(kapanis);
  const macdSon = m.cizgi.at(-1);
  const macdSinyal = m.sinyal.at(-1);
  ekle(
    'MACD (12,26,9)', macdSon,
    Number.isFinite(macdSon) && Number.isFinite(macdSinyal)
      ? macdSon > macdSinyal ? OY.al : macdSon < macdSinyal ? OY.sat : OY.notr
      : OY.notr,
    Number.isFinite(macdSinyal) ? `sinyal ${macdSinyal.toFixed(2)}` : '',
  );

  // Stochastic(14,3,3)
  const st = stochastic(yuksek, dusuk, kapanis);
  const stK = st.k.at(-1);
  const stD = st.d.at(-1);
  ekle(
    'Stochastic %K (14,3,3)', stK,
    Number.isFinite(stK) && Number.isFinite(stD)
      ? stK < 20 && stK > stD ? OY.al : stK > 80 && stK < stD ? OY.sat : OY.notr
      : OY.notr,
    Number.isFinite(stD) ? `%D ${stD.toFixed(1)}` : '',
  );

  // CCI(20)
  const cciDizi = cci(yuksek, dusuk, kapanis, 20);
  const cciSon = cciDizi.at(-1);
  const cciYon = yukseliyor(cciDizi);
  ekle(
    'CCI (20)', cciSon,
    cciSon < -100 && cciYon === true ? OY.al : cciSon > 100 && cciYon === false ? OY.sat : OY.notr,
    cciSon < -100 ? 'aşırı satım' : cciSon > 100 ? 'aşırı alım' : 'nötr',
  );

  // ADX(14) — trendin gücü ve yönü
  const a = adx(yuksek, dusuk, kapanis, 14);
  const adxSon = a.adx.at(-1);
  const artiDI = a.artiDI.at(-1);
  const eksiDI = a.eksiDI.at(-1);
  ekle(
    'ADX (14)', adxSon,
    Number.isFinite(adxSon) && adxSon > 20 && Number.isFinite(artiDI) && Number.isFinite(eksiDI)
      ? artiDI > eksiDI ? OY.al : OY.sat
      : OY.notr,
    Number.isFinite(adxSon)
      ? adxSon > 25 ? 'güçlü trend' : adxSon > 20 ? 'trend oluşuyor' : 'trend yok (yatay)'
      : '',
  );

  // Williams %R(14)
  const wrDizi = williamsR(yuksek, dusuk, kapanis, 14);
  const wrSon = wrDizi.at(-1);
  const wrYon = yukseliyor(wrDizi);
  ekle(
    'Williams %R (14)', wrSon,
    wrSon < -80 && wrYon === true ? OY.al : wrSon > -20 && wrYon === false ? OY.sat : OY.notr,
    wrSon < -80 ? 'aşırı satım' : wrSon > -20 ? 'aşırı alım' : 'nötr',
  );

  // Momentum(10)
  const momDizi = momentum(kapanis, 10);
  const momSon = momDizi.at(-1);
  ekle(
    'Momentum (10)', momSon,
    Number.isFinite(momSon) ? (momSon > 0 ? OY.al : momSon < 0 ? OY.sat : OY.notr) : OY.notr,
    momSon > 0 ? '10 gün önceye göre yukarıda' : '10 gün önceye göre aşağıda',
  );

  // --- Toplama ---
  const puanla = (satirlar) => {
    if (!satirlar.length) return { puan: 0, al: 0, notr: 0, sat: 0 };
    const al = satirlar.filter((s) => s.oy === 1).length;
    const sat = satirlar.filter((s) => s.oy === -1).length;
    const notr = satirlar.length - al - sat;
    return { puan: (al - sat) / satirlar.length, al, notr, sat };
  };

  const maPuan = puanla(maSatirlari);
  const osPuan = puanla(osSatirlari);
  const genelPuan = (maPuan.puan + osPuan.puan) / 2;

  // --- Bağlam ---
  const bb = bollinger(kapanis, 20, 2);
  const son52 = kapanis.slice(-252);
  const zirve52 = Math.max(...son52);
  const dip52 = Math.min(...son52);

  const hacimler = barlar.map((b) => b.v).filter(Number.isFinite);
  const sonHacim = hacimler.at(-1);
  const ortHacim60 = hacimler.length >= 20
    ? hacimler.slice(-60).reduce((x, y) => x + y, 0) / Math.min(60, hacimler.length)
    : NaN;

  return {
    yeterliVeri: true,
    fiyat,
    genel: { ...etiketle(genelPuan), puan: Number(genelPuan.toFixed(3)) },
    hareketliOrtalamalar: { ...etiketle(maPuan.puan), puan: Number(maPuan.puan.toFixed(3)), ...maPuan, satirlar: maSatirlari },
    osilatorler: { ...etiketle(osPuan.puan), puan: Number(osPuan.puan.toFixed(3)), ...osPuan, satirlar: osSatirlari },
    baglam: {
      trendGucu: Number.isFinite(adxSon) ? Number(adxSon.toFixed(1)) : null,
      trendYorumu: !Number.isFinite(adxSon) ? null
        : adxSon > 25 ? 'Güçlü trend var — trend göstergeleri anlamlı'
        : adxSon > 20 ? 'Trend oluşuyor'
        : 'Trend yok, yatay piyasa — Al/Sat sinyalleri bu ortamda sık yanılır',
      oynaklikYillik: Number.isFinite(oynaklik(kapanis, 30)) ? Number(oynaklik(kapanis, 30).toFixed(1)) : null,
      maxDusus1Y: Number(maxDusus(son52).toFixed(1)),
      zirve52Uzaklik: Number((((fiyat - zirve52) / zirve52) * 100).toFixed(1)),
      dip52Uzaklik: Number((((fiyat - dip52) / dip52) * 100).toFixed(1)),
      bollingerUst: Number.isFinite(bb.ust.at(-1)) ? Number(bb.ust.at(-1).toFixed(2)) : null,
      bollingerAlt: Number.isFinite(bb.alt.at(-1)) ? Number(bb.alt.at(-1).toFixed(2)) : null,
      hacimOrani: Number.isFinite(sonHacim) && Number.isFinite(ortHacim60) && ortHacim60 > 0
        ? Number((sonHacim / ortHacim60).toFixed(2)) : null,
      barSayisi: kapanis.length,
    },
  };
}

/**
 * Getiri tablosu — "yüzde kaç kazandırmış" sorusunun cevabı.
 *
 * Dönemler TAKVİM GÜNÜ ile ölçülür, bar sayısıyla değil. Sebebi:
 * her piyasanın yıllık işlem günü sayısı farklı (BIST ~250, döviz ~260,
 * kripto 365), ve sentetik seriler (gram altın = ons × kur) hizalama
 * sırasında gün kaybeder. Sabit bar sayısı bu durumlarda ya yanlış dönemi
 * ölçer ya da hiç sonuç veremez.
 */
export function getiriler(barlar) {
  if (!barlar.length) return {};
  const son = barlar.at(-1).c;
  const sonZaman = barlar.at(-1).t;

  // N takvim günü öncesine en yakın (ondan önceki veya o günkü) barı bul
  const geri = (gun) => {
    const hedef = sonZaman - gun * 24 * 3600 * 1000;
    let aday = null;
    for (const b of barlar) {
      if (b.t <= hedef) aday = b;
      else break;
    }
    // Seri hedef tarihe kadar uzanmıyorsa dürüst davran: null dön, uydurma
    if (!aday || aday === barlar.at(-1)) return null;
    return Number((((son / aday.c) - 1) * 100).toFixed(2));
  };

  return {
    gun: barlar.length >= 2
      ? Number((((son / barlar.at(-2).c) - 1) * 100).toFixed(2))
      : null,
    hafta: geri(7),
    ay: geri(30),
    ucAy: geri(91),
    altiAy: geri(182),
    yil: geri(365),
    ytd: (() => {
      const yilBasi = new Date(new Date(sonZaman).getFullYear(), 0, 1).getTime();
      const bar = barlar.find((b) => b.t >= yilBasi);
      return bar ? Number((((son / bar.c) - 1) * 100).toFixed(2)) : null;
    })(),
  };
}
