// Teknik indikatörler. Hepsi dizi girip dizi döner; son eleman = güncel değer.
// Formüller TradingView / Wilder standardıdır — uydurma yok.

export function sma(dizi, n) {
  const cikti = new Array(dizi.length).fill(NaN);
  let toplam = 0;
  for (let i = 0; i < dizi.length; i++) {
    toplam += dizi[i];
    if (i >= n) toplam -= dizi[i - n];
    if (i >= n - 1) cikti[i] = toplam / n;
  }
  return cikti;
}

export function ema(dizi, n) {
  const cikti = new Array(dizi.length).fill(NaN);
  const k = 2 / (n + 1);
  // İlk EMA değeri, ilk n barın basit ortalaması
  let toplam = 0;
  for (let i = 0; i < dizi.length; i++) {
    if (i < n) {
      toplam += dizi[i];
      if (i === n - 1) cikti[i] = toplam / n;
      continue;
    }
    cikti[i] = dizi[i] * k + cikti[i - 1] * (1 - k);
  }
  return cikti;
}

/** Wilder yumuşatması (RSI ve ADX'in kullandığı). */
function wilder(dizi, n) {
  const cikti = new Array(dizi.length).fill(NaN);
  let toplam = 0;
  for (let i = 0; i < dizi.length; i++) {
    if (i < n) {
      toplam += dizi[i];
      if (i === n - 1) cikti[i] = toplam / n;
      continue;
    }
    cikti[i] = (cikti[i - 1] * (n - 1) + dizi[i]) / n;
  }
  return cikti;
}

export function rsi(kapanis, n = 14) {
  const kazanc = [0];
  const kayip = [0];
  for (let i = 1; i < kapanis.length; i++) {
    const fark = kapanis[i] - kapanis[i - 1];
    kazanc.push(Math.max(fark, 0));
    kayip.push(Math.max(-fark, 0));
  }
  const ortKazanc = wilder(kazanc, n);
  const ortKayip = wilder(kayip, n);
  return kapanis.map((_, i) => {
    if (!Number.isFinite(ortKazanc[i]) || !Number.isFinite(ortKayip[i])) return NaN;
    if (ortKayip[i] === 0) return 100;
    const rs = ortKazanc[i] / ortKayip[i];
    return 100 - 100 / (1 + rs);
  });
}

export function macd(kapanis, kisa = 12, uzun = 26, sinyalN = 9) {
  const e1 = ema(kapanis, kisa);
  const e2 = ema(kapanis, uzun);
  const cizgi = kapanis.map((_, i) =>
    Number.isFinite(e1[i]) && Number.isFinite(e2[i]) ? e1[i] - e2[i] : NaN,
  );
  // Sinyal çizgisi, MACD'nin NaN olmayan kısmının EMA'sı
  const ilk = cizgi.findIndex(Number.isFinite);
  const gecerli = ilk === -1 ? [] : cizgi.slice(ilk);
  const sinyalParca = ema(gecerli, sinyalN);
  const sinyal = new Array(cizgi.length).fill(NaN);
  for (let i = 0; i < sinyalParca.length; i++) sinyal[ilk + i] = sinyalParca[i];
  const histogram = cizgi.map((v, i) =>
    Number.isFinite(v) && Number.isFinite(sinyal[i]) ? v - sinyal[i] : NaN,
  );
  return { cizgi, sinyal, histogram };
}

/** Stochastic (14,3,3): yavaşlatılmış %K ve onun 3'lü ortalaması %D. */
export function stochastic(yuksek, dusuk, kapanis, n = 14, yavaslatma = 3, dN = 3) {
  const hamK = kapanis.map((c, i) => {
    if (i < n - 1) return NaN;
    const hh = Math.max(...yuksek.slice(i - n + 1, i + 1));
    const ll = Math.min(...dusuk.slice(i - n + 1, i + 1));
    return hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;
  });
  const k = sma(hamK.map((v) => (Number.isFinite(v) ? v : 0)), yavaslatma)
    .map((v, i) => (i >= n - 1 + yavaslatma - 1 ? v : NaN));
  const d = sma(k.map((v) => (Number.isFinite(v) ? v : 0)), dN)
    .map((v, i) => (Number.isFinite(k[i]) && i >= n + yavaslatma + dN - 3 ? v : NaN));
  return { k, d };
}

export function cci(yuksek, dusuk, kapanis, n = 20) {
  const tp = kapanis.map((c, i) => (yuksek[i] + dusuk[i] + c) / 3);
  const ortTp = sma(tp, n);
  return tp.map((_, i) => {
    if (!Number.isFinite(ortTp[i])) return NaN;
    const pencere = tp.slice(i - n + 1, i + 1);
    const sapma = pencere.reduce((a, v) => a + Math.abs(v - ortTp[i]), 0) / n;
    return sapma === 0 ? 0 : (tp[i] - ortTp[i]) / (0.015 * sapma);
  });
}

