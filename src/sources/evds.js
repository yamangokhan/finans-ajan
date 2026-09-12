/**
 * TCMB EVDS — resmî istatistik kaynağı (abonelik anahtarı ile).
 *
 * SÖZLEŞME (2026'da ölçüldü, eski dokümanlardan farklı):
 *   Taban  : https://evds3.tcmb.gov.tr/igmevdsms-dis
 *   Anahtar: `key` HTTP başlığı — URL parametresi ARTIK çalışmıyor ("Invalid API Key")
 *   Seri   : /series=KOD1-KOD2&startDate=GG-AA-YYYY&endDate=GG-AA-YYYY&type=json
 *   Yanıt  : { totalCount, items: [{ Tarih, TP_DK_USD_A_YTL, UNIXTIME }] }
 *            — nokta içeren seri kodu, yanıt alanında alt çizgiye dönüşür.
 *
 * Eski evds2.tcmb.gov.tr/service/evds/... adresi evds3 ana sayfasına yönleniyor;
 * o yüzden HTML dönüyordu. Yeni taban yolu SPA paketinden çıkarıldı.
 */
import { getir, hata } from '../util.js';

const TABAN = 'https://evds3.tcmb.gov.tr/igmevdsms-dis';
const ANAHTAR = () => process.env.EVDS_API_KEY;

/** Panelde gösterilen seriler. Kodlar EVDS kataloğundan doğrulandı. */
export const SERILER = {
  usd:           { kod: 'TP.DK.USD.A.YTL',    ad: 'USD/TRY',            birim: '₺',   basamak: 4, sik: 'gunluk' },
  eur:           { kod: 'TP.DK.EUR.A.YTL',    ad: 'EUR/TRY',            birim: '₺',   basamak: 4, sik: 'gunluk' },
  politikaFaizi: { kod: 'TP.BISPOLFAIZ.TUR',  ad: 'TCMB politika faizi', birim: '%',  basamak: 2, sik: 'aylik' },
  fedFaizi:      { kod: 'TP.BISPOLFAIZ.USA',  ad: 'Fed politika faizi',  birim: '%',  basamak: 2, sik: 'aylik' },
  tufe:          { kod: 'TP.TUKFIY2025.GENEL', ad: 'TÜFE (2025=100)',   birim: '',    basamak: 2, sik: 'aylik' },
  konutEndeksi:  { kod: 'TP.KFE.TR',          ad: 'Konut fiyat endeksi', birim: '',   basamak: 1, sik: 'aylik' },
  cariDenge:     { kod: 'TP.ODANA6.Q01',      ad: 'Cari işlemler dengesi', birim: 'M$', basamak: 0, sik: 'aylik' },
  rezervAltin:   { kod: 'TP.AB.C1',           ad: 'Rezerv — altın',     birim: 'M$',  basamak: 0, sik: 'haftalik' },
  rezervDoviz:   { kod: 'TP.AB.C2',           ad: 'Rezerv — döviz',     birim: 'M$',  basamak: 0, sik: 'haftalik' },
  rezervToplam:  { kod: 'TP.AB.TOPLAM',       ad: 'Rezerv — toplam',    birim: 'M$',  basamak: 0, sik: 'haftalik' },
  mevduatFaizi:  { kod: 'TP.TRY.MT02',        ad: 'TL mevduat faizi (3 ay)', birim: '%', basamak: 2, sik: 'haftalik' },
  // EVDS M2'yi BİN TL olarak yayımlıyor — 28.658.786.921 gibi okunamaz bir sayı.
  // olcek ile trilyon TL'ye çevriliyor.
  m2:            { kod: 'TP.HPBITABLO1.11',   ad: 'M2 para arzı',       birim: 'trilyon ₺', basamak: 2, sik: 'haftalik', olcek: 1e-9 },
};

// Frekansı karışık serileri TEK istekte sormuyoruz: EVDS satırları tarihe göre
// hizalıyor, aylık seri haftalık tarihlerde boş dönüp gereksiz gürültü üretiyor.
const PENCERE = {
  gunluk:   { gun: 45,  alanlar: ['usd', 'eur'] },
  aylik:    { gun: 900, alanlar: ['politikaFaizi', 'fedFaizi', 'tufe', 'konutEndeksi', 'cariDenge'] },
  haftalik: { gun: 400, alanlar: ['rezervAltin', 'rezervDoviz', 'rezervToplam', 'mevduatFaizi', 'm2'] },
};

const gg = (d) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

/**
 * Bir veya daha çok seriyi çeker.
 * @returns {Promise<Record<string, Array<{tarih: string, deger: number}>>>} seri kodu -> noktalar (eskiden yeniye)
 */
