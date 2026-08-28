import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AYARLAR, ASSETS } from './config.js';
import { log, hata, sleep, sayi, yuzde, ok, trNow } from './util.js';
import { durumOku, durumYaz, fiyatKaydet } from './store.js';
import { piyasayiTara, tcmbKur } from './sources/market.js';
import { haberleriTopla, haberEslestir } from './sources/news.js';
import { sinyalleriBul, rejimOzeti } from './detect.js';
import { notYaz, baglantiTest } from './analyst.js';
import { gonder, guncellemeAl, botBilgi, kacis } from './telegram.js';
import { yaklasanOlaylar, etkilenenVarliklar } from './calendar.js';

// --- .env yükleyici (harici bağımlılık istemiyoruz) ---
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function envYukle() {
  const dosya = path.join(KOK, '.env');
  if (!fs.existsSync(dosya)) return;
  for (const satir of fs.readFileSync(dosya, 'utf8').split('\n')) {
    const t = satir.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const anahtar = t.slice(0, i).trim();
    const deger = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(anahtar in process.env)) process.env[anahtar] = deger;
  }
}
envYukle();

// ---------------- Biçimlendirme ----------------

const GRUP_BASLIK = {
  metal: '🥇 Metal', kur: '💵 Kur', hisse: '📈 Hisse',
  emtia: '🛢 Emtia', makro: '🌍 Makro', kripto: '₿ Kripto',
};

function panoramaMetni(anlik, kur) {
  const t = trNow();
  const satirlar = [`📊 <b>PANORAMA</b> — ${t.metin}`, ''];

  const sirali = ['metal', 'kur', 'hisse', 'emtia', 'makro', 'kripto'];
  for (const grup of sirali) {
    const uyeler = Object.values(anlik).filter((v) => v.grup === grup);
    if (!uyeler.length) continue;
    satirlar.push(`<b>${GRUP_BASLIK[grup] ?? grup}</b>`);
    for (const v of uyeler) {
      const basamak = v.fiyat > 1000 ? 0 : 2;
      satirlar.push(
        `${ok(v.gun)} ${kacis(v.ad)} — <b>${sayi(v.fiyat, basamak)}</b> ${v.birim === 'idx' ? '' : v.birim}\n` +
        `   gün ${yuzde(v.gun)} · hafta ${yuzde(v.hafta)} · ay ${yuzde(v.ay)} · yıl ${yuzde(v.yil)}`,
      );
    }
    satirlar.push('');
  }

  if (kur) {
    satirlar.push(`<i>TCMB resmî: USD ${sayi(kur.usd, 4)} · EUR ${sayi(kur.eur, 4)}</i>`);
  }
  satirlar.push('<i>Bilgi amaçlıdır, yatırım tavsiyesi değildir.</i>');
  return satirlar.join('\n');
}

function sinyalMetni(sinyal, not, haberler) {
  const simge = sinyal.yon === 'yukarı' ? '🟢' : '🔴';
  const rozet = sinyal.onem === 'kritik' ? ' ⚠️' : '';
  const basamak = sinyal.fiyat > 1000 ? 0 : 2;

  const bas = [
    `${simge} <b>${kacis(sinyal.ad)}</b> ${sinyal.yon}${rozet}`,
    `<b>${sayi(sinyal.fiyat, basamak)}</b> · 30dk ${yuzde(sinyal.otuzDk)} · gün ${yuzde(sinyal.gun)}`,
    Number.isFinite(sinyal.z)
      ? `Kendi normalinin <b>${sayi(Math.abs(sinyal.z), 1)} katı</b> hareket`
      : '',
    sinyal.rejim ? '🌐 <b>Rejim hareketi</b> — birden fazla varlık aynı anda oynadı' : '',
    '',
  ].filter(Boolean);

  if (not) {
    bas.push(
      `<b>Ne oldu</b>\n${kacis(not.ozet)}`,
      '',
      `<b>Muhtemel sebep</b> <i>(güven: ${kacis(not.guven)})</i>\n${kacis(not.sebep)}`,
      '',
      `<b>Bağlantı</b>\n${kacis(not.baglanti)}`,
      '',
      `<b>Dikkat</b>\n${kacis(not.dikkat)}`,
    );
  } else if (haberler?.length) {
    bas.push('<b>İlgili başlıklar</b>');
    for (const h of haberler.slice(0, 3)) bas.push(`• ${kacis(h.baslik)} <i>(${kacis(h.kaynak)})</i>`);
  } else {
    bas.push('<i>Analiz notu üretilemedi (ANTHROPIC_API_KEY tanımlı mı?). Ham veri yukarıda.</i>');
  }

  bas.push('', '<i>Bilgi amaçlıdır, yatırım tavsiyesi değildir.</i>');
  return bas.join('\n');
}

