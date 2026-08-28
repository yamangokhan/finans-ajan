import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from './config.js';
import { hata, log } from './util.js';

let istemci = null;
function client() {
  if (!istemci) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    istemci = new Anthropic();
  }
  return istemci;
}

// Bu metin her istekte aynı kalır → önbelleğe alınır (tekrar eden istekler ~%90 ucuzlar).
// Değiştirirsen önbellek sıfırlanır; sık değiştirme.
const SISTEM = `Sen bir piyasa gözlemcisisin. Görevin, ölçülmüş bir fiyat hareketini haber akışıyla eşleştirip kısa bir BİLGİ NOTU yazmak.

Kuralların:
1. ASLA yatırım tavsiyesi verme. "Al", "sat", "gir", "çık" deme. Görevin ne olduğunu ve neden olmuş olabileceğini açıklamak.
2. Sebep konusunda dürüst ol. Haberler hareketi açıklamıyorsa "net bir sebep görünmüyor" de. Uydurma.
3. Çapraz varlık okumasını kullan. Altın düştü + dolar yükseldi + tahvil faizi arttı = faiz beklentisi. Altın düştü + hisse de düştü + VIX yükseldi = nakde kaçış. Bunları ayırt et.
4. Kısa yaz. Her alan en fazla 2 cümle. Telefonda okunacak.
5. Türkçe yaz, sade dille. Jargon kullanacaksan parantezde açıkla.
6. Güven seviyesini gerçekçi ver: haber hareketin saatiyle örtüşüyor ve doğrudan ilgiliyse "yüksek"; ilgili ama dolaylıysa "orta"; eşleşme zayıfsa "düşük".`;

const SEMA = {
  type: 'object',
  properties: {
    ozet: { type: 'string', description: 'Ne oldu? Tek cümle, sayılarla.' },
    sebep: { type: 'string', description: 'Muhtemel sebep. Haber varsa kaynağıyla. Yoksa açıkça belirt.' },
    guven: { type: 'string', enum: ['yüksek', 'orta', 'düşük'], description: 'Sebep-sonuç bağının güvenilirliği' },
    baglanti: { type: 'string', description: 'Çapraz varlık okuması: diğer varlıklar ne yaptı, bu ne anlatıyor?' },
    dikkat: { type: 'string', description: 'Sırada ne var, neye bakmalı? Tavsiye değil, gözlem noktası.' },
    onem: { type: 'string', enum: ['kritik', 'normal', 'düşük'], description: 'Kullanıcıyı gerçekten ilgilendirir mi?' },
  },
  required: ['ozet', 'sebep', 'guven', 'baglanti', 'dikkat', 'onem'],
  additionalProperties: false,
};

/**
 * Hareket + çapraz varlık tablosu + aday haberler -> yapılandırılmış bilgi notu.
 * API anahtarı yoksa null döner (bot yine de ham veriyle bildirim gönderir).
 */
export async function notYaz({ sinyal, rejim, haberler, portfoyNotu }) {
  const c = client();
  if (!c) return null;

  const haberMetni = haberler.length
    ? haberler.map((h) => `- [${new Date(h.zaman).toISOString().slice(11, 16)}Z] ${h.baslik} (${h.kaynak})`).join('\n')
    : '(ilgili haber bulunamadı)';

  const rejimMetni = rejim
    .map((r) => `${r.ad}: gün ${r.gun >= 0 ? '+' : ''}${r.gun}%${r.otuzDk !== null ? `, 30dk ${r.otuzDk >= 0 ? '+' : ''}${r.otuzDk}%` : ''}${r.z !== null ? `, z=${r.z}` : ''}`)
    .join('\n');

  const kullanici = `HAREKET
${sinyal.ad}: 30 dakikada ${sinyal.otuzDk?.toFixed(2)}%, gün toplamı ${sinyal.gun?.toFixed(2)}%, z-skor ${sinyal.z?.toFixed(1)} (kendi normalinin ${Math.abs(sinyal.z || 0).toFixed(1)} katı)
Güncel fiyat: ${sinyal.fiyat?.toFixed(2)}
${sinyal.rejim ? 'NOT: Aynı anda birden fazla varlık tetiklendi — piyasa geneli hareket.' : ''}

TÜM PİYASA (aynı an)
${rejimMetni}

SON 4 SAATİN HABER BAŞLIKLARI (alaka puanına göre)
${haberMetni}
${portfoyNotu ? `\nKULLANICININ PORTFÖYÜ\n${portfoyNotu}` : ''}

Bu hareket için bilgi notu yaz.`;

  try {
    const yanit = await c.messages.create({
      model: MODEL,
      max_tokens: 4000, // Opus 5'te düşünme varsayılan olarak açık — payı bırakıyoruz
      output_config: {
        effort: 'medium', // kısa analiz notu; 7/24 döngüde maliyet önemli
        format: { type: 'json_schema', schema: SEMA },
      },
      system: [{ type: 'text', text: SISTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: kullanici }],
    });

    if (yanit.stop_reason === 'refusal') {
      hata('Model isteği reddetti:', yanit.stop_details?.category);
      return null;
    }

    const metin = yanit.content.find((b) => b.type === 'text')?.text;
    if (!metin) return null;
    return JSON.parse(metin);
  } catch (e) {
    hata('Analiz notu üretilemedi:', e.message);
    return null;
  }
}

/** Basit sağlık kontrolü — anahtar çalışıyor mu? */
export async function baglantiTest() {
  const c = client();
  if (!c) return { ok: false, mesaj: 'ANTHROPIC_API_KEY tanımlı değil' };
  try {
    const r = await c.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: 'Sadece "hazır" yaz.' }],
    });
    const t = r.content.find((b) => b.type === 'text')?.text ?? '';
    log('Claude bağlantısı:', t.trim().slice(0, 40));
    return { ok: true, mesaj: t.trim() };
  } catch (e) {
    return { ok: false, mesaj: e.message };
  }
}
