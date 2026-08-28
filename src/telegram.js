import { getir, hata, log } from './util.js';

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const CHAT = () => process.env.TELEGRAM_CHAT_ID;

const api = (metot) => `https://api.telegram.org/bot${TOKEN()}/${metot}`;

/** HTML parse_mode için kaçış. Telegram sadece bu üçünü ister. */
export const kacis = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function gonder(metin, { sessiz = false } = {}) {
  if (!TOKEN() || !CHAT()) {
    hata('Telegram yapılandırılmamış (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
    return false;
  }
  // Telegram mesaj sınırı 4096 karakter
  const parcalar = [];
  let kalan = metin;
  while (kalan.length > 4000) {
    let kes = kalan.lastIndexOf('\n', 4000);
    if (kes < 2000) kes = 4000;
    parcalar.push(kalan.slice(0, kes));
    kalan = kalan.slice(kes);
  }
  parcalar.push(kalan);

  for (const p of parcalar) {
    try {
      const res = await getir(api('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT(),
          text: p,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: sessiz,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        hata('Telegram gönderimi reddedildi:', j.description);
        return false;
      }
    } catch (e) {
      hata('Telegram gönderilemedi:', e.message);
      return false;
    }
  }
  return true;
}

/**
 * Yeni mesajları çeker (long polling). offset, işlenmiş son update_id + 1 olmalı;
 * böylece aynı komut iki kez çalışmaz.
 */
export async function guncellemeAl(offset, bekleme = 25) {
  try {
    const res = await getir(
      `${api('getUpdates')}?offset=${offset}&timeout=${bekleme}&allowed_updates=["message"]`,
      {},
      { deneme: 1, zamanAsimi: (bekleme + 10) * 1000 },
    );
    const j = await res.json();
    if (!j.ok) return { guncellemeler: [], yeniOffset: offset };
    const g = j.result ?? [];
    const yeniOffset = g.length ? g.at(-1).update_id + 1 : offset;
    return { guncellemeler: g, yeniOffset };
  } catch (e) {
    // long polling'de zaman aşımı normal
    if (!/abort/i.test(e.message)) hata('Telegram güncellemesi alınamadı:', e.message);
    return { guncellemeler: [], yeniOffset: offset };
  }
}

export async function botBilgi() {
  const res = await getir(api('getMe'));
  const j = await res.json();
  if (!j.ok) throw new Error(j.description);
  log(`Bot bağlandı: @${j.result.username}`);
  return j.result;
}
