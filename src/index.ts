export type EkstreBank = "kuveyt" | "vakif" | "unknown";
export type EkstreRowKind = "expense" | "refund" | "fee" | "payment" | "info";
export type ForeignCurrency = "USD" | "EUR" | "GBP";

export type EkstreRow = {
  at: string;
  description: string;
  vendor: string;
  amount: number;
  kind: EkstreRowKind;
  card?: string;
  installment?: { n: number; of: number; total: number };
  foreign?: { amount: number; currency: ForeignCurrency };
  raw: string;
};

export type EkstreMeta = {
  bank: EkstreBank;
  bankName: string;
  cardMasked?: string;
  statementDate?: string;
  dueDate?: string;
  periodDebt?: number;
  holder?: string;
};

export type Ekstre = { meta: EkstreMeta; rows: EkstreRow[]; warnings: string[] };

export type TextPiece = { str: string; transform: number[]; width?: number };

const BANK_NAMES: Record<EkstreBank, string> = { kuveyt: "Kuveyt Türk", vakif: "VakıfBank", unknown: "Banka" };

function fold(s: string): string {
  return s
    .replace(/İ/g, "I").replace(/ı/g, "i").replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g").replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/Ö/g, "O").replace(/ö/g, "o").replace(/Ç/g, "C").replace(/ç/g, "c")
    .toUpperCase();
}

const CITIES = [
  "ADANA", "ADIYAMAN", "AFYON", "AFYONKARAHISAR", "AGRI", "AKSARAY", "AMASYA", "ANKARA", "ANTALYA", "ARDAHAN", "ARTVIN",
  "AYDIN", "BALIKESIR", "BARTIN", "BATMAN", "BAYBURT", "BILECIK", "BINGOL", "BITLIS", "BOLU", "BURDUR", "BURSA",
  "CANAKKALE", "CANKIRI", "CORUM", "DENIZLI", "DIYARBAKIR", "DUZCE", "EDIRNE", "ELAZIG", "ERZINCAN", "ERZURUM",
  "ESKISEHIR", "GAZIANTEP", "GIRESUN", "GUMUSHANE", "HAKKARI", "HATAY", "IGDIR", "ISPARTA", "ISTANBUL", "IZMIR",
  "KAHRAMANMARAS", "KARABUK", "KARAMAN", "KARS", "KASTAMONU", "KAYSERI", "KILIS", "KIRIKKALE", "KIRKLARELI",
  "KIRSEHIR", "KOCAELI", "KONYA", "KUTAHYA", "MALATYA", "MANISA", "MARDIN", "MERSIN", "MUGLA", "MUS", "NEVSEHIR",
  "NIGDE", "ORDU", "OSMANIYE", "RIZE", "SAKARYA", "SAMSUN", "SANLIURFA", "SIIRT", "SINOP", "SIVAS", "SIRNAK",
  "TEKIRDAG", "TOKAT", "TRABZON", "TUNCELI", "USAK", "VAN", "YALOVA", "YOZGAT", "ZONGULDAK",
  "SINGAPORE", "LONDON", "DUBLIN", "AMSTERDAM", "BERLIN", "PARIS", "NEW YORK",
];
const COUNTRIES = new Set(["TR", "TUR", "US", "USA", "GB", "GBR", "DE", "DEU", "NL", "NLD", "SG", "SGP", "IE", "IRL", "FR", "FRA", "ES", "IT", "LU", "LUX", "AE", "ARE"]);

const ROW_HEAD = /^(\d{2}[./]\d{2}[./]\d{4})\s/;
const ROW_TAIL = /\s([+-]?\d[\d.,]*)(?:\s*(?:TL|TRY|₺))?$/;
const INSTALLMENT = /([\d.,]+)\s*TL\s*İşlemin\s*(\d+)\s*\/\s*(\d+)\s*Taksidi/i;
const FOREIGN = /^(\d+(?:[.,]\d+)?)\s*(USD|EUR|GBP)\s+(.+)$/i;