function takvimMetni(olay, saatKala) {
  return [
    `📅 <b>${saatKala} saat sonra: ${kacis(olay.ad)}</b>`,
    `Etkileyebileceği varlıklar: ${kacis(etkilenenVarliklar(olay))}`,
    olay.not ? `\n${kacis(olay.not)}` : '',
    '',
    '<i>Bilgi amaçlıdır, yatırım tavsiyesi değildir.</i>',
  ].filter(Boolean).join('\n');
}

// ---------------- Bildirim kapısı ----------------

function sessizSaatte() {
  const bas = Number(process.env.SESSIZ_BASLANGIC ?? 0);
  const bit = Number(process.env.SESSIZ_BITIS ?? 7);
  const s = trNow().saat;
  return bas < bit ? s >= bas && s < bit : s >= bas || s < bit;
}

/** Gürültü kontrolü: günlük limit + sessiz saat. Kritik olanlar geçer. */
async function bildirimGonder(metin, onem, durum) {
  const bugun = trNow().tarih;
  if (durum.gunlukSayac.tarih !== bugun) durum.gunlukSayac = { tarih: bugun, adet: 0 };

  const kritik = onem === 'kritik';
  if (!kritik && durum.gunlukSayac.adet >= AYARLAR.gunluk_bildirim_limiti) {
    log('Günlük bildirim limiti doldu, atlanıyor');
    return false;
  }
  if (!kritik && sessizSaatte()) {
    log('Sessiz saat, kritik olmayan bildirim atlanıyor');
    return false;
  }

  const basarili = await gonder(metin, { sessiz: sessizSaatte() && !kritik });
  if (basarili) durum.gunlukSayac.adet++;
  return basarili;
}

// ---------------- Ana tarama ----------------

