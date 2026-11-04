import { describe, expect, it } from "vitest";
import { cleanVendor, detectBank, groupLines, parseEkstre, parseMoney } from "./index.js";

const KUVEYT = [
  "KuveytTürk",
  "KREDİ KARTI EKSTRESİ / Credit Card Statement",
  "Kart No / Card Number  12345678****1111",
  "Hesap Kesim Tarihi / Statement Issue Date  15/08/2026",
  "Son Ödeme Tarihi / Due Date for Payment  25/08/2026",
  "Dönem Borcunuz / Your Current Debt  4.325,50 TL",
  "Sonraki Hesap Kesim Tarihi / Next Statement Date  15/09/2026",
  "İŞLEM TARİHİ  İŞLEM AÇIKLAMASI  TUTAR",
  "12345678****2222 ile yapılan işlemler",
  "23/07/2026  ORNEK LOKANTA  KONYA  TUR  1.250,00 TL",
  "23/07/2026  Kampanya Puanı  0,00 TL",
  "04/08/2026  ORNEK MOBILYA TEKSTANKARA  TR  6.000,00 TL İşlemin 2 / 6 Taksidi  1.000,00 TL",
  "05/08/2026  ORNEK KARGO -MERKEZ  İSTANBUL  TR  75,50 TL",
  "15/08/2026  ORNEK RESTORANKONYA  TR  2.000,00 TL",
  "12345678****1111 ile yapılan işlemler",
  "27/07/2026  Kredi Kartı Borç Ödeme  -5.000,00 TL",
];

const VAKIF = [
  "VakıfBank",
  "Kredi Kartı Hesap Özeti (TL)",
  "Dönem Borcunuz  :  2,661.00 TL",
  "Son Ödeme Tarihi  :  14.09.2026",
  "Kart No  :  1234********5678",
  "Hesap Kesim Tarihi  :  09.09.2026",
  "Bir Sonraki Hesap Kesim Tarihi  :  08.10.2026",
  "İŞLEM TARİHİ  AÇIKLAMA  TUTAR (TL)  KALAN TAKSİT  PUAN",
  "08.08.2026  ÖNCEKİ DÖNEM HESAP ÖZETİ BAKİYENİZ  500.00",
  "15.08.2026  ÖDEMENİZ İÇİN TEŞEKKÜRLER  +500.00",
  "09.09.2026  ALIŞVERİŞ FAİZİ (Oran:4.00)  10.00",
  "09.09.2026  BSMV  1.00",
  "1234***5678 ORNEK KISI",
  "12.08.2026  50 USD ORNEK YAZILIM/SINGAPORE  1,750.00",
  "29.08.2026  ORNEK MARKET/ISTANBUL  1,000.00",
  "02.09.2026  İADE/ORNEK MARKET/ISTANBUL  +100.00",
  "1234***5678 Toplam Harcama Tutarı  2,650.00",
];

describe("parseMoney", () => {
  it("Türkçe ve Amerikan biçimlerini, işareti ve TL ekini okur", () => {
    expect(parseMoney("1.500,00 TL")).toBe(1500);
    expect(parseMoney("-12.345,50 TL", "tr")).toBe(-12345.5);
    expect(parseMoney("12,345.50", "us")).toBe(12345.5);
    expect(parseMoney("+1,500.00", "us")).toBe(1500);
    expect(parseMoney("12.50", "us")).toBe(12.5);
    expect(parseMoney("1,250.10")).toBe(1250.1);
    expect(parseMoney("0,00 TL")).toBe(0);
    expect(parseMoney("abc")).toBeNull();
  });

  it("tek ayraçlı ve üç haneli sayıda biçime bakar", () => {
    expect(parseMoney("2.060")).toBe(2060);
    expect(parseMoney("2.060", "us")).toBe(2.06);
    expect(parseMoney("2,191", "us")).toBe(2191);
    expect(parseMoney("2,191")).toBe(2.191);
  });
});

describe("detectBank", () => {
  const filler = Array.from({ length: 39 }, () => "Kredi Kartı Hesap Özeti");

  it("banka adını ilk 40 satırda arar", () => {
    expect(detectBank([...filler, "VakıfBank"])).toBe("vakif");
    expect(detectBank([...filler, "Kuveyt Türk"])).toBe("kuveyt");
    expect(detectBank([...filler, "satır", "VakıfBank"])).toBe("unknown");
    expect(detectBank([])).toBe("unknown");
  });
});

