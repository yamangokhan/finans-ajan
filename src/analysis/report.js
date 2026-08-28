import { makroTara, bistTara, hacimPatlamasi, enCokYukselen, enCokDusen, teknikSirali } from './screener.js';
import { detay } from './screener.js';
import { sayi, yuzde, log } from '../util.js';

const g = (v) => (v === null || v === undefined ? '   —  ' : yuzde(v).padStart(7));

function satir(x) {
  const t = x.teknik;
  const etiket = t ? t.etiket.padEnd(10) : '—'.padEnd(10);
  const hacim = x.baglam?.hacimOrani ? `${sayi(x.baglam.hacimOrani, 2)}x` : '  —  ';
  return (
    `${x.ad.slice(0, 16).padEnd(17)}` +
    `${sayi(x.fiyat, x.fiyat > 1000 ? 0 : 2).padStart(11)}  ` +
    `${g(x.getiri.gun)} ${g(x.getiri.hafta)} ${g(x.getiri.ay)} ${g(x.getiri.ucAy)} ${g(x.getiri.yil)}  ` +
    `${etiket} ${hacim.padStart(7)}`
  );
}

const BASLIK =
  'VARLIK                  FİYAT      GÜN    HAFTA      AY    3 AY     YIL  TEKNİK      HACİM';

export async function rapor() {
  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  MAKRO VARLIKLAR');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log(BASLIK);
  console.log('─'.repeat(88));

  const makro = await makroTara();
  for (const x of makro) console.log(satir(x));

  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  BIST TARAMASI');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  const bist = await bistTara({
    onIlerleme: (i, n, kod) => process.stdout.write(`\r  taranıyor ${i}/${n} (${kod})      `),
  });
  process.stdout.write('\r' + ' '.repeat(50) + '\r');

  console.log('\n▸ HACİM PATLAMASI (kendi 3 aylık ortalamasına göre en çok işlem görenler)');
  console.log(BASLIK);
  console.log('─'.repeat(88));
  for (const x of hacimPatlamasi(bist).slice(0, 8)) console.log(satir(x));

  console.log('\n▸ TEKNİK OLARAK EN GÜÇLÜ');
  console.log(BASLIK);
  console.log('─'.repeat(88));
  for (const x of teknikSirali(bist).slice(0, 8)) console.log(satir(x));

  console.log('\n▸ TEKNİK OLARAK EN ZAYIF');
  console.log(BASLIK);
  console.log('─'.repeat(88));
  for (const x of teknikSirali(bist).slice(-6).reverse()) console.log(satir(x));

  console.log('\n▸ GÜNÜN EN ÇOK YÜKSELENLERİ');
  for (const x of enCokYukselen(bist).slice(0, 5)) console.log(satir(x));

  console.log('\n▸ GÜNÜN EN ÇOK DÜŞENLERİ');
  for (const x of enCokDusen(bist).slice(0, 5)) console.log(satir(x));

  // Teknik dağılım
  const dagilim = {};
  for (const x of bist) {
    if (!x.teknik) continue;
    dagilim[x.teknik.etiket] = (dagilim[x.teknik.etiket] ?? 0) + 1;
  }
  console.log('\n▸ PİYASA GENELİ TEKNİK DAĞILIM (BIST)');
  for (const [k, v] of Object.entries(dagilim).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k.padEnd(12)} ${String(v).padStart(3)} hisse  ${'█'.repeat(v)}`);
  }

  console.log('\n<i>Bu tablo mevcut durumun ölçümüdür, gelecek tahmini değildir.</i>\n');
  return { makro, bist };
}

/** Tek varlığın indikatör indikatör dökümü. */
export async function detayYazdir(sembol) {
  const d = await detay(sembol);
  const o = d.ozet;
  if (!o.yeterliVeri) {
    console.log(`${sembol}: yetersiz veri (${o.barSayisi} bar)`);
    return;
  }
  console.log(`\n${sembol} — ${sayi(o.fiyat, 2)}`);
  console.log(`GENEL: ${o.genel.etiket}  (puan ${o.genel.puan})`);
  console.log(`  Hareketli ortalamalar: ${o.hareketliOrtalamalar.etiket}  (${o.hareketliOrtalamalar.al} al / ${o.hareketliOrtalamalar.notr} nötr / ${o.hareketliOrtalamalar.sat} sat)`);
  console.log(`  Osilatörler          : ${o.osilatorler.etiket}  (${o.osilatorler.al} al / ${o.osilatorler.notr} nötr / ${o.osilatorler.sat} sat)`);
  console.log('\n  OSİLATÖRLER');
  for (const s of o.osilatorler.satirlar) {
    console.log(`    ${s.ad.padEnd(24)} ${String(s.deger).padStart(10)}  ${s.oyAdi.padEnd(5)} ${s.aciklama ?? ''}`);
  }
  console.log('\n  HAREKETLİ ORTALAMALAR');
  for (const s of o.hareketliOrtalamalar.satirlar) {
    console.log(`    ${s.ad.padEnd(24)} ${sayi(s.deger, 2).padStart(10)}  ${s.oyAdi}`);
  }
  console.log('\n  BAĞLAM');
  console.log(`    Trend gücü (ADX)     ${o.baglam.trendGucu}  — ${o.baglam.trendYorumu}`);
  console.log(`    Yıllık oynaklık      %${o.baglam.oynaklikYillik}`);
  console.log(`    1 yılın max düşüşü   %${o.baglam.maxDusus1Y}`);
  console.log(`    52h zirveye uzaklık  %${o.baglam.zirve52Uzaklik}`);
  console.log(`    52h dibe uzaklık     %${o.baglam.dip52Uzaklik}`);
  console.log(`    Hacim oranı          ${o.baglam.hacimOrani}x`);
  console.log('');
}
