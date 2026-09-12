/**
 * .env yükleyici — harici bağımlılık istemiyoruz.
 *
 * Bu dosya AYRI durur, çünkü hem bot (index.js) hem panel (server.js) aynı
 * anahtarlara ihtiyaç duyuyor. Eskiden yükleyici yalnız index.js içindeydi:
 * `npm run panel` ile açılan panelde EVDS_API_KEY hiç tanımlı olmuyordu.
 *
 * Var olan ortam değişkeni EZİLMEZ — Netlify/GitHub gibi ortamlarda gerçek
 * değişkenler dosyadan önce gelir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function envYukle(dosya = path.join(KOK, '.env')) {
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
