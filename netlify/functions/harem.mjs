// Harem Altın — Türkiye piyasasının gerçek alış/satış fiyatları ve makaslar.
// Tek seferlik soket bağlantısı: bağlan, ilk fiyat paketini al, kapat (~0,5 sn).
import { haremFiyatlari } from '../../src/sources/harem.js';

export default async () => {
  try {
    const urunler = await haremFiyatlari({ zamanAsimi: 8000 });
    return Response.json(
      { urunler, zaman: Date.now(), adet: Object.keys(urunler).length },
      // Fiyatlar saniyede bir değişiyor ama panel 30 sn'de bir soruyor;
      // 20 sn CDN önbelleği hem taze hem kaynağı yormuyor.
      { headers: { 'Cache-Control': 'public, max-age=20, s-maxage=20' } },
    );
  } catch (e) {
    return Response.json({ hata: e.message, urunler: null }, { status: 502 });
  }
};

export const config = { path: '/api/harem' };
