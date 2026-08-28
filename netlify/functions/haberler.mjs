// Haber akışı + yaklaşan olaylar.
// Takvim JSON'u derlemeye gömülür — Netlify fonksiyonlarında dosya sistemi yok.
import { haberleriTopla } from '../../src/sources/news.js';
import { olaylariHesapla } from '../../src/calendar.js';
import takvim from '../../data/calendar.json' with { type: 'json' };

export default async () => {
  try {
    const [haberler, olaylar] = await Promise.all([
      haberleriTopla().catch(() => []),
      Promise.resolve(olaylariHesapla(takvim, 24 * 14)),
    ]);

    return Response.json(
      { haberler: haberler.slice(0, 30), olaylar, zaman: Date.now() },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (e) {
    return Response.json({ hata: e.message }, { status: 502 });
  }
};

export const config = { path: '/api/haberler' };
