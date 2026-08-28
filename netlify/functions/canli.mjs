// Canlı fiyatlar — tek toplu Yahoo isteği, ~1 sn. Netlify'ın 10 sn sınırına rahat sığar.
import { ASSETS, ONS_GRAM } from '../../src/config.js';
import { canliFiyatlar, SPARK_AZAMI } from '../../src/sources/market.js';
import { BIST_EVRENI } from '../../src/analysis/screener.js';

const SEMBOLLER = [...ASSETS.map((a) => a.sembol), ...BIST_EVRENI.map((k) => `${k}.IS`)];

const parcala = (d, n) => {
  const p = [];
  for (let i = 0; i < d.length; i += n) p.push(d.slice(i, i + n));
  return p;
};

export default async () => {
  try {
    const parcalar = parcala(SEMBOLLER, SPARK_AZAMI);
    const birlesik = {};
    // Paralel: her istek ayrı sembol grubu, Yahoo'yu zorlamıyor
    const sonuclar = await Promise.all(parcalar.map((p) => canliFiyatlar(p).catch(() => ({}))));
    for (const s of sonuclar) Object.assign(birlesik, s);

    const ons = birlesik['GC=F'];
    const kur = birlesik['TRY=X'];
    if (ons && kur) {
      birlesik['GRAM_ALTIN'] = {
        sembol: 'GRAM_ALTIN',
        fiyat: (ons.fiyat * kur.fiyat) / ONS_GRAM,
        gun: (ons.gun ?? 0) + (kur.gun ?? 0),
        birim: 'TRY', turetilmis: true, seri: [], zaman: Date.now(),
      };
    }

    return Response.json(
      { fiyatlar: birlesik, zaman: Date.now(), adet: Object.keys(birlesik).length },
      { headers: { 'Cache-Control': 'public, max-age=20' } },
    );
  } catch (e) {
    return Response.json({ hata: e.message }, { status: 502 });
  }
};

export const config = { path: '/api/canli' };
