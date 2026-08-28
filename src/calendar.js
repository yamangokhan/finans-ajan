import fs from 'node:fs/promises';
import path from 'node:path';
import { VERI_DIZIN } from './store.js';
import { ASSET_MAP } from './config.js';
import { hata } from './util.js';

// Türkiye 2016'dan beri yaz saati uygulamıyor: sabit UTC+3.
const TR_OFSET_SAAT = 3;

/** Türkiye saatiyle verilen tarihi UTC epoch'a çevirir. */
function trTarih(yil, ay, gun, saat, dakika) {
  return Date.UTC(yil, ay - 1, gun, saat - TR_OFSET_SAAT, dakika);
}

function saatAyir(saatMetni) {
  const [s, d] = (saatMetni ?? '10:00').split(':').map(Number);
  return { saat: s || 0, dakika: d || 0 };
}

/** Bir ayın ilk cuma gününün gün numarası. */
function ayinIlkCumasi(yil, ay) {
  for (let g = 1; g <= 7; g++) {
    // getUTCDay: 0=Pazar ... 5=Cuma
    if (new Date(Date.UTC(yil, ay - 1, g)).getUTCDay() === 5) return g;
  }
  return 1;
}

/** Kurala göre, verilen andan sonraki ilk oluşumu bulur. */
function sonrakiOlusum(kural, saatMetni, simdi) {
  const { saat, dakika } = saatAyir(saatMetni);
  const d = new Date(simdi);

  for (let ileri = 0; ileri < 3; ileri++) {
    const yil = d.getUTCFullYear();
    const ay = d.getUTCMonth() + 1 + ileri;
    const normYil = yil + Math.floor((ay - 1) / 12);
    const normAy = ((ay - 1) % 12) + 1;

    let gun;
    if (kural.startsWith('ayin-gunu:')) {
      gun = Number(kural.split(':')[1]);
    } else if (kural === 'ayin-ilk-cuma') {
      gun = ayinIlkCumasi(normYil, normAy);
    } else {
      return null; // bilinmeyen kural
    }

    const zaman = trTarih(normYil, normAy, gun, saat, dakika);
    if (zaman > simdi) return zaman;
  }
  return null;
}

let onbellek = null;
async function takvimOku() {
  if (onbellek) return onbellek;
  try {
    const ham = await fs.readFile(path.join(VERI_DIZIN, 'calendar.json'), 'utf8');
    onbellek = JSON.parse(ham);
  } catch (e) {
    hata('Takvim okunamadı:', e.message);
    onbellek = { tekrarlayan: [], planli: [] };
  }
  return onbellek;
}

/**
 * SAF hesaplama — takvim verisi dışarıdan verilir, dosya sistemi kullanmaz.
 * Netlify fonksiyonları bunu çağırır (orada fs yok, JSON import edilir).
 */
export function olaylariHesapla(t, saatPenceresi = 72, simdi = Date.now()) {
  const sinir = simdi + saatPenceresi * 3600 * 1000;
  const liste = [];

  for (const o of t.tekrarlayan ?? []) {
    const zaman = sonrakiOlusum(o.kural, o.saat, simdi);
    if (zaman && zaman <= sinir) liste.push({ ...o, zaman, kaynak: 'kural' });
  }

  for (const o of t.planli ?? []) {
    // planli girdilerde "tarih": "2026-09-11T21:00:00+03:00" bekleniyor
    const zaman = new Date(o.tarih).getTime();
    if (Number.isFinite(zaman) && zaman > simdi && zaman <= sinir) {
      liste.push({ ...o, zaman, kaynak: 'planlı' });
    }
  }

  return liste.sort((a, b) => a.zaman - b.zaman);
}

/** Dosya sistemli sarmalayıcı — yerel sunucu ve bot bunu kullanır. */
export async function yaklasanOlaylar(saatPenceresi = 72, simdi = Date.now()) {
  return olaylariHesapla(await takvimOku(), saatPenceresi, simdi);
}

export function etkilenenVarliklar(olay) {
  return (olay.etkiler ?? []).map((k) => ASSET_MAP[k]?.ad ?? k).join(', ');
}

/** Takvim dosyası değiştirilirse önbelleği düşür. */
export const onbellegiTemizle = () => { onbellek = null; };
