// Tek sembolün tam teknik dökümü — indikatör indikatör.
// 'GRAM_ALTIN' dahil tüm mantık screener.js'te.
import { detay } from '../../src/analysis/screener.js';

export default async (req) => {
  const sembol = new URL(req.url).searchParams.get('sembol');
  if (!sembol) return Response.json({ hata: 'sembol gerekli' }, { status: 400 });

  try {
    return Response.json(
      await detay(sembol),
      { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } },
    );
  } catch (e) {
    return Response.json({ hata: e.message }, { status: 502 });
  }
};

export const config = { path: '/api/detay' };