export function williamsR(yuksek, dusuk, kapanis, n = 14) {
  return kapanis.map((c, i) => {
    if (i < n - 1) return NaN;
    const hh = Math.max(...yuksek.slice(i - n + 1, i + 1));
    const ll = Math.min(...dusuk.slice(i - n + 1, i + 1));
    return hh === ll ? -50 : ((hh - c) / (hh - ll)) * -100;
  });
}

export function momentum(kapanis, n = 10) {
  return kapanis.map((c, i) => (i < n ? NaN : c - kapanis[i - n]));
}

/** ADX + yön göstergeleri (+DI / -DI), Wilder yöntemiyle. */
export function adx(yuksek, dusuk, kapanis, n = 14) {
  const artiDM = [0];
  const eksiDM = [0];
  const tr = [0];
  for (let i = 1; i < kapanis.length; i++) {
    const yukariHareket = yuksek[i] - yuksek[i - 1];
    const asagiHareket = dusuk[i - 1] - dusuk[i];
    artiDM.push(yukariHareket > asagiHareket && yukariHareket > 0 ? yukariHareket : 0);
    eksiDM.push(asagiHareket > yukariHareket && asagiHareket > 0 ? asagiHareket : 0);
    tr.push(
      Math.max(
        yuksek[i] - dusuk[i],
        Math.abs(yuksek[i] - kapanis[i - 1]),
        Math.abs(dusuk[i] - kapanis[i - 1]),
      ),
    );
  }
  const yTr = wilder(tr, n);
  const yArti = wilder(artiDM, n);
  const yEksi = wilder(eksiDM, n);

  const artiDI = yTr.map((v, i) => (Number.isFinite(v) && v !== 0 ? (yArti[i] / v) * 100 : NaN));
  const eksiDI = yTr.map((v, i) => (Number.isFinite(v) && v !== 0 ? (yEksi[i] / v) * 100 : NaN));

  const dx = artiDI.map((p, i) => {
    const m = eksiDI[i];
    if (!Number.isFinite(p) || !Number.isFinite(m) || p + m === 0) return NaN;
    return (Math.abs(p - m) / (p + m)) * 100;
  });

  // DX'in Wilder ortalaması = ADX
  const ilk = dx.findIndex(Number.isFinite);
  const gecerli = ilk === -1 ? [] : dx.slice(ilk);
  const adxParca = wilder(gecerli, n);
  const adxDizi = new Array(dx.length).fill(NaN);
  for (let i = 0; i < adxParca.length; i++) adxDizi[ilk + i] = adxParca[i];

  return { adx: adxDizi, artiDI, eksiDI };
}

/** Bollinger bantları — grafikte ve "aşırı uzaklık" kontrolünde kullanılır. */
export function bollinger(kapanis, n = 20, k = 2) {
  const orta = sma(kapanis, n);
  const ust = new Array(kapanis.length).fill(NaN);
  const alt = new Array(kapanis.length).fill(NaN);
  for (let i = n - 1; i < kapanis.length; i++) {
    const pencere = kapanis.slice(i - n + 1, i + 1);
    const ort = orta[i];
    const varyans = pencere.reduce((a, v) => a + (v - ort) ** 2, 0) / n;
    const sd = Math.sqrt(varyans);
    ust[i] = ort + k * sd;
    alt[i] = ort - k * sd;
  }
  return { ust, orta, alt };
}

/** Yıllıklandırılmış oynaklık (günlük getirilerin std sapması x sqrt(252)). */
export function oynaklik(kapanis, n = 30) {
  if (kapanis.length < n + 1) return NaN;
  const getiriler = [];
  for (let i = kapanis.length - n; i < kapanis.length; i++) {
    getiriler.push(Math.log(kapanis[i] / kapanis[i - 1]));
  }
  const ort = getiriler.reduce((a, b) => a + b, 0) / getiriler.length;
  const varyans = getiriler.reduce((a, b) => a + (b - ort) ** 2, 0) / (getiriler.length - 1);
  return Math.sqrt(varyans) * Math.sqrt(252) * 100;
}

/** Tepe noktasından maksimum düşüş (%) — riskin en dürüst ölçüsü. */
export function maxDusus(kapanis) {
  let tepe = -Infinity;
  let enKotu = 0;
  for (const c of kapanis) {
    if (c > tepe) tepe = c;
    const dusus = ((c - tepe) / tepe) * 100;
    if (dusus < enKotu) enKotu = dusus;
  }
  return enKotu;
}
