import { ASSET_MAP, AYARLAR } from './config.js';

/**
 * Anomali tespiti.
 *
 * İki bağımsız tetikleyici var:
 *  1) z-skor  — 30 dakikalık hareket, o varlığın kendi normalinin kaç katı?
 *     (Altın için %1 sert, Bitcoin için %1 sıradan. z-skor bu farkı otomatik çözer.)
 *  2) gün eşiği — gün içi toplam değişim varlığa özel eşiği aştı mı?
 *
 * Aynı taramada 2+ varlık tetiklenirse bu "rejim hareketi"dir: tek varlığın
 * gürültüsü değil, piyasa geneli bir şeye tepki veriyor. Önceliği yükseltilir.
 */
export function sinyalleriBul(anlik, durum) {
  const simdi = Date.now();
  const adaylar = [];

  for (const [key, v] of Object.entries(anlik)) {
    const asset = ASSET_MAP[key];
    if (!asset || v.turetilmis) continue; // türetilmiş varlıklar (gram altın) kaynaklarından tetiklenir

    const sebepler = [];
    if (Number.isFinite(v.z) && Math.abs(v.z) >= asset.esik.z) {
      sebepler.push({ tip: 'z', deger: v.z });
    }
    if (Number.isFinite(v.gun) && Math.abs(v.gun) >= asset.esik.gun) {
      sebepler.push({ tip: 'gun', deger: v.gun });
    }
    if (!sebepler.length) continue;

    // Aynı varlık için çok sık bildirim gönderme
    const sonGonderim = durum.sonBildirim[key] ?? 0;
    const bekleme = AYARLAR.bildirim_bekleme_dk * 60 * 1000;
    const susturulmus = simdi - sonGonderim < bekleme;

    adaylar.push({
      key,
      ad: v.ad,
      grup: v.grup,
      yon: (v.otuzDk ?? v.gun) >= 0 ? 'yukarı' : 'aşağı',
      fiyat: v.fiyat,
      otuzDk: v.otuzDk,
      ikiSaat: v.ikiSaat,
      gun: v.gun,
      z: v.z,
      sebepler,
      susturulmus,
      onem: 'normal',
    });
  }

  // Rejim kontrolü: birden çok varlık aynı anda mı oynadı?
  const rejim = adaylar.length >= AYARLAR.rejim_esigi;
  if (rejim) {
    for (const a of adaylar) {
      a.onem = 'kritik';
      a.rejim = true;
      // Rejim hareketinde susturmayı esnetiriz — gerçekten önemli bir şey oluyor
      a.susturulmus = a.susturulmus && Math.abs(a.z || 0) < 4;
    }
  }

  // Tek başına çok sert hareket de kritiktir
  for (const a of adaylar) {
    if (Math.abs(a.z || 0) >= 4.5) a.onem = 'kritik';
  }

  return {
    sinyaller: adaylar.filter((a) => !a.susturulmus).sort((a, b) => Math.abs(b.z || 0) - Math.abs(a.z || 0)),
    rejim,
    toplamAday: adaylar.length,
  };
}

/**
 * Çapraz varlık okuması: hangi varlıklar birlikte nasıl hareket etti?
 * Claude'a bağlam olarak verilir — "altın düştü + dolar yükseldi" tek başına
 * "altın düştü"den çok daha bilgilendirici.
 */
export function rejimOzeti(anlik) {
  const satirlar = [];
  for (const [key, v] of Object.entries(anlik)) {
    if (!Number.isFinite(v.gun)) continue;
    satirlar.push({
      ad: v.ad,
      gun: Number(v.gun.toFixed(2)),
      otuzDk: Number.isFinite(v.otuzDk) ? Number(v.otuzDk.toFixed(2)) : null,
      z: Number.isFinite(v.z) ? Number(v.z.toFixed(1)) : null,
    });
  }
  return satirlar.sort((a, b) => Math.abs(b.gun) - Math.abs(a.gun));
}