export async function evdsSeri(kodlar, { gun = 60 } = {}) {
  if (!ANAHTAR()) throw new Error('EVDS_API_KEY tanımlı değil');

  const bitis = new Date();
  const baslangic = new Date(bitis.getTime() - gun * 86400000);
  const url =
    `${TABAN}/series=${kodlar.join('-')}` +
    `&startDate=${gg(baslangic)}&endDate=${gg(bitis)}&type=json`;

  const res = await getir(url, { headers: { key: ANAHTAR() } }, { deneme: 3, zamanAsimi: 25000 });
  const govde = await res.text();

  // Anahtar/yol hatalarında EVDS düz metin ya da HTML döndürüyor — JSON.parse'ı
  // patlatmadan sebebi söyle.
  if (govde.trimStart().startsWith('<') || !govde.trimStart().startsWith('{')) {
    throw new Error(`EVDS beklenmedik yanıt: ${govde.slice(0, 80).replace(/\s+/g, ' ')}`);
  }

  const j = JSON.parse(govde);
  const sonuc = {};
  for (const kod of kodlar) {
    const alan = kod.replace(/\./g, '_'); // TP.DK.USD.A.YTL -> TP_DK_USD_A_YTL
    sonuc[kod] = (j.items ?? [])
      .map((s) => ({ tarih: s.Tarih, deger: s[alan] === null || s[alan] === '' ? NaN : Number(s[alan]) }))
      .filter((n) => Number.isFinite(n.deger));
  }
  return sonuc;
}

/** Son değer + bir önceki gözleme göre değişim. */
function ozet(ham, tanim) {
  if (!ham?.length) return null;
  const k = tanim.olcek ?? 1;
  const noktalar = k === 1 ? ham : ham.map((n) => ({ ...n, deger: n.deger * k }));
  const son = noktalar.at(-1);
  const onceki = noktalar.at(-2);
  return {
    ad: tanim.ad,
    kod: tanim.kod,
    birim: tanim.birim,
    basamak: tanim.basamak,
    deger: son.deger,
    tarih: son.tarih,
    onceki: onceki?.deger ?? null,
    // Faiz zaten yüzde — puan farkı anlamlı; diğerlerinde yüzde değişim.
    degisim: onceki && onceki.deger !== 0
      ? (tanim.birim === '%' ? son.deger - onceki.deger : (son.deger / onceki.deger - 1) * 100)
      : null,
    degisimTipi: tanim.birim === '%' ? 'puan' : 'yuzde',
    gecmis: noktalar.slice(-24).map((n) => n.deger),
  };
}

// EVDS günde bir güncellenir; panelin her isteğinde ağa çıkmanın anlamı yok.
let onbellek = null;
const TAZELIK_MS = 30 * 60 * 1000;

/**
 * Panel için derlenmiş TCMB göstergeleri.
 * Anahtar yoksa veya EVDS düşerse null döner — panel bu bölümü gizler, gerisi çalışır.
 */
export async function tcmbGostergeler({ zorla = false } = {}) {
  if (!ANAHTAR()) return null;
  if (!zorla && onbellek && Date.now() - onbellek.zaman < TAZELIK_MS) return onbellek.veri;

  try {
    // Frekans başına bir istek — karışık frekansta EVDS hizalaması bozuk görünüyor.
    const parcalar = await Promise.all(
      Object.values(PENCERE).map((p) => evdsSeri(p.alanlar.map((a) => SERILER[a].kod), { gun: p.gun })),
    );
    const hepsi = Object.assign({}, ...parcalar);

    const g = {};
    for (const [ad, tanim] of Object.entries(SERILER)) g[ad] = ozet(hepsi[tanim.kod], tanim);

    // TÜFE yıllık enflasyon: endeksin 12 ay önceki değerine oranı.
    const tufeNokta = hepsi[SERILER.tufe.kod] ?? [];
    if (tufeNokta.length >= 13) {
      const son = tufeNokta.at(-1);
      const yilOnce = tufeNokta.at(-13);
      g.tufeYillik = {
        ad: 'Yıllık enflasyon (TÜFE)',
        birim: '%',
        basamak: 2,
        deger: (son.deger / yilOnce.deger - 1) * 100,
        tarih: son.tarih,
        degisim: null,
        gecmis: tufeNokta.slice(-13).map((n, i, d) => (i ? (n.deger / d[i - 1].deger - 1) * 100 : 0)).slice(1),
      };
    }

    const veri = {
      gostergeler: g,
      // Ham TÜFE serisi istemciye de gider: portföyde "şu tarihte aldım" denince
      // reel getiri o tarihten bugüne enflasyonla hesaplanabilsin.
      tufeSerisi: tufeNokta.slice(-120),
      enflasyon: {
        yillik: g.tufeYillik?.deger ?? null,
        aylik: tufeNokta.length >= 2 ? (tufeNokta.at(-1).deger / tufeNokta.at(-2).deger - 1) * 100 : null,
        tarih: tufeNokta.at(-1)?.tarih ?? null,
      },
      kaynak: 'TCMB EVDS',
      zaman: Date.now(),
    };
    onbellek = { zaman: Date.now(), veri };
    return veri;
  } catch (e) {
    hata('EVDS alınamadı:', e.message);
    // Eldeki bayat veri, hiç veri yoktan iyidir — panelde tarihi zaten yazıyor.
    return onbellek?.veri ?? null;
  }
}
