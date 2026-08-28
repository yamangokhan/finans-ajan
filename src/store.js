import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERI_DIZIN = path.join(KOK, 'data');

async function oku(dosya, varsayilan) {
  try {
    const ham = await fs.readFile(path.join(VERI_DIZIN, dosya), 'utf8');
    return JSON.parse(ham);
  } catch {
    return varsayilan;
  }
}

async function yaz(dosya, veri) {
  await fs.mkdir(VERI_DIZIN, { recursive: true });
  const hedef = path.join(VERI_DIZIN, dosya);
  const gecici = `${hedef}.tmp`;
  await fs.writeFile(gecici, JSON.stringify(veri, null, 2), 'utf8');
  await fs.rename(gecici, hedef); // atomik yazım — yarıda kesilirse dosya bozulmasın
}

const VARSAYILAN_DURUM = {
  sonBildirim: {},      // { assetKey: epoch_ms }
  gonderilenHaberler: [], // son görülen haber başlıkları (tekrar önleme)
  gunlukSayac: { tarih: null, adet: 0 },
  sonPanorama: null,    // 'YYYY-MM-DD'
  uyarilanOlaylar: [],  // takvimde uyarısı gönderilmiş olay id'leri
  telegramOffset: 0,
};

export async function durumOku() {
  const d = await oku('state.json', {});
  return { ...VARSAYILAN_DURUM, ...d };
}

export const durumYaz = (d) => yaz('state.json', d);

const VARSAYILAN_PORTFOY = {
  varliklar: [],  // { key, ad, miktar, maliyet, tarih }
  hedefDagilim: {}, // { 'metal': 30, 'hisse': 30, 'kur': 20, 'nakit': 20 }
  kurallar: [],   // { id, aciklama, varlik, tip, deger, aktif }
};

export async function portfoyOku() {
  const p = await oku('portfolio.json', {});
  return { ...VARSAYILAN_PORTFOY, ...p };
}

export const portfoyYaz = (p) => yaz('portfolio.json', p);

/** Günlük fiyat anlık görüntüsü — reel getiri ve geçmiş analiz için birikir. */
export async function fiyatKaydet(tarih, anlik) {
  const dizin = path.join(VERI_DIZIN, 'prices');
  await fs.mkdir(dizin, { recursive: true });
  await fs.writeFile(path.join(dizin, `${tarih}.json`), JSON.stringify(anlik, null, 2), 'utf8');
}
