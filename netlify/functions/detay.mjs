// Tek sembolün tam teknik dökümü — indikatör indikatör.
import { uzunBarlar } from '../../src/sources/market.js';
import { teknikOzet, getiriler } from '../../src/analysis/rating.js';

export default async (req) => {
  const sembol = new URL(req.url).searchParams.get('sembol');
  if (!sembol) return Response.json({ hata: 'sembol gerekli' }, { status: 400 });

  try {
    const barlar = await uzunBarlar(sembol, '1y');
    const ozet = teknikOzet(barlar);

    if (/=F$/.test(sembol) && ozet.yeterliVeri) {
      ozet.baglam.hacimOrani = null;
      ozet.baglam.hacimNotu = 'Vadeli kontrat — sözleşme değişimi hacmi bozar';
    }

    return Response.json(
      {
        sembol,
        ozet,
        getiri: getiriler(barlar),
        seri: barlar.slice(-250).map((b) => ({ t: b.t, c: Number(b.c.toFixed(4)) })),
      },
      { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } },
    );
  } catch (e) {
    return Response.json({ hata: e.message }, { status: 502 });
  }
};

export const config = { path: '/api/detay' };
