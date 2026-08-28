export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/** Türkiye saatiyle şu an (saat, dakika, tarih dizgisi). */
export function trNow(date = new Date()) {
  const f = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'long',
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    saat: Number(p.hour),
    dakika: Number(p.minute),
    tarih: `${p.year}-${p.month}-${p.day}`,
    gun: p.weekday,
    metin: `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`,
  };
}

/** Sayıyı Türkçe biçimde yaz. */
export function sayi(n, basamak = 2) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

/** Yüzdeyi işaretiyle yaz: +1,24% */
export function yuzde(n, basamak = 2) {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${sayi(n, basamak)}%`;
}

export function ok(n) {
  if (!Number.isFinite(n) || Math.abs(n) < 0.05) return '➖';
  return n > 0 ? '🟢' : '🔴';
}

/** Bir sayı dizisinin standart sapması. */
export function stdev(dizi) {
  const temiz = dizi.filter(Number.isFinite);
  if (temiz.length < 2) return NaN;
  const ort = temiz.reduce((a, b) => a + b, 0) / temiz.length;
  const varyans = temiz.reduce((a, b) => a + (b - ort) ** 2, 0) / (temiz.length - 1);
  return Math.sqrt(varyans);
}

export function log(...args) {
  const t = trNow();
  console.log(`[${t.metin}]`, ...args);
}

export function hata(...args) {
  const t = trNow();
  console.error(`[${t.metin}] HATA:`, ...args);
}

/** fetch + zaman aşımı + yeniden deneme. */
export async function getir(url, opts = {}, { deneme = 3, zamanAsimi = 15000 } = {}) {
  let sonHata;
  for (let i = 0; i < deneme; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), zamanAsimi);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { ...UA, ...(opts.headers || {}) } });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      clearTimeout(t);
      sonHata = e;
      if (i < deneme - 1) await sleep(1200 * (i + 1) ** 2);
    }
  }
  throw sonHata;
}