async function taramaYap({ zorlaPanorama = false } = {}) {
  const durum = await durumOku();
  const t = trNow();

  log('Piyasa taranıyor…');
  const anlik = await piyasayiTara();
  const varlikSayisi = Object.keys(anlik).length;
  if (!varlikSayisi) {
    hata('Hiçbir varlık okunamadı, tarama atlanıyor');
    return;
  }
  log(`${varlikSayisi} varlık okundu`);

  // Günlük anlık görüntüyü sakla (reel getiri ve geçmiş analiz için birikir)
  await fiyatKaydet(t.tarih, anlik);

  // --- Günlük panorama ---
  if (zorlaPanorama || (t.saat === AYARLAR.panorama_saati && durum.sonPanorama !== t.tarih)) {
    const kur = await tcmbKur();
    await gonder(panoramaMetni(anlik, kur));
    durum.sonPanorama = t.tarih;
    log('Panorama gönderildi');
  }

  // --- Takvim uyarıları ---
  const olaylar = await yaklasanOlaylar(AYARLAR.takvim_uyari_saat + 1);
  for (const o of olaylar) {
    const saatKala = Math.round((o.zaman - Date.now()) / 3600000);
    const isaret = `${o.id}:${new Date(o.zaman).toISOString().slice(0, 13)}`;
    if (durum.uyarilanOlaylar.includes(isaret)) continue;
    if (saatKala > AYARLAR.takvim_uyari_saat) continue;

    await bildirimGonder(takvimMetni(o, Math.max(saatKala, 0)), o.onem ?? 'normal', durum);
    durum.uyarilanOlaylar.push(isaret);
    if (durum.uyarilanOlaylar.length > 200) durum.uyarilanOlaylar = durum.uyarilanOlaylar.slice(-100);
    log(`Takvim uyarısı gönderildi: ${o.ad}`);
  }

  // --- Anomali tespiti ---
  const { sinyaller, rejim, toplamAday } = sinyalleriBul(anlik, durum);
  log(`Tetiklenen: ${toplamAday}, gönderilecek: ${sinyaller.length}${rejim ? ' (REJİM)' : ''}`);

  if (sinyaller.length) {
    const haberler = await haberleriTopla();
    log(`${haberler.length} haber başlığı toplandı`);
    const rejimTablosu = rejimOzeti(anlik);

    // Rejim varsa en sert 2 varlığı bildir; değilse en sert 1 tanesini.
    // Amaç: aynı olay için 5 ayrı bildirim atmamak.
    const gonderilecek = rejim ? sinyaller.slice(0, 2) : sinyaller.slice(0, 1);

    for (const s of gonderilecek) {
      const ilgili = haberEslestir(s.key, haberler, Date.now());
      const not = await notYaz({ sinyal: s, rejim: rejimTablosu, haberler: ilgili });
      const onem = not?.onem === 'düşük' ? 'düşük' : s.onem;
      if (onem === 'düşük' && !s.rejim) {
        log(`${s.ad}: model "düşük önem" dedi, atlanıyor`);
        durum.sonBildirim[s.key] = Date.now();
        continue;
      }
      const gitti = await bildirimGonder(sinyalMetni(s, not, ilgili), onem, durum);
      if (gitti) {
        durum.sonBildirim[s.key] = Date.now();
        log(`Bildirim gönderildi: ${s.ad}`);
      }
    }
  }

  await durumYaz(durum);
}

// ---------------- Telegram komutları ----------------

async function komutIsle(metin) {
  const komut = metin.trim().split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');

  switch (komut) {
    case '/start':
    case '/yardim': {
      await gonder([
        '👋 <b>Finans Ajanı</b>',
        '',
        'Piyasayı 7/24 izliyorum. Anormal bir hareket olduğunda haberlerle eşleştirip sana bilgi notu gönderiyorum.',
        '',
        '<b>Komutlar</b>',
        '/durum — anlık panorama',
        '/takvim — yaklaşan olaylar',
        '/tara — şimdi tara (test)',
        '/yardim — bu mesaj',
        '',
        '<i>Bilgi amaçlıdır, yatırım tavsiyesi değildir.</i>',
      ].join('\n'));
      break;
    }

    case '/durum':
    case '/panorama': {
      await gonder('⏳ Veriler çekiliyor (~30 sn)…');
      const anlik = await piyasayiTara();
      const kur = await tcmbKur();
      await gonder(panoramaMetni(anlik, kur));
      break;
    }

    case '/takvim': {
      const olaylar = await yaklasanOlaylar(24 * 14);
      if (!olaylar.length) {
        await gonder('📅 Önümüzdeki 14 günde kayıtlı olay yok.\n\n<i>data/calendar.json içindeki "planli" listesine Fed/PPK tarihlerini ekleyebilirsin.</i>');
        break;
      }
      const satirlar = ['📅 <b>Yaklaşan olaylar</b>', ''];
      for (const o of olaylar) {
        const d = trNow(new Date(o.zaman));
        satirlar.push(`<b>${d.metin}</b> — ${kacis(o.ad)}\n   ${kacis(etkilenenVarliklar(o))}`);
      }
      await gonder(satirlar.join('\n'));
      break;
    }

    case '/tara': {
      await gonder('⏳ Tarama başladı…');
      await taramaYap();
      await gonder('✅ Tarama bitti.');
      break;
    }

    default:
      await gonder('Anlamadım. /yardim yazarak komutları görebilirsin.');
  }
}

