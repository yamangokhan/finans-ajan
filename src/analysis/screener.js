import { uzunBarlar } from '../sources/market.js';
import { teknikOzet, getiriler } from './rating.js';
import { ASSETS } from '../config.js';
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

/** Tek sembolün özeti — sembolden koda/ada kendisi karar verir. */
export async function tekSembolOzet(sembol) {
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