describe("cleanVendor", () => {
  it("şehir ve ülke kuyruğunu atar", () => {
    expect(cleanVendor("ORNEK LOKANTA  KONYA  TUR", "kuveyt")).toBe("ORNEK LOKANTA");
    expect(cleanVendor("ORNEK RESTORANKONYA", "unknown")).toBe("ORNEK RESTORAN");
    expect(cleanVendor("KONYA", "kuveyt")).toBe("KONYA");
  });

  it("şehir adıyla biten satıcı adı kısalır (bilinen sınır)", () => {
    expect(cleanVendor("ORNEK DIVAN", "kuveyt")).toBe("ORNEK DI");
    expect(cleanVendor("ORNEK DIVAN", "vakif")).toBe("ORNEK DIVAN");
  });

  it("VakıfBank açıklamasında ilk parçayı alır ve sondaki işareti atar", () => {
    expect(cleanVendor("ORNEK MARKET/ISTANBUL", "vakif")).toBe("ORNEK MARKET");
    expect(cleanVendor("ORNEK MARKET*", "vakif")).toBe("ORNEK MARKET");
  });
});

describe("Kuveyt Türk ekstresi", () => {
  const ekstre = parseEkstre(KUVEYT);
  const byDescription = (text: string) => ekstre.rows.find((r) => r.description.includes(text))!;

  it("bankayı ve ekstre bilgilerini okur", () => {
    expect(detectBank(KUVEYT)).toBe("kuveyt");
    expect(ekstre.meta.bank).toBe("kuveyt");
    expect(ekstre.meta.bankName).toBe("Kuveyt Türk");
    expect(ekstre.meta.statementDate).toBe("2026-08-15");
    expect(ekstre.meta.dueDate).toBe("2026-08-25");
    expect(ekstre.meta.periodDebt).toBe(4325.5);
    expect(ekstre.meta.cardMasked).toBe("12345678****1111");
    expect(ekstre.warnings).toEqual([]);
  });

  it("her satırın türünü ve tutarını belirler", () => {
    expect(ekstre.rows.map((r) => r.kind)).toEqual(["expense", "info", "expense", "expense", "expense", "payment"]);
    expect(ekstre.rows.map((r) => r.amount)).toEqual([1250, 0, 1000, 75.5, 2000, 5000]);
    expect(ekstre.rows.map((r) => r.at)).toEqual(["2026-07-23", "2026-07-23", "2026-08-04", "2026-08-05", "2026-08-15", "2026-07-27"]);
  });

  it("satıcı adından şehir ve ülke kuyruğunu atar", () => {
    expect(byDescription("ORNEK LOKANTA").vendor).toBe("ORNEK LOKANTA");
    expect(byDescription("ORNEK KARGO").vendor).toBe("ORNEK KARGO -MERKEZ");
    expect(byDescription("ORNEK RESTORAN").vendor).toBe("ORNEK RESTORAN");
    expect(byDescription("ORNEK MOBILYA").vendor).toBe("ORNEK MOBILYA TEKST");
  });

  it("taksit satırında taksit tutarını tutar, toplamı installment içine yazar", () => {
    const row = byDescription("ORNEK MOBILYA");
    expect(row.amount).toBe(1000);
    expect(row.installment).toEqual({ n: 2, of: 6, total: 6000 });
    expect(row.description).not.toContain("Taksidi");
  });

  it("satırı bağlı olduğu kart bölümüne yazar", () => {
    expect(byDescription("ORNEK LOKANTA").card).toBe("12345678****2222");
    expect(byDescription("Borç Ödeme").card).toBe("12345678****1111");
  });

  it("taksit ve yabancı para yoksa bu alanlar boş kalır", () => {
    const row = byDescription("ORNEK LOKANTA");
    expect(row.installment).toBeUndefined();
    expect(row.foreign).toBeUndefined();
    expect(row.raw).toBe("23/07/2026  ORNEK LOKANTA  KONYA  TUR  1.250,00 TL");
  });
});

describe("VakıfBank ekstresi", () => {
  const ekstre = parseEkstre(VAKIF);
  const byRaw = (text: string) => ekstre.rows.find((r) => r.raw.includes(text))!;

  it("bankayı ve ekstre bilgilerini okur", () => {
    expect(detectBank(VAKIF)).toBe("vakif");
    expect(ekstre.meta.bankName).toBe("VakıfBank");
    expect(ekstre.meta.statementDate).toBe("2026-09-09");
    expect(ekstre.meta.dueDate).toBe("2026-09-14");
    expect(ekstre.meta.periodDebt).toBe(2661);
    expect(ekstre.meta.cardMasked).toBe("1234********5678");
    expect(ekstre.meta.holder).toBe("ORNEK KISI");
  });

  it("bakiye, ödeme, faiz ve BSMV, yabancı para, harcama ve iade satırlarını ayırır", () => {
    expect(ekstre.rows.map((r) => r.kind)).toEqual(["info", "payment", "fee", "fee", "expense", "expense", "refund"]);
    expect(byRaw("TEŞEKKÜRLER").amount).toBe(500);
    expect(byRaw("FAİZİ").vendor).toBe("VakıfBank");
    expect(byRaw("BSMV").amount).toBe(1);
  });

  it("yabancı para tutarını ve TL karşılığını ayırır", () => {
    const row = byRaw("ORNEK YAZILIM");
    expect(row.amount).toBe(1750);
    expect(row.foreign).toEqual({ amount: 50, currency: "USD" });
    expect(row.vendor).toBe("ORNEK YAZILIM");
    expect(row.description).toBe("ORNEK YAZILIM/SINGAPORE");
    expect(row.card).toBe("1234***5678");
  });

  it("iade satırında başındaki İADE ekini atar", () => {
    const row = byRaw("İADE");
    expect(row.kind).toBe("refund");
    expect(row.amount).toBe(100);
    expect(row.description).toBe("ORNEK MARKET/ISTANBUL");
    expect(row.vendor).toBe("ORNEK MARKET");
    expect(byRaw("ORNEK MARKET/ISTANBUL  1,000").vendor).toBe("ORNEK MARKET");
  });

  it("tarihle başlamayan toplam satırı satır olmaz", () => {
    expect(ekstre.rows.some((r) => /Toplam/i.test(r.raw))).toBe(false);
  });
});

