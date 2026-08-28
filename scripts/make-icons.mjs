// PWA ikonlarını bağımlılıksız üretir: ham RGBA -> zlib -> PNG.
// Tasarım: koyu yuvarlak kare + yükselen yeşil sütunlar (finans motifi).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = path.join(KOK, 'public', 'icons');

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(tip, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length);
  const govde = Buffer.concat([Buffer.from(tip, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(govde));
  return Buffer.concat([uzunluk, govde, crc]);
}

function png(genislik, yukseklik, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0);
  ihdr.writeUInt32BE(yukseklik, 4);
  ihdr[8] = 8;   // bit derinliği
  ihdr[9] = 6;   // RGBA
  // 10,11,12 = 0 (deflate, adaptive filter, no interlace)

  // Her satırın başına filtre baytı (0 = None)
  const satirlar = Buffer.alloc((genislik * 4 + 1) * yukseklik);
  for (let y = 0; y < yukseklik; y++) {
    const hedef = y * (genislik * 4 + 1);
    satirlar[hedef] = 0;
    rgba.copy(satirlar, hedef + 1, y * genislik * 4, (y + 1) * genislik * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(satirlar, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
];

function ikonCiz(boyut, { maskable = false } = {}) {
  const buf = Buffer.alloc(boyut * boyut * 4);
  const zemin = hex('#16161a');
  const yesil = hex('#0ca30c');
  const acikYesil = hex('#3ddc84');

  // maskable ikonlarda güvenli alan gerekir: içerik %80'lik merkeze sığmalı
  const dolgu = maskable ? boyut * 0.20 : boyut * 0.14;
  const radius = maskable ? boyut / 2 : boyut * 0.22; // maskable'da tam kare (maske kırpar)

  const koy = (x, y, renk, alfa = 255) => {
    const i = (y * boyut + x) * 4;
    buf[i] = renk[0]; buf[i + 1] = renk[1]; buf[i + 2] = renk[2]; buf[i + 3] = alfa;
  };

  // Zemin (yuvarlatılmış kare; maskable ise tam dolu)
  for (let y = 0; y < boyut; y++) {
    for (let x = 0; x < boyut; x++) {
      let icerde = true;
      if (!maskable) {
        const dx = Math.max(radius - x, x - (boyut - radius), 0);
        const dy = Math.max(radius - y, y - (boyut - radius), 0);
        icerde = dx * dx + dy * dy <= radius * radius;
      }
      koy(x, y, zemin, icerde ? 255 : 0);
    }
  }

  // Yükselen sütunlar
  const alan = boyut - dolgu * 2;
  const sutunSayisi = 4;
  const bosluk = alan * 0.09;
  const genislik = (alan - bosluk * (sutunSayisi - 1)) / sutunSayisi;
  const oranlar = [0.34, 0.56, 0.74, 1.0];

  for (let s = 0; s < sutunSayisi; s++) {
    const x0 = Math.round(dolgu + s * (genislik + bosluk));
    const x1 = Math.round(x0 + genislik);
    const yuk = alan * oranlar[s];
    const y0 = Math.round(dolgu + (alan - yuk));
    const y1 = Math.round(boyut - dolgu);
    const renk = s === sutunSayisi - 1 ? acikYesil : yesil;
    const r = Math.max(1, Math.round(genislik * 0.22)); // yuvarlatılmış uçlar

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (x < 0 || y < 0 || x >= boyut || y >= boyut) continue;
        // sadece üst köşeleri yuvarlat
        const dx = Math.max(x0 + r - x, x - (x1 - r), 0);
        const dy = Math.max(y0 + r - y, 0);
        if (dx * dx + dy * dy > r * r) continue;
        koy(x, y, renk, 255);
      }
    }
  }

  return png(boyut, boyut, buf);
}

fs.mkdirSync(CIKTI, { recursive: true });
const uretilecek = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }], // iOS maske uygulamaz ama dolgulu iyi durur
];

for (const [ad, boyut, opt] of uretilecek) {
  const veri = ikonCiz(boyut, opt);
  fs.writeFileSync(path.join(CIKTI, ad), veri);
  console.log(`  ${ad.padEnd(26)} ${boyut}x${boyut}  ${(veri.length / 1024).toFixed(1)} KB`);
}
console.log(`\nİkonlar yazıldı: ${CIKTI}`);
