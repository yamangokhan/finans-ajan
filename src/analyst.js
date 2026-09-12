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

// ---------------- Günün notu (panel brifingi) ----------------

// Tek bir hareketi değil, GÜNÜN TAMAMINI yorumlar. Kurallar notYaz ile aynı
// çizgide: tavsiye yok, uydurma yok, belirsizlik açıkça yazılır.
const BRIFING_SISTEM = `Sen bir piyasa brifingi yazarısın. Sana günün ölçülmüş verisi, TCMB/TÜİK resmî göstergeleri, haber başlıkları ve yaklaşan takvim olayları veriliyor. Türkiye'deki bireysel bir yatırımcının anlayacağı bir günlük not yazacaksın.

Kuralların:
1. ASLA yatırım tavsiyesi verme. "Al", "sat", "gir", "çık", "şuraya yatır", "portföyünün %X'i" deme. Görevin ne olduğunu, neden olmuş olabileceğini ve neye bakmak gerektiğini anlatmak.
2. Fiyat tahmini yapma. "Yükselecek", "düşecek", "hedef şu seviye" deme. Olasılıkları anlatacaksan neye bağlı olduğunu söyle.
3. Uydurma. Sana verilmeyen bir haberi, rakamı veya olayı yazma. Veri yetersizse "bunu söyleyecek veri yok" de.
4. Sebep-sonuç kurarken dürüst ol. Haber hareketi açıklamıyorsa "net bir sebep görünmüyor" yaz. Korelasyonu nedensellik gibi sunma.
5. Çapraz okuma yap: dolar + altın + faiz + BIST + VIX birlikte ne anlatıyor? Tek varlığa bakıp hüküm verme.
6. Enflasyonu hesaba kat. Türkiye'de nominal getiri yanıltıcıdır; reel (enflasyondan arındırılmış) tarafı hatırlat.
7. Kısa ve sade yaz. Telefonda okunacak. Jargon kullanacaksan parantezde açıkla.
8. Türkçe yaz.`;

const BRIFING_SEMA = {
  type: 'object',
  properties: {
    manset: { type: 'string', description: 'Günü tek cümlede özetleyen başlık. Abartısız.' },
    ozet: { type: 'string', description: 'Bugün piyasada ne oldu? 2-3 cümle, sayılarla.' },
    surukleyiciler: {
      type: 'array',
      description: 'Günü sürükleyen 2-4 etken. Her biri için ne olduğu ve hangi varlıkları etkilediği.',
      items: {
        type: 'object',
        properties: {
          baslik: { type: 'string' },
          aciklama: { type: 'string', description: 'En fazla 2 cümle. Haber varsa kaynağıyla.' },
          etkilenen: { type: 'string', description: 'Etkilediği varlıklar, virgülle' },
          guven: { type: 'string', enum: ['yüksek', 'orta', 'düşük'], description: 'Bu bağlantıya güvenin' },
        },
        required: ['baslik', 'aciklama', 'etkilenen', 'guven'],
        additionalProperties: false,
      },
    },
    carprazOkuma: { type: 'string', description: 'Varlıklar birlikte ne anlatıyor? Faiz/enflasyon/kur zinciri.' },
    reelBakis: { type: 'string', description: 'Enflasyon karşısında bugünün anlamı. Alım gücü tarafı.' },
    takvim: {
      type: 'array',
      description: 'Yaklaşan olaylardan önemli olanlar ve neden önemli oldukları.',
      items: {
        type: 'object',
        properties: {
          olay: { type: 'string' },
          neZaman: { type: 'string' },
          nedenOnemli: { type: 'string', description: 'En fazla 2 cümle' },
        },
        required: ['olay', 'neZaman', 'nedenOnemli'],
        additionalProperties: false,
      },
    },
    izlenecekler: {
      type: 'array',
      description: 'Önümüzdeki günlerde bakılacak 2-4 gözlem noktası. Tavsiye değil, gösterge.',
      items: { type: 'string' },
    },
    belirsizlik: { type: 'string', description: 'Bu notun neyi BİLMEDİĞİ. Dürüst ol.' },
  },
  required: ['manset', 'ozet', 'surukleyiciler', 'carprazOkuma', 'reelBakis', 'takvim', 'izlenecekler', 'belirsizlik'],
  additionalProperties: false,
};