describe("tanınmayan banka", () => {
  it("tarihle başlayıp tutarla biten satırları yine okur", () => {
    const ekstre = parseEkstre([
      "Örnek Banka",
      "01.09.2026  ORNEK YER  150,00",
      "02.09.2026  BASKA YER  1.200,50 TL",
      "03.09.2026  ORNEK DUKKAN  1,250.00",
      "04.09.2026  ORNEK ATOLYE  1.250",
    ]);
    expect(ekstre.meta.bank).toBe("unknown");
    expect(ekstre.meta.bankName).toBe("Banka");
    expect(ekstre.rows.map((r) => r.amount)).toEqual([150, 1200.5, 1250, 1250]);
  });

  it("hiç satır yoksa uyarı verir", () => {
    expect(parseEkstre(["boş"]).warnings).toContain("no_rows");
  });

  it("tutarı okunamayan satırı uyarıya yazar, satır eklemez", () => {
    const ekstre = parseEkstre(["01.09.2026  ORNEK YER  1.2.3", "02.09.2026  BASKA YER  50,00"]);
    expect(ekstre.rows.map((r) => r.amount)).toEqual([50]);
    expect(ekstre.warnings).toEqual(["01.09.2026  ORNEK YER  1.2.3"]);
  });
});

describe("bozuk ve çok uzun satırlar", () => {
  it("uzun boşluk ve rakam dizilerini hızlı işler", () => {
    const started = Date.now();
    const ekstre = parseEkstre(["01.09.2026" + " ".repeat(2500) + "x", "Dönem Borcunuz " + "1".repeat(40000)]);
    expect(Date.now() - started).toBeLessThan(500);
    expect(ekstre.rows).toEqual([]);
    expect(ekstre.meta.periodDebt).toBeUndefined();
  });

  it("satırın başındaki ve sonundaki boşluğu yok sayar", () => {
    const [row] = parseEkstre(["   01.09.2026   ORNEK YER   150,00 TL   "]).rows;
    expect(row.raw).toBe("01.09.2026   ORNEK YER   150,00 TL");
    expect(row.description).toBe("ORNEK YER");
    expect(row.amount).toBe(150);
  });
});

describe("satır türleri", () => {
  it.each([
    ["ONCEKI DONEM BAKIYE", "500,00", "info"],
    ["TOPLAM HARCAMA TUTARI", "500,00", "info"],
    ["DONUSTURULEN PUAN", "500,00", "info"],
    ["KAMPANYA PUANI", "500,00", "info"],
    ["KREDI KARTI BORC ODEME", "500,00", "payment"],
    ["ODEMENIZ ICIN TESEKKURLER", "500,00", "payment"],
    ["ODEME ALINDI", "500,00", "payment"],
    ["KART ODEMESI", "500,00", "payment"],
    ["ALISVERIS FAIZI", "500,00", "fee"],
    ["BSMV", "50,00", "fee"],
    ["KKDF", "50,00", "fee"],
    ["KART UCRETI", "500,00", "fee"],
    ["BANKA KOMISYONU", "500,00", "fee"],
    ["KART AIDATI", "500,00", "fee"],
    ["GECIKME BEDELI", "500,00", "fee"],
    ["ORNEK MARKET IADE", "500,00", "refund"],
    ["ORNEK MARKET REFUND", "500,00", "refund"],
    ["ORNEK MARKET CHARGEBACK", "500,00", "refund"],
    ["ORNEK MARKET", "+500,00", "refund"],
    ["ORNEK MARKET", "-500,00", "payment"],
    ["ORNEK MARKET", "500,00", "expense"],
    ["ORNEK MARKET", "0,00", "info"],
    ["ORNEK HIZMET BEDELI", "500,00", "expense"],
  ])("%s (%s): %s", (description, amount, kind) => {
    const [row] = parseEkstre([`01.09.2026  ${description}  ${amount}`]).rows;
    expect(row.kind).toBe(kind);
  });
});

