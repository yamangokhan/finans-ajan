import { uzunBarlar } from '../sources/market.js';
import { teknikOzet, getiriler } from './rating.js';
import { ASSETS, ONS_GRAM } from '../config.js';
import { hata, log } from '../util.js';

// BIST'te likit ve yaygın takip edilen semboller.
// Yeni sembol eklemek için Yahoo kodunu yaz: örn. 'ISMEN' -> ISMEN.IS
export const BIST_EVRENI = [
  'THYAO', 'AKBNK', 'GARAN', 'ISCTR', 'YKBNK', 'VAKBN', 'HALKB',
  'KCHOL', 'SAHOL', 'ASELS', 'EREGL', 'BIMAS', 'TUPRS', 'SISE',
  'TCELL', 'FROTO', 'TOASO', 'PGSUS', 'SASA',
  'PETKM', 'ARCLK', 'TAVHL', 'ENKAI', 'TTKOM', 'MGROS', 'ULKER',
  'DOAS', 'OYAKC', 'ASTOR', 'EKGYO', 'HEKTS', 'GUBRF', 'ALARK',
  'SOKM', 'CIMSA', 'AEFES', 'TTRAK', 'VESTL',
];

// Tarama pahalı (sembol başına ~1,5 sn). Sonucu bir süre saklıyoruz.
let onbellek = { zaman: 0, sonuc: null };
const TAZELIK_MS = 30 * 60 * 1000;

async function tekSembol(kod, sembol, ad) {
  const barlar = await uzunBarlar(sembol, '1y');
  if (barlar.length < 35) throw new Error('yetersiz veri');

  const ozet = teknikOzet(barlar);
  const getiri = getiriler(barlar);
  const son = barlar.at(-1);

  // Vadeli kontratlarda (GC=F, SI=F, BZ=F...) sözleşme değişimi hacmi yapay olarak
  // sıçratır — "talep patlaması" değildir. Yanıltmasın diye hacim oranını gizliyoruz.
  const vadeli = /=F$/.test(sembol);
  if (vadeli && ozet.yeterliVeri) {
    ozet.baglam.hacimOrani = null;
    ozet.baglam.hacimNotu = 'Vadeli kontrat — sözleşme değişimi hacmi bozar, oran hesaplanmıyor';
  }

  return {
    kod,
    ad: ad ?? kod,
    sembol,
    fiyat: Number(son.c.toFixed(2)),
    hacim: son.v ?? null,
    getiri,
    teknik: ozet.yeterliVeri
      ? {
          etiket: ozet.genel.etiket,
          kodEtiket: ozet.genel.kod,
          renk: ozet.genel.renk,
          puan: ozet.genel.puan,
          maEtiket: ozet.hareketliOrtalamalar.etiket,
          osEtiket: ozet.osilatorler.etiket,
          al: ozet.hareketliOrtalamalar.al + ozet.osilatorler.al,
          notr: ozet.hareketliOrtalamalar.notr + ozet.osilatorler.notr,
          sat: ozet.hareketliOrtalamalar.sat + ozet.osilatorler.sat,
        }
      : null,
    baglam: ozet.yeterliVeri ? ozet.baglam : null,
    // seri: mini grafik için son 90 kapanış
    seri: barlar.slice(-90).map((b) => Number(b.c.toFixed(2))),
  };
}

/**
 * GRAM ALTIN — Yahoo'da böyle bir sembol yok, sentetik seri kuruyoruz:
 *   gram altın (TL) = ons altın (USD) x USD/TRY / 31,1034768
 *
 * İki seriyi TARİHE GÖRE hizalamak şart: ons altın vadelisi ile döviz farklı
 * takvimlerde işlem görür, indeksle çarpmak günleri kaydırıp yanlış seri üretir.
 *
 * Not: bu "has altın" karşılığıdır. Kuyumcudaki alış-satış makası (%2-4) dahil
 * değildir — gerçek alım maliyeti bunun üzerine biner.
 */
const gunAnahtari = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function gramAltinOzet() {
  const [ons, kur] = await Promise.all([
    uzunBarlar('GC=F', '1y'),
    uzunBarlar('TRY=X', '1y'),
  ]);

  const kurHarita = new Map(kur.map((b) => [gunAnahtari(b.t), b]));
  const barlar = [];
  for (const o of ons) {
    const k = kurHarita.get(gunAnahtari(o.t));
    if (!k) continue; // eşleşen kur günü yoksa o günü atla
    barlar.push({
      t: o.t,
      c: (o.c * k.c) / ONS_GRAM,
      h: ((o.h ?? o.c) * (k.h ?? k.c)) / ONS_GRAM,
      l: ((o.l ?? o.c) * (k.l ?? k.c)) / ONS_GRAM,
      v: null, // ons kontratının hacmi gram altını temsil etmez
    });
  }

  if (barlar.length < 35) throw new Error('gram altın için yeterli hizalı veri yok');

  const ozet = teknikOzet(barlar);
  if (ozet.yeterliVeri) {
    ozet.baglam.hacimOrani = null;
    ozet.baglam.hacimNotu = 'Sentetik seri (ons × kur) — hacim verisi yok';
  }

  return {
    kod: 'gram_altin',
    ad: 'Gram Altın',
    sembol: 'GRAM_ALTIN',
    fiyat: Number(barlar.at(-1).c.toFixed(2)),
    hacim: null,
    getiri: getiriler(barlar),
    teknik: ozet.yeterliVeri ? {
      etiket: ozet.genel.etiket, kodEtiket: ozet.genel.kod, renk: ozet.genel.renk,
      puan: ozet.genel.puan,
      maEtiket: ozet.hareketliOrtalamalar.etiket, osEtiket: ozet.osilatorler.etiket,
      al: ozet.hareketliOrtalamalar.al + ozet.osilatorler.al,
      notr: ozet.hareketliOrtalamalar.notr + ozet.osilatorler.notr,
      sat: ozet.hareketliOrtalamalar.sat + ozet.osilatorler.sat,
    } : null,
    baglam: ozet.yeterliVeri ? ozet.baglam : null,
    seri: barlar.slice(-90).map((b) => Number(b.c.toFixed(2))),
    sentetik: true,
  };
}