function readRow(text: string): { date: string; description: string; amount: string } | null {
  const head = ROW_HEAD.exec(text);
  const tail = head ? ROW_TAIL.exec(text) : null;
  if (!head || !tail || tail.index <= head[1].length) return null;
  return { date: head[1], description: text.slice(head[1].length, tail.index).trim(), amount: tail[1] };
}

function toIso(raw: string): string | null {
  const dayFirst = /(\d{2})[./](\d{2})[./](\d{4})/.exec(raw);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return iso ? iso[0] : null;
}

export function parseMoney(raw: string, style: "tr" | "us" = "tr"): number | null {
  const s = raw.replace(/\s/g, "").replace(/TL|TRY|₺/gi, "");
  const m = /^([+-])?([\d.,]+)$/.exec(s);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  let num = m[2];
  const lastDot = num.lastIndexOf(".");
  const lastComma = num.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    num = lastComma > lastDot ? num.replace(/\./g, "").replace(",", ".") : num.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const tail = num.length - lastComma - 1;
    num = tail === 3 && style === "us" ? num.replace(/,/g, "") : num.replace(",", ".");
  } else if (lastDot >= 0) {
    const tail = num.length - lastDot - 1;
    num = tail === 3 && style === "tr" ? num.replace(/\./g, "") : num;
  }
  const n = Number(num);
  return Number.isFinite(n) ? sign * n : null;
}

export function detectBank(lines: readonly string[]): EkstreBank {
  const head = fold(lines.slice(0, 40).join(" "));
  if (/KUVEYT/.test(head)) return "kuveyt";
  if (/VAKIF/.test(head)) return "vakif";
  return "unknown";
}

function stripTail(tokens: string[]): boolean {
  const last = tokens[tokens.length - 1] ?? "";
  const key = fold(last);
  if (COUNTRIES.has(key) || CITIES.includes(key)) {
    tokens.pop();
    return true;
  }
  const city = CITIES.find((c) => key.length > c.length && key.endsWith(c));
  if (city) tokens[tokens.length - 1] = last.slice(0, last.length - city.length);
  return false;
}

