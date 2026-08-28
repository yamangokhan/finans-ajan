import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makroTara, bistTara, detay, tekSembolOzet, BIST_EVRENI } from './analysis/screener.js';
import { tcmbKur, canliFiyatlar, SPARK_AZAMI } from './sources/market.js';
import { ASSETS, ONS_GRAM } from './config.js';
import { haberleriTopla } from './sources/news.js';
import { yaklasanOlaylar } from './calendar.js';
import { haremAkis } from './sources/harem.js';
import { log, hata, trNow } from './util.js';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(KOK, 'public');
const PORT = Number(process.env.PORT ?? 7333);

// Tarama pahalı — arka planda yapılır, istekler hazır veriyi okur.
const durum = {
  makro: null,
  bist: null,
  kur: null,
  haberler: null,
  olaylar: null,
  guncelleme: null,
  tarama: { aktif: false, i: 0, n: 0, kod: null },
  canli: null,          // { sembol: {fiyat, gun, seri...} } — saniyeler içinde tazelenir
  canliZaman: null,
  canliHata: null,
};

let harem = null;       // Harem Altın kalıcı soket akışı

// --- CANLI FİYAT DÖNGÜSÜ ---
// Ağır teknik analizden bağımsız. Tek toplu istekle tüm sembolleri çeker (~1 sn).
const CANLI_SEMBOLLER = [
  ...ASSETS.map((a) => a.sembol),
  ...BIST_EVRENI.map((k) => `${k}.IS`),
];
const CANLI_ARALIK_MS = 30_000;

function parcala(dizi, n) {
  const p = [];
  for (let i = 0; i < dizi.length; i += n) p.push(dizi.slice(i, i + n));
  return p;
}

async function canliTazele() {
  try {
    const parcalar = parcala(CANLI_SEMBOLLER, SPARK_AZAMI);
    const birlesik = {};
    for (const p of parcalar) {
      Object.assign(birlesik, await canliFiyatlar(p));
    }

    // Gram altını türet: ons altın x USD/TRY / 31,1034768
    const ons = birlesik['GC=F'];
    const kur = birlesik['TRY=X'];
    if (ons && kur) {
      birlesik['GRAM_ALTIN'] = {
        sembol: 'GRAM_ALTIN',
        fiyat: (ons.fiyat * kur.fiyat) / ONS_GRAM,
        gun: (ons.gun ?? 0) + (kur.gun ?? 0),
        oncekiKapanis: ons.oncekiKapanis && kur.oncekiKapanis
          ? (ons.oncekiKapanis * kur.oncekiKapanis) / ONS_GRAM : null,
        seri: [], birim: 'TRY', turetilmis: true, zaman: Date.now(),
      };
    }

    durum.canli = birlesik;
    durum.canliZaman = Date.now();
    durum.canliHata = null;
  } catch (e) {
    durum.canliHata = e.message;
    hata('Canlı fiyat hatası:', e.message);
  }
}

async function verileriTazele({ bistDahil = true } = {}) {
  if (durum.tarama.aktif) return;
  durum.tarama = { aktif: true, i: 0, n: bistDahil ? BIST_EVRENI.length : 0, kod: null };
  try {
    log('Panel verisi tazeleniyor…');
    durum.makro = await makroTara();
    durum.kur = await tcmbKur();
    durum.haberler = (await haberleriTopla()).slice(0, 30);
    durum.olaylar = await yaklasanOlaylar(24 * 14);
    if (bistDahil) {
      durum.bist = await bistTara({
        zorla: true,
        onIlerleme: (i, n, kod) => { durum.tarama = { aktif: true, i, n, kod }; },
      });
    }
    durum.guncelleme = Date.now();
    log('Panel verisi hazır');
  } catch (e) {
    hata('Tazeleme hatası:', e.message);
  } finally {
    durum.tarama = { aktif: false, i: 0, n: 0, kod: null };
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function json(res, veri, kod = 200) {
  const govde = JSON.stringify(veri);
  res.writeHead(kod, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(govde),
    'Cache-Control': 'no-store',
  });
  res.end(govde);
}

const sunucu = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const yol = url.pathname;

  try {
    // --- API ---
    if (yol === '/api/veri') {
      return json(res, {
        makro: durum.makro,
        bist: durum.bist,
        kur: durum.kur,
        haberler: durum.haberler,
        olaylar: durum.olaylar,
        guncelleme: durum.guncelleme,
        tarama: durum.tarama,
        saat: trNow().metin,
      });
    }

    // Harem Altın: gerçek piyasa alış/satış fiyatları ve makaslar.
    // Kalıcı soket bağlantısından beslenir, istek anında ağa çıkmaz.
    if (yol === '/api/harem') {
      return json(res, {
        urunler: harem?.veri() ?? null,
        zaman: harem?.zaman() ?? null,
      });
    }

    // Hafif uç nokta: sadece canlı fiyatlar. Panel bunu sık çağırır.
    if (yol === '/api/canli') {
      return json(res, {
        fiyatlar: durum.canli,
        zaman: durum.canliZaman,
        hata: durum.canliHata,
      });
    }

    if (yol === '/api/tazele') {
      verileriTazele({ bistDahil: url.searchParams.get('bist') !== '0' });
      return json(res, { baslatildi: true });
    }

    if (yol === '/api/detay') {
      const sembol = url.searchParams.get('sembol');
      if (!sembol) return json(res, { hata: 'sembol gerekli' }, 400);
      return json(res, await detay(sembol));
    }

    // Netlify ile aynı sözleşme: tek arayüz iki hedefte de çalışsın.
    if (yol === '/api/tara') {
      const semboller = (url.searchParams.get('semboller') ?? '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      if (!semboller.length) return json(res, { hata: 'semboller gerekli' }, 400);

      const sonuclar = await Promise.all(
        semboller.map((s) => tekSembolOzet(s).catch((e) => ({ sembol: s, hata: e.message }))),
      );
      return json(res, {
        sonuclar: sonuclar.filter((s) => !s.hata),
        hatalar: sonuclar.filter((s) => s.hata),
      });
    }

    if (yol === '/api/haberler') {
      return json(res, {
        haberler: durum.haberler ?? [],
        olaylar: durum.olaylar ?? [],
        zaman: durum.guncelleme,
      });
    }

    // --- Statik dosyalar ---
    const dosya = yol === '/' ? 'index.html' : yol.slice(1);
    const tamYol = path.join(PUBLIC, dosya);
    // Dizin dışına çıkışı engelle
    if (!tamYol.startsWith(PUBLIC)) {
      res.writeHead(403); return res.end('Yasak');
    }
    if (!fs.existsSync(tamYol)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    const icerik = fs.readFileSync(tamYol);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(tamYol)] ?? 'application/octet-stream' });
    res.end(icerik);
  } catch (e) {
    hata('Sunucu hatası:', e.message);
    json(res, { hata: e.message }, 500);
  }
});

sunucu.listen(PORT, '0.0.0.0', async () => {
  const { networkInterfaces } = await import('node:os');
  const adresler = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);

  log(`Panel hazır → http://localhost:${PORT}`);
  for (const a of adresler) log(`  telefondan (aynı Wi-Fi) → http://${a}:${PORT}`);

  // Harem soketi push tabanlı: tek bağlantı açık kalır, veri kendiliğinden akar.
  harem = haremAkis();

  canliTazele();
  verileriTazele();

  setInterval(canliTazele, CANLI_ARALIK_MS);        // canlı fiyat: 30 sn
  setInterval(() => verileriTazele(), 30 * 60_000); // teknik analiz: 30 dk
});
