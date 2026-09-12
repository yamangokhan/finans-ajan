// Günün notu — Claude brifingi.
//
// MALİYET UYARISI: bu uç nokta her soğuk çağrıda ücretli bir model isteği yapar
// (~2-3 bin girdi + ~1,5 bin çıktı jeton). Bu yüzden CDN'de 6 saat tutuluyor:
// aynı 6 saat içindeki tüm ziyaretçiler tek üretimi paylaşır.
//
// ANTHROPIC_API_KEY tanımlı değilse 200 + not:null döner, panel bölümü gizlenir.
import { gunlukNot } from '../../src/analyst.js';
import { makroTara } from '../../src/analysis/screener.js';
import { tcmbGostergeler } from '../../src/sources/evds.js';
import { haberleriTopla } from '../../src/sources/news.js';
import { yaklasanOlaylar } from '../../src/calendar.js';

export default async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ not: null, sebep: 'ANTHROPIC_API_KEY tanımlı değil' });
  }

  try {
    // Brifing için gereken her şey paralel toplanır — Netlify'ın süre sınırı dar.
    const [makro, evds, haberler, olaylar] = await Promise.all([
      makroTara(),
      tcmbGostergeler(),
      haberleriTopla().then((h) => h.slice(0, 25)).catch(() => []),
      yaklasanOlaylar(24 * 14).catch(() => []),
    ]);

    const anlik = {};
    for (const x of makro) {
      anlik[x.kod] = {
        ad: x.ad, fiyat: x.fiyat, birim: '',
        gun: x.getiri?.gun, hafta: x.getiri?.hafta, ay: x.getiri?.ay, yil: x.getiri?.yil,
      };
    }

    const not = await gunlukNot({ anlik, evds, haberler, olaylar });

    return Response.json(
      { not, zaman: not ? Date.now() : null },
      { headers: { 'Cache-Control': 'public, max-age=21600, s-maxage=21600' } },
    );
  } catch (e) {
    return Response.json({ not: null, sebep: e.message }, { status: 502 });
  }
};

export const config = { path: '/api/not' };