export function cleanVendor(description: string, bank: EkstreBank): string {
  const text = description.replace(/\s+/g, " ").trim();
  if (bank === "vakif") {
    const first = text.split("/").map((part) => part.trim()).find(Boolean) ?? text;
    return first.replace(/[*#]\s*$/, "").trim();
  }
  const tokens = text.split(" ");
  let stripped = 0;
  while (stripped < 3 && tokens.length > 1 && stripTail(tokens)) stripped += 1;
  return tokens.filter(Boolean).join(" ");
}

function classify(description: string, signed: number): EkstreRowKind {
  const d = fold(description);
  if (/ONCEKI DONEM|BAKIYE|TOPLAM HARCAMA|HESAP OZETI|DONUSTURULEN PUAN|KAMPANYA/.test(d)) return "info";
  if (/BORC ODEME|ODEMENIZ ICIN|TESEKKUR|ODEME ALINDI|KART ODEMESI/.test(d)) return "payment";
  if (/FAIZ|BSMV|KKDF|UCRET|KOMISYON|AIDAT|GECIKME/.test(d)) return "fee";
  if (/IADE|REFUND|CHARGEBACK/.test(d)) return "refund";
  if (signed < 0) return "payment";
  return "expense";
}

export function parseEkstre(lines: readonly string[]): Ekstre {
  const bank = detectBank(lines);
  const style = bank === "vakif" ? "us" : "tr";
  const meta: EkstreMeta = { bank, bankName: BANK_NAMES[bank] };
  const rows: EkstreRow[] = [];
  const warnings: string[] = [];
  let card: string | undefined;

  for (const line of lines) {
    const text = line.trim();
    const key = fold(text);
    if (!meta.statementDate && /HESAP KESIM TARIHI/.test(key) && !/SONRAKI/.test(key)) meta.statementDate = toIso(text) ?? undefined;
    if (!meta.dueDate && /SON ODEME TARIHI/.test(key) && !/SONRAKI/.test(key)) meta.dueDate = toIso(text) ?? undefined;
    if (meta.periodDebt === undefined && /DONEM BORCUNUZ/.test(key)) {
      const debt = /([\d.,]{1,20})\s*TL/.exec(text);
      if (debt) meta.periodDebt = parseMoney(debt[1], style) ?? undefined;
    }
    if (!meta.cardMasked && /KART NO/.test(key)) {
      const masked = /(\d{4,8}\*{2,}\d{3,4})/.exec(text);
      if (masked) meta.cardMasked = masked[1];
    }

    const found = readRow(text);
    const section = /^(\d{4,8}\*{2,}\d{3,4})\b(.*)$/.exec(text);
    if (section && !found && !/KART NO/.test(key)) {
      card = section[1];
      const rest = section[2].replace(/ile yapılan işlemler/i, "").trim();
      if (rest && !/TOPLAM/i.test(rest) && !meta.holder) meta.holder = rest;
      continue;
    }

    if (!found) continue;
    const at = toIso(found.date);
    if (!at) continue;
    let description = found.description;
    const rawAmount = found.amount;
    const signed = parseMoney(rawAmount, style);
    if (signed === null) {
      warnings.push(text);
      continue;
    }

    let installment: EkstreRow["installment"];
    const inst = INSTALLMENT.exec(description);
    if (inst) {
      installment = { total: parseMoney(inst[1], style) ?? 0, n: Number(inst[2]), of: Number(inst[3]) };
      description = description.replace(INSTALLMENT, "").trim();
    }

    let foreign: EkstreRow["foreign"];
    const fx = FOREIGN.exec(description);
    if (fx) {
      foreign = { amount: parseMoney(fx[1], "us") ?? 0, currency: fx[2].toUpperCase() as ForeignCurrency };
      description = fx[3].trim();
    }

    let kind = classify(description, signed);
    if (kind === "expense" && rawAmount.startsWith("+")) kind = "refund";
    if (Math.abs(signed) < 0.005 && kind !== "info") kind = "info";
    if (kind === "refund") description = description.replace(/^(İADE|IADE)\s*[/:-]?\s*/i, "").trim();

    rows.push({
      at,
      description,
      vendor: kind === "fee" ? BANK_NAMES[bank] : cleanVendor(description, bank),
      amount: Math.abs(signed),
      kind,
      card,
      installment,
      foreign,
      raw: text,
    });
  }

  if (!rows.length) warnings.push("no_rows");
  return { meta, rows, warnings };
}

const SAME_LINE_TOLERANCE = 2.5;
const COLUMN_GAP = 1.2;
const WORD_GAP = 0.15;
const CHAR_WIDTH = 0.5;

export function groupLines(items: readonly TextPiece[]): string[] {
  const pieces = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
      size: Math.abs(item.transform[0] ?? 10) || 10,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: string[] = [];
  let bucket: typeof pieces = [];
  let y: number | null = null;

  const flush = () => {
    if (!bucket.length) return;
    bucket.sort((a, b) => a.x - b.x);
    let text = "";
    let end = Number.NEGATIVE_INFINITY;
    for (const piece of bucket) {
      const gap = piece.x - end;
      if (text) text += gap > piece.size * COLUMN_GAP ? "  " : gap > piece.size * WORD_GAP ? " " : "";
      text += piece.str;
      end = piece.x + (piece.width || piece.str.length * piece.size * CHAR_WIDTH);
    }
    lines.push(text.replace(/\s+$/, ""));
    bucket = [];
  };

  for (const piece of pieces) {
    if (y === null || Math.abs(piece.y - y) > SAME_LINE_TOLERANCE) {
      flush();
      y = piece.y;
    }
    bucket.push(piece);
  }
  flush();
  return lines;
}