const say = (n, b = 2) => (Number.isFinite(n) ? n.toFixed(b) : '—');

/**
 * Günlük piyasa brifingi. Anahtar yoksa null döner (panel bölümü gizler).
 * @param {{anlik: object, evds: object|null, haberler: array, olaylar: array}} girdi
 */
export async function gunlukNot({ anlik, evds, haberler = [], olaylar = [] }) {
  const c = client();
  if (!c) return null;

  const varliklar = Object.values(anlik ?? {})
    .map((v) => `${v.ad}: ${say(v.fiyat)} ${v.birim ?? ''} | gün ${say(v.gun)}% · hafta ${say(v.hafta)}% · ay ${say(v.ay)}% · yıl ${say(v.yil)}%`)
    .join('\n') || '(varlık verisi yok)';

  const g = evds?.gostergeler ?? {};
  const makro = [
    g.politikaFaizi && `TCMB politika faizi: ${say(g.politikaFaizi.deger)}% (${g.politikaFaizi.tarih})`,
    g.tufeYillik && `Yıllık TÜFE enflasyonu: ${say(g.tufeYillik.deger)}% (${g.tufeYillik.tarih})`,
    evds?.enflasyon?.aylik && `Aylık TÜFE: ${say(evds.enflasyon.aylik)}%`,
    g.mevduatFaizi && `TL mevduat faizi (3 ay): ${say(g.mevduatFaizi.deger)}%`,
    g.fedFaizi && `Fed politika faizi: ${say(g.fedFaizi.deger)}%`,
    g.rezervToplam && `TCMB toplam rezerv: ${say(g.rezervToplam.deger, 0)} milyon $ (haftalık değişim ${say(g.rezervToplam.degisim)}%)`,
    g.cariDenge && `Cari işlemler dengesi: ${say(g.cariDenge.deger, 0)} milyon $ (${g.cariDenge.tarih})`,
  ].filter(Boolean).join('\n') || '(resmî gösterge verisi yok)';

  const haberMetni = haberler.length
    ? haberler.slice(0, 25).map((h) => `- ${h.baslik} (${h.kaynak})`).join('\n')
    : '(haber başlığı yok)';

  const takvimMetni = olaylar.length
    ? olaylar.slice(0, 8).map((o) => `- ${new Date(o.zaman).toLocaleString('tr-TR')} — ${o.ad}${o.not ? ` (${o.not})` : ''}`).join('\n')
    : '(yaklaşan kayıtlı olay yok)';

  const kullanici = `PİYASA (ölçülmüş, bugün)
${varliklar}

RESMÎ GÖSTERGELER (TCMB / TÜİK)
${makro}

HABER BAŞLIKLARI (son saatler)
${haberMetni}

YAKLAŞAN TAKVİM
${takvimMetni}

Bugünün brifingini yaz.`;

  try {
    const yanit = await c.messages.create({
      model: MODEL,
      // Opus 5'te düşünme varsayılan olarak AÇIK ve max_tokens düşünme + metni
      // birlikte kapsıyor — brifing uzun olduğu için bolca pay bırakıyoruz.
      max_tokens: 12000,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: BRIFING_SEMA },
      },
      // Sistem metni sabit → önbelleğe alınır, tekrar eden çağrılar ucuzlar.
      system: [{ type: 'text', text: BRIFING_SISTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: kullanici }],
    });

    if (yanit.stop_reason === 'refusal') {
      hata('Model brifingi reddetti:', yanit.stop_details?.category);
      return null;
    }
    const metin = yanit.content.find((b) => b.type === 'text')?.text;
    if (!metin) return null;

    const not = JSON.parse(metin);
    log(`Günün notu üretildi (${yanit.usage?.input_tokens ?? '?'} girdi / ${yanit.usage?.output_tokens ?? '?'} çıktı jeton)`);
    return { ...not, zaman: Date.now(), model: MODEL };
  } catch (e) {
    hata('Günün notu üretilemedi:', e.message);
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
