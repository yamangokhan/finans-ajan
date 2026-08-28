// Teknik analiz — sembol grubu başına bir çağrı.
// Tarayıcı bunu paralel parçalar halinde çağırır.
// Tek seferde tümünü taramak Netlify'ın ~10 sn sınırını aşardı.
import { uzunBarlar } from '../../src/sources/market.js';
import { teknikOzet, getiriler } from '../../src/analysis/rating.js';
import { ASSETS } from '../../src/config.js';

const AZAMI = 6;

async function tek(sembol) {
  // '1y' bilinçli: '2y' isteği Yahoo'da kat kat yavaş. 1 yıl ~255 bar = SMA 200'e yeter.
  const barlar = await uzunBarlar(sembol, '1y');
  if (barlar.length < 35) throw new Error('yetersiz veri');

  const ozet = teknikOzet(barlar);
  const son = barlar.at(-1);

  // Vadeli kontratlarda sözleşme değişimi hacmi bozar — oranı gizle
  if (/=F$/.test(sembol) && ozet.yeterliVeri) {
    ozet.baglam.hacimOrani = null;
    ozet.baglam.hacimNotu = 'Vadeli kontrat — sözleşme değişimi hacmi bozar';
  }

  const varlik = ASSETS.find((a) => a.sembol === sembol);
  const kod = varlik?.key ?? sembol.replace(/\.IS$/, '');

  return {
    kod,
    ad: varlik?.ad ?? kod,
    sembol,
    fiyat: Number(son.c.toFixed(2)),
    hacim: son.v ?? null,
    getiri: getiriler(barlar),
    teknik: ozet.yeterliVeri ? {
      etiket: ozet.genel.etiket,
      kodEtiket: ozet.genel.kod,
      renk: ozet.genel.renk,
      puan: ozet.genel.puan,
      maEtiket: ozet.hareketliOrtalamalar.etiket,
      osEtiket: ozet.osilatorler.etiket,
      al: ozet.hareketliOrtalamalar.al + ozet.osilatorler.al,
      notr: ozet.hareketliOrtalamalar.notr + ozet.osilatorler.notr,
      sat: ozet.hareketliOrtalamalar.sat + ozet.osilatorler.sat,
    } : null,
    baglam: ozet.yeterliVeri ? ozet.baglam : null,
    seri: barlar.slice(-90).map((b) => Number(b.c.toFixed(2))),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const ham = (url.searchParams.get('semboller') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (!ham.length) return Response.json({ hata: 'semboller parametresi gerekli' }, { status: 400 });
  if (ham.length > AZAMI) return Response.json({ hata: `en fazla ${AZAMI} sembol` }, { status: 400 });

  const sonuclar = await Promise.all(
    ham.map((s) => tek(s).catch((e) => ({ sembol: s, hata: e.message }))),
  );

  return Response.json(
    {
      sonuclar: sonuclar.filter((s) => !s.hata),
      hatalar: sonuclar.filter((s) => s.hata),
    },
    // Teknik veri günlük barlara dayanır — CDN'de 15 dk tutmak hem hızlı hem
    // Yahoo'nun hız limitini korur (tekrar eden ziyaretler fonksiyonu uyandırmaz).
    { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } },
  );
};

export const config = { path: '/api/tara' };
