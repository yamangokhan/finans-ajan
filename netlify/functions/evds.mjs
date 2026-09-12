// TCMB EVDS göstergeleri — resmî kur, politika faizi, TÜFE, rezervler.
// Anahtar Netlify ortam değişkeninden gelir (Site settings → Environment variables → EVDS_API_KEY).
// Anahtar yoksa 200 + gostergeler:null döner; panel bölümü gizler, geri kalanı çalışır.
import { tcmbGostergeler } from '../../src/sources/evds.js';

export default async () => {
  const veri = await tcmbGostergeler();

  return Response.json(
    veri ?? { gostergeler: null, kaynak: 'TCMB EVDS', hata: 'EVDS_API_KEY tanımlı değil ya da EVDS yanıt vermedi' },
    // EVDS günde bir güncellenir — CDN'de 1 saat tutmak hem hızlı, hem kotayı korur.
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
  );
};

export const config = { path: '/api/evds' };