async function komutDongusu() {
  let durum = await durumOku();
  let offset = durum.telegramOffset ?? 0;

  for (;;) {
    try {
      const { guncellemeler, yeniOffset } = await guncellemeAl(offset);
      if (yeniOffset !== offset) {
        offset = yeniOffset;
        durum = await durumOku();
        durum.telegramOffset = offset;
        await durumYaz(durum);
      }
      for (const g of guncellemeler) {
        const metin = g.message?.text;
        if (!metin) continue;
        // Sadece yetkili sohbetten komut kabul et
        if (String(g.message.chat.id) !== String(process.env.TELEGRAM_CHAT_ID)) continue;
        log(`Komut alındı: ${metin}`);
        await komutIsle(metin).catch((e) => hata('Komut hatası:', e.message));
      }
    } catch (e) {
      hata('Komut döngüsü:', e.message);
      await sleep(5000);
    }
  }
}

async function taramaDongusu() {
  for (;;) {
    try {
      await taramaYap();
    } catch (e) {
      hata('Tarama hatası:', e.stack ?? e.message);
    }
    await sleep(AYARLAR.tarama_saniye * 1000);
  }
}

// ---------------- Giriş ----------------

async function veriTesti() {
  log('--- Veri kaynağı testi ---');
  const anlik = await piyasayiTara();
  for (const a of ASSETS) {
    const v = anlik[a.key];
    console.log(
      v
        ? `  OK   ${a.ad.padEnd(16)} ${sayi(v.fiyat, 2).padStart(12)}  gün ${yuzde(v.gun)}  z=${sayi(v.z, 1)}`
        : `  FAIL ${a.ad}`,
    );
  }
  if (anlik.gram_altin) console.log(`  OK   ${'Gram Altın'.padEnd(16)} ${sayi(anlik.gram_altin.fiyat, 2).padStart(12)} TL (türetilmiş)`);

  const kur = await tcmbKur();
  console.log(kur ? `  OK   TCMB USD=${kur.usd} EUR=${kur.eur}` : '  FAIL TCMB');

  const haberler = await haberleriTopla();
  console.log(`  OK   ${haberler.length} haber başlığı (son ${AYARLAR.haber_pencere_saat} saat)`);

  const olaylar = await yaklasanOlaylar(24 * 30);
  console.log(`  OK   ${olaylar.length} yaklaşan olay (30 gün)`);
  for (const o of olaylar.slice(0, 5)) console.log(`       ${trNow(new Date(o.zaman)).metin} — ${o.ad}`);

  const claude = await baglantiTest();
  console.log(`  ${claude.ok ? 'OK  ' : 'FAIL'} Claude: ${claude.mesaj}`);
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--test') return veriTesti();

  await botBilgi();

  if (arg === '--panorama') {
    const anlik = await piyasayiTara();
    const kur = await tcmbKur();
    await gonder(panoramaMetni(anlik, kur));
    return;
  }

  // --once: cron (GitHub Actions) bunu 5 dakikada bir çağırır.
  // Panoramayı ZORLAMAZ — günlük panorama zaten saatine göre bir kez gönderiliyor;
  // zorlansa her taramada tekrar giderdi.
  if (arg === '--once') return taramaYap();

  log(`Finans Ajanı başladı — her ${AYARLAR.tarama_saniye / 60} dakikada bir tarama`);
  await gonder('🟢 <b>Finans Ajanı devrede.</b>\nPiyasayı izlemeye başladım. /yardim ile komutları görebilirsin.');

  // İki bağımsız döngü: piyasa taraması + Telegram komutları
  await Promise.all([taramaDongusu(), komutDongusu()]);
}

main().catch((e) => {
  hata('Ölümcül hata:', e.stack ?? e.message);
  process.exit(1);
});
