// Teknik analiz — sembol grubu başına bir çağrı.
// Tarayıcı bunu paralel parçalar halinde çağırır; tek seferde tümü Netlify'ın
// zaman sınırını aşardı.
//
// Hesaplama mantığı screener.js'te tek yerde durur — burada kopyalanmaz.
// 'GRAM_ALTIN' sözde sembolü de orada ele alınır (ons × kur sentetik serisi).
import { tekSembolOzet } from '../../src/analysis/screener.js';

const AZAMI = 6;

export default async (req) => {
  const url = new URL(req.url);
  const ham = (url.searchParams.get('semboller') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (!ham.length) return Response.json({ hata: 'semboller parametresi gerekli' }, { status: 400 });
  if (ham.length > AZAMI) return Response.json({ hata: `en fazla ${AZAMI} sembol` }, { status: 400 });

  const sonuclar = await Promise.all(
    ham.map((s) => tekSembolOzet(s).catch((e) => ({ sembol: s, hata: e.message }))),
  );

  return Response.json(
    {
      sonuclar: sonuclar.filter((s) => !s.hata),
      hatalar: sonuclar.filter((s) => s.hata),
    },
    // Teknik veri günlük barlara dayanır — CDN'de 15 dk tutmak hem hızlı,
    // hem Yahoo'nun hız limitini korur (tekrar ziyaretler fonksiyonu uyandırmaz).
    { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } },
  );
};

export const config = { path: '/api/tara' };