/** Gram altının tam teknik dökümü (detay paneli için). */
export async function gramAltinDetay() {
  const [ons, kur] = await Promise.all([
    uzunBarlar('GC=F', '1y'),
    uzunBarlar('TRY=X', '1y'),
  ]);
  const kurHarita = new Map(kur.map((b) => [gunAnahtari(b.t), b]));
  const barlar = [];
  for (const o of ons) {
    const k = kurHarita.get(gunAnahtari(o.t));
    if (!k) continue;
    barlar.push({
      t: o.t,
      c: (o.c * k.c) / ONS_GRAM,
      h: ((o.h ?? o.c) * (k.h ?? k.c)) / ONS_GRAM,
      l: ((o.l ?? o.c) * (k.l ?? k.c)) / ONS_GRAM,
      v: null,
    });
  }
  const ozet = teknikOzet(barlar);
  if (ozet.yeterliVeri) {
    ozet.baglam.hacimOrani = null;
    ozet.baglam.hacimNotu = 'Sentetik seri (ons × kur) — hacim verisi yok';
  }
  return {
    sembol: 'GRAM_ALTIN',
    ozet,
    getiri: getiriler(barlar),
    seri: barlar.slice(-250).map((b) => ({ t: b.t, c: Number(b.c.toFixed(2)) })),
  };
}

/** Tek sembolün özeti — sembolden koda/ada kendisi karar verir. */
export async function tekSembolOzet(sembol) {
  if (sembol === 'GRAM_ALTIN') return gramAltinOzet();
  const varlik = ASSETS.find((a) => a.sembol === sembol);
  const kod = varlik?.key ?? sembol.replace(/\.IS$/, '');
  return tekSembol(kod, sembol, varlik?.ad);
}

/** BIST evrenini tarar. İlerlemeyi geri bildirmek için onIlerleme(cb) verilebilir. */
export async function bistTara({ zorla = false, onIlerleme = null } = {}) {
  if (!zorla && onbellek.sonuc && Date.now() - onbellek.zaman < TAZELIK_MS) {
    return onbellek.sonuc;
  }

  const sonuc = [];
  let i = 0;
  for (const kod of BIST_EVRENI) {
    i++;
    try {
      sonuc.push(await tekSembol(kod, `${kod}.IS`));
    } catch (e) {
      hata(`${kod} taranamadı:`, e.message);
    }
    onIlerleme?.(i, BIST_EVRENI.length, kod);
  }

  log(`BIST taraması bitti: ${sonuc.length}/${BIST_EVRENI.length}`);
  onbellek = { zaman: Date.now(), sonuc };
  return sonuc;
}

/** Ana varlıklar (altın, kur, endeks, emtia) için teknik özet. */
export async function makroTara({ zorla = false } = {}) {
  const sonuc = [];

  // Gram altın en başa: Türkiye'deki yatırımcı için en çok bakılan varlık.
  try {
    sonuc.push(await gramAltinOzet());
  } catch (e) {
    hata('Gram altın hesaplanamadı:', e.message);
  }

  for (const a of ASSETS) {
    try {
      sonuc.push(await tekSembol(a.key, a.sembol, a.ad));
    } catch (e) {
      hata(`${a.ad} taranamadı:`, e.message);
    }
  }
  return sonuc;
}

/** Tek bir varlığın tam teknik dökümü (indikatör indikatör). */
export async function detay(sembol) {
  if (sembol === 'GRAM_ALTIN') return gramAltinDetay();
  const barlar = await uzunBarlar(sembol, '1y');
  const ozet = teknikOzet(barlar);
  return {
    sembol,
    ozet,
    getiri: getiriler(barlar),
    seri: barlar.slice(-250).map((b) => ({ t: b.t, c: Number(b.c.toFixed(4)) })),
  };
}

// --- Sıralamalar ---

export const enCokHacim = (liste) =>
  [...liste].filter((x) => Number.isFinite(x.hacim)).sort((a, b) => b.hacim - a.hacim);

/** "En çok talep gören" = kendi normaline göre en çok işlem gören. Mutlak hacimden dürüst. */
export const hacimPatlamasi = (liste) =>
  [...liste]
    .filter((x) => Number.isFinite(x.baglam?.hacimOrani))
    .sort((a, b) => b.baglam.hacimOrani - a.baglam.hacimOrani);

export const enCokYukselen = (liste) =>
  [...liste].filter((x) => Number.isFinite(x.getiri?.gun)).sort((a, b) => b.getiri.gun - a.getiri.gun);

export const enCokDusen = (liste) =>
  [...liste].filter((x) => Number.isFinite(x.getiri?.gun)).sort((a, b) => a.getiri.gun - b.getiri.gun);

export const teknikSirali = (liste) =>
  [...liste].filter((x) => x.teknik).sort((a, b) => b.teknik.puan - a.teknik.puan);