describe("yabancı para", () => {
  it.each([
    ["50 USD ORNEK YAZILIM", { amount: 50, currency: "USD" }],
    ["20 EUR ORNEK YAZILIM", { amount: 20, currency: "EUR" }],
    ["15 GBP ORNEK YAZILIM", { amount: 15, currency: "GBP" }],
    ["12,5 USD ORNEK YAZILIM", { amount: 12.5, currency: "USD" }],
  ])("%s", (description, foreign) => {
    const [row] = parseEkstre([`01.09.2026  ${description}  500,00`]).rows;
    expect(row.foreign).toEqual(foreign);
    expect(row.description).toBe("ORNEK YAZILIM");
  });

  it("açıklamanın başında olmayan ya da tanınmayan para birimini yok sayar", () => {
    expect(parseEkstre(["01.09.2026  ORNEK 50 USD YER  500,00"]).rows[0].foreign).toBeUndefined();
    expect(parseEkstre(["01.09.2026  50 CHF ORNEK YER  500,00"]).rows[0].foreign).toBeUndefined();
  });
});

describe("groupLines", () => {
  it("aynı yükseklikteki parçaları birleştirir, boşluk genişliğine göre ayırır, satırları yukarıdan aşağı sıralar", () => {
    const items = [
      { str: "TUTAR", transform: [10, 0, 0, 10, 400, 700], width: 30 },
      { str: "23/07/2026", transform: [10, 0, 0, 10, 40, 680], width: 60 },
      { str: "ORNEK", transform: [10, 0, 0, 10, 120, 680.8], width: 25 },
      { str: "MARKET", transform: [10, 0, 0, 10, 147, 680], width: 18 },
      { str: "1.500,00 TL", transform: [10, 0, 0, 10, 400, 679.5], width: 55 },
      { str: "İŞLEM", transform: [10, 0, 0, 10, 40, 700], width: 30 },
      { str: "  ", transform: [10, 0, 0, 10, 300, 700], width: 5 },
    ];
    expect(groupLines(items)).toEqual(["İŞLEM  TUTAR", "23/07/2026  ORNEK MARKET  1.500,00 TL"]);
  });

  it("çıktısı parseEkstre ile okunabilir", () => {
    const items = [
      { str: "23/07/2026", transform: [10, 0, 0, 10, 40, 680], width: 60 },
      { str: "ORNEK MARKET", transform: [10, 0, 0, 10, 120, 680], width: 80 },
      { str: "1.500,00 TL", transform: [10, 0, 0, 10, 400, 680], width: 55 },
    ];
    const [row] = parseEkstre(groupLines(items)).rows;
    expect(row.vendor).toBe("ORNEK MARKET");
    expect(row.amount).toBe(1500);
  });
});

describe("README örnekleri", () => {
  it("Kullanım", () => {
    const ekstre = parseEkstre([
      "Kuveyt Türk",
      "Hesap Kesim Tarihi / Statement Issue Date  15/08/2026",
      "Son Ödeme Tarihi / Due Date for Payment  25/08/2026",
      "23/07/2026  ORNEK MARKET  ISTANBUL  TR  1.250,00 TL",
      "27/07/2026  Kredi Kartı Borç Ödeme  -5.000,00 TL",
    ]);
    expect(ekstre.meta.bank).toBe("kuveyt");
    expect(ekstre.meta.statementDate).toBe("2026-08-15");
    expect(ekstre.meta.dueDate).toBe("2026-08-25");
    expect(ekstre.rows[0].at).toBe("2026-07-23");
    expect(ekstre.rows[0].vendor).toBe("ORNEK MARKET");
    expect(ekstre.rows[0].amount).toBe(1250);
    expect(ekstre.rows[0].kind).toBe("expense");
    expect(ekstre.rows[1].kind).toBe("payment");
    expect(ekstre.rows[1].amount).toBe(5000);
    expect(ekstre.warnings).toEqual([]);
  });

  it("Yardımcı işlevler", () => {
    expect(parseMoney("1.250,00 TL")).toBe(1250);
    expect(parseMoney("1,250.00")).toBe(1250);
    expect(parseMoney("-5.000,00 TL")).toBe(-5000);
    expect(parseMoney("abc")).toBeNull();
    expect(detectBank(["VakıfBank", "Kredi Kartı Hesap Özeti"])).toBe("vakif");
    expect(cleanVendor("ORNEK LOKANTA  KONYA  TUR", "kuveyt")).toBe("ORNEK LOKANTA");
  });
});
