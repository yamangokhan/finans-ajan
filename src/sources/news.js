import { FEEDS, ASSET_KEYWORDS, MAKRO_KEYWORDS, AYARLAR } from '../config.js';
import { getir, sleep, hata } from '../util.js';

/** Basit RSS ayrıştırıcı — item/title/pubDate/link/source. */
function rssAyristir(xml, kaynakAdi) {
  const parcalar = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)];
  return parcalar
    .map((m) => {
      const s = m[1];
      const al = (etiket) => {
        const r = s.match(new RegExp(`<${etiket}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${etiket}>`));
        return r ? r[1].trim() : '';
      };
      const tarihHam = al('pubDate') || al('dc:date');
      const tarih = new Date(tarihHam);
      return {
        baslik: al('title').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&'),
        link: al('link'),
        kaynak: kaynakAdi,
        zaman: isNaN(tarih) ? null : tarih.getTime(),
      };
    })
    .filter((h) => h.baslik && h.zaman);
}

/** Tüm beslemeleri paralel çeker (RSS sunucuları hız limiti uygulamıyor). */
export async function haberleriTopla() {
  const isler = FEEDS.map(async (f) => {
    try {
      const res = await getir(f.url, {}, { deneme: 2, zamanAsimi: 12000 });
      return rssAyristir(await res.text(), f.ad);
    } catch (e) {
      hata(`Besleme okunamadı (${f.ad}):`, e.message);
      return [];
    }
  });

  const hepsi = (await Promise.all(isler)).flat();

  // Tekrarları başlığa göre ele (aynı haber birden çok kaynaktan gelir)
  const gorulen = new Set();
  const benzersiz = [];
  for (const h of hepsi.sort((a, b) => b.zaman - a.zaman)) {
    const anahtar = h.baslik.toLowerCase().replace(/[^a-z0-9çğıöşü ]/gi, '').slice(0, 60);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    benzersiz.push(h);
  }

  const sinir = Date.now() - AYARLAR.haber_pencere_saat * 3600 * 1000;
  return benzersiz.filter((h) => h.zaman >= sinir);
}

/**
 * Bir varlığın hareketiyle ilgili olabilecek haberleri puanlar.
 * Puan = varlık kelimesi eşleşmesi + makro kelime eşleşmesi + tazelik.
 */
export function haberEslestir(assetKey, haberler, hareketZamani = Date.now()) {
  const anahtarlar = ASSET_KEYWORDS[assetKey] ?? [];
  const puanli = haberler
    .map((h) => {
      const alt = h.baslik.toLowerCase();
      const varlikVurus = anahtarlar.filter((k) => alt.includes(k)).length;
      const makroVurus = MAKRO_KEYWORDS.filter((k) => alt.includes(k)).length;

      // Hareketten önceki 3 saat içindeki haberler en değerli; sonrakiler de sebep olabilir (gecikmeli yayın)
      const farkDk = (hareketZamani - h.zaman) / 60000;
      let tazelik = 0;
      if (farkDk >= -30 && farkDk <= 180) tazelik = 3;
      else if (farkDk > 180 && farkDk <= 360) tazelik = 1;

      const puan = varlikVurus * 3 + makroVurus * 2 + tazelik;
      return { ...h, puan, varlikVurus, makroVurus };
    })
    .filter((h) => h.puan >= 3)
    .sort((a, b) => b.puan - a.puan);

  return puanli.slice(0, 6);
}
