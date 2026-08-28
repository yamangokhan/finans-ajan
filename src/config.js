// Takip edilen varliklar ve esikler.
// esik.z  : 30 dakikalik hareketin kac standart sapmasi "anormal" sayilsin
// esik.gun: gun ici toplam degisim yuzde kaci gecince haber verilsin
export const ASSETS = [
  { key: 'ons_altin', ad: 'Ons Altın',   sembol: 'GC=F',       birim: 'USD', grup: 'metal',  esik: { z: 2.8, gun: 1.2 } },
  { key: 'gumus',     ad: 'Gümüş',       sembol: 'SI=F',       birim: 'USD', grup: 'metal',  esik: { z: 2.8, gun: 2.0 } },
  { key: 'usdtry',    ad: 'USD/TRY',     sembol: 'TRY=X',      birim: 'TL',  grup: 'kur',    esik: { z: 3.0, gun: 1.0 } },
  { key: 'eurtry',    ad: 'EUR/TRY',     sembol: 'EURTRY=X',   birim: 'TL',  grup: 'kur',    esik: { z: 3.0, gun: 1.0 } },
  { key: 'bist100',   ad: 'BIST 100',    sembol: 'XU100.IS',   birim: 'TL',  grup: 'hisse',  esik: { z: 2.8, gun: 2.0 } },
  { key: 'bist30',    ad: 'BIST 30',     sembol: 'XU030.IS',   birim: 'TL',  grup: 'hisse',  esik: { z: 2.8, gun: 2.0 } },
  { key: 'brent',     ad: 'Brent Petrol',sembol: 'BZ=F',       birim: 'USD', grup: 'emtia',  esik: { z: 2.8, gun: 2.5 } },
  { key: 'dxy',       ad: 'Dolar Endeksi',sembol: 'DX-Y.NYB',  birim: 'idx', grup: 'makro',  esik: { z: 2.8, gun: 0.6 } },
  { key: 'vix',       ad: 'VIX (korku)', sembol: '^VIX',       birim: 'idx', grup: 'makro',  esik: { z: 3.0, gun: 8.0 } },
  { key: 'sp500',     ad: 'S&P 500',     sembol: '^GSPC',      birim: 'USD', grup: 'hisse',  esik: { z: 2.8, gun: 1.5 } },
  { key: 'bitcoin',   ad: 'Bitcoin',     sembol: 'BTC-USD',    birim: 'USD', grup: 'kripto', esik: { z: 3.0, gun: 4.0 } },
];

export const ASSET_MAP = Object.fromEntries(ASSETS.map((a) => [a.key, a]));

// Gram altın türetilir: ons altın (USD) x USD/TRY / 31.1034768
export const ONS_GRAM = 31.1034768;

// Haber kaynakları. Google News sorguları en esnek olanlar — anahtar kelimeyi değiştirip çoğaltabilirsin.
export const FEEDS = [
  { ad: 'GoogleNews TR ekonomi', url: 'https://news.google.com/rss/search?q=alt%C4%B1n+OR+dolar+OR+borsa+OR+faiz&hl=tr&gl=TR&ceid=TR:tr', dil: 'tr' },
  { ad: 'GoogleNews EN makro',   url: 'https://news.google.com/rss/search?q=federal+reserve+OR+gold+price+OR+inflation+OR+oil+price&hl=en-US&gl=US&ceid=US:en', dil: 'en' },
  { ad: 'GoogleNews EN jeopolitik', url: 'https://news.google.com/rss/search?q=oil+supply+OR+sanctions+OR+conflict+markets&hl=en-US&gl=US&ceid=US:en', dil: 'en' },
  { ad: 'CNBC',        url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', dil: 'en' },
  { ad: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', dil: 'en' },
  { ad: 'AA Ekonomi',  url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi', dil: 'tr' },
  { ad: 'Investing',   url: 'https://www.investing.com/rss/news.rss', dil: 'en' },
];

// Bir varlığın haberle eşleşmesi için aranan kelimeler (küçük harf, hem TR hem EN).
export const ASSET_KEYWORDS = {
  ons_altin: ['gold', 'altın', 'altin', 'bullion', 'xau', 'ons'],
  gumus:     ['silver', 'gümüş', 'gumus', 'xag'],
  usdtry:    ['lira', 'dolar', 'dollar', 'usd/try', 'türk lirası', 'tcmb', 'merkez bankası'],
  eurtry:    ['euro', 'ecb', 'avrupa merkez'],
  bist100:   ['borsa istanbul', 'bist', 'bist100', 'bist 100'],
  bist30:    ['borsa istanbul', 'bist', 'bist30', 'bist 30'],
  brent:     ['oil', 'petrol', 'brent', 'crude', 'opec', 'opek'],
  dxy:       ['dollar index', 'dxy', 'dolar endeksi', 'greenback'],
  vix:       ['volatility', 'vix', 'oynaklık', 'selloff', 'risk-off'],
  sp500:     ['s&p', 'wall street', 'stocks', 'nasdaq', 'dow'],
  bitcoin:   ['bitcoin', 'btc', 'crypto', 'kripto'],
};

// Her kaynağa/varlığa bakmadan, tek başına önemli olan genel kelimeler.
export const MAKRO_KEYWORDS = [
  'fed', 'federal reserve', 'fomc', 'powell', 'warsh', 'jackson hole',
  'rate hike', 'rate cut', 'faiz artır', 'faiz indir', 'ppk', 'tcmb',
  'cpi', 'inflation', 'enflasyon', 'tüfe', 'tufe', 'nonfarm', 'istihdam',
  'tariff', 'gümrük', 'sanction', 'yaptırım', 'war', 'savaş', 'strike',
  'trump', 'ecb', 'boj', 'recession', 'resesyon',
];

export const AYARLAR = {
  // Kaç saniyede bir piyasa taranacak
  tarama_saniye: 300,
  // Yahoo istekleri arası bekleme (hız limitine takılmamak için — test edildi, 1400ms güvenli)
  istek_araligi_ms: 1500,
  // Aynı varlık için art arda bildirim arasındaki minimum süre
  bildirim_bekleme_dk: 45,
  // Günde gönderilecek maksimum "normal" bildirim (kritik olanlar sayılmaz)
  gunluk_bildirim_limiti: 12,
  // Kaç varlık aynı anda tetiklenirse "rejim hareketi" sayılsın
  rejim_esigi: 2,
  // Haberler kaç saat geriye kadar aday sayılsın
  haber_pencere_saat: 4,
  // Günlük panorama mesajının saati (Türkiye saati, 24s)
  panorama_saati: 9,
  // Takvim uyarısı kaç saat önce gitsin
  takvim_uyari_saat: 3,
};

export const MODEL = 'claude-opus-5';
