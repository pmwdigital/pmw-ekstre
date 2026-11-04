# @pmwdigital/ekstre

Kredi kartı ekstresinin satırlarını okur ve her satırı tarih, açıklama, satıcı adı, tutar ve türe (harcama, iade, faiz ve ücret, ödeme, bilgi) ayırır. Taksit ve yabancı para bilgisini çıkarır; hesap kesim tarihini, son ödeme tarihini ve dönem borcunu da verir. Kuveyt Türk ve VakıfBank ekstrelerinin düzenini tanır, başka bankalarda tarihle başlayıp tutarla biten satırları okur.

PDF dosyasını kendisi açmaz: girdi, PDF'ten çıkarılmış metin satırlarıdır (nasıl çıkarılacağı aşağıda). Bağımlılığı yoktur. TypeScript ile yazılmıştır, ESM olarak dağıtılır.

## Kurulum

```bash
npm install github:pmwdigital/pmw-ekstre
```

## Kullanım

```ts
import { parseEkstre } from "@pmwdigital/ekstre";

const ekstre = parseEkstre([
  "Kuveyt Türk",
  "Hesap Kesim Tarihi / Statement Issue Date  15/08/2026",
  "Son Ödeme Tarihi / Due Date for Payment  25/08/2026",
  "23/07/2026  ORNEK MARKET  ISTANBUL  TR  1.250,00 TL",
  "27/07/2026  Kredi Kartı Borç Ödeme  -5.000,00 TL",
]);

ekstre.meta.bank;          // "kuveyt"
ekstre.meta.statementDate; // "2026-08-15"
ekstre.meta.dueDate;       // "2026-08-25"

ekstre.rows[0].at;         // "2026-07-23"
ekstre.rows[0].vendor;     // "ORNEK MARKET"
ekstre.rows[0].amount;     // 1250
ekstre.rows[0].kind;       // "expense"

ekstre.rows[1].kind;       // "payment"
ekstre.rows[1].amount;     // 5000, tutar hep pozitiftir, yön kind alanındadır
```

## Sonuç

`parseEkstre` üç parçalı bir nesne döner: `meta` (ekstrenin bilgileri), `rows` (okunan satırlar, ekstredeki sırayla) ve `warnings` (uyarılar). Bulunamayan alan `undefined` kalır.

| `meta` alanı | Anlamı |
| --- | --- |
| `bank`, `bankName` | `"kuveyt"`, `"vakif"` ya da `"unknown"`; bankanın adı (tanınmayan bankada `"Banka"`) |
| `statementDate` | Hesap kesim tarihi (`YYYY-AA-GG`) |
| `dueDate` | Son ödeme tarihi (`YYYY-AA-GG`) |
| `periodDebt` | Dönem borcu |
| `cardMasked` | Ekstrenin üstünde yazan maskeli kart numarası |
| `holder` | Kart bölümünün başlığında yazan ad |

| `rows` alanı | Anlamı |
| --- | --- |
| `at` | İşlem tarihi (`YYYY-AA-GG`) |
| `description` | Ekstredeki açıklama; taksit ve yabancı para bölümleri ile iadelerin başındaki `İADE/` çıkarılmıştır |
| `vendor` | Satıcı adı, şehir ve ülke kuyruğu atılmış halde. Faiz ve ücret satırlarında bankanın adı |
| `amount` | TL tutarı, her zaman pozitif |
| `kind` | Satır türü (aşağıdaki tablo) |
| `card` | Satırın bağlı olduğu kart bölümünün maskeli numarası |
| `installment` | Taksitli satırda `{ n, of, total }`: `n` kaçıncı taksit, `of` toplam taksit sayısı, `total` alışverişin toplam tutarı. `amount` bir taksidin tutarıdır |
| `foreign` | Yabancı para harcamasında `{ amount, currency }` (`USD`, `EUR` ya da `GBP`) |
| `raw` | Satırın özgün metni |

`warnings` listesine tutarı okunamayan satırların metni yazılır. Hiç satır okunamazsa ayrıca `"no_rows"` eklenir.

## Satır türleri

| `kind` | Ne zaman |
| --- | --- |
| `expense` | Harcama |
| `refund` | İade: açıklamada IADE geçer ya da tutar `+` işaretlidir |
| `fee` | Faiz, BSMV, KKDF, ücret, komisyon, aidat ya da gecikme satırı |
| `payment` | Kart borcu ödemesi: açıklamada borç ödeme, ödemeniz için teşekkürler gibi sözcükler geçer ya da tutar eksi işaretlidir. Harcama değildir |
| `info` | Önceki dönem bakiyesi, toplam harcama, puan ve kampanya satırları; tutarı sıfır olan satırlar |

Harcama toplarken `payment` ve `info` satırlarını dışarıda bırakın.

## Desteklenen bankalar

**Kuveyt Türk.** Satır örneği: `23/07/2026  ORNEK LOKANTA  KONYA  TUR  1.250,00 TL`. Sayılar Türkçe biçimdedir (`1.250,00`), ödemeler eksi işaretlidir. Taksitli satırda son sayı, yani taksit tutarı okunur: `04/08/2026  ORNEK MOBILYA TEKSTANKARA  TR  6.000,00 TL İşlemin 2 / 6 Taksidi  1.000,00 TL` satırında `amount` 1000, `installment` ise `{ n: 2, of: 6, total: 6000 }` olur.

**VakıfBank.** Satır örneği: `12.08.2026  50 USD ORNEK YAZILIM/SINGAPORE  1,750.00`. Sayılar Amerikan biçimindedir (`1,750.00`), alacaklar `+` işaretlidir (ödeme ya da iade), faiz ve BSMV ayrı satırlardır. Açıklamanın başındaki `50 USD` `foreign` alanına ayrılır.

**Diğer bankalar.** Banka adı ekstrenin ilk 40 satırında geçmiyorsa `bank` değeri `"unknown"` olur ve tarihle başlayıp tutarla biten her satır okunur. Sayı biçimi (`1.250,00` ya da `1,250.00`) iki ondalık basamaktan anlaşılır; ondalıksız ve tek ayraçlı sayıda (`1.250`) Türkçe biçim varsayılır.

## Yardımcı işlevler

```ts
import { cleanVendor, detectBank, parseMoney } from "@pmwdigital/ekstre";

parseMoney("1.250,00 TL");   // 1250
parseMoney("1,250.00");      // 1250
parseMoney("-5.000,00 TL");  // -5000
parseMoney("abc");           // null

parseMoney("2.060");         // 2060, Türkçe: nokta binlik ayracı
parseMoney("2,191");         // 2.191, Türkçe: virgül ondalık ayracı
parseMoney("2.060", "us");   // 2.06
parseMoney("2,191", "us");   // 2191

detectBank(["VakıfBank", "Kredi Kartı Hesap Özeti"]); // "vakif"
cleanVendor("ORNEK LOKANTA  KONYA  TUR", "kuveyt");   // "ORNEK LOKANTA"
```

İki ayraç da varsa sonuncusu ondalıktır. Ayraç tek ve ardından tam üç hane geliyorsa binlik mi ondalık mı olduğu belli olmaz; ikinci parametre `"us"` verilmedikçe Türkçe biçim sayılır.

## PDF'ten satır almak

Kütüphane PDF açmaz. Metni çıkarmak için örneğin [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) kullanılabilir; bu paketin bağımlılığı değildir, kendiniz kurun. pdf.js metni konumlu parçalar olarak verir. `groupLines` aynı yükseklikteki parçaları soldan sağa birleştirip satır yapar ve sütunlar arasındaki geniş boşluğu çift boşlukla gösterir.

```ts
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { groupLines, parseEkstre, type TextPiece } from "@pmwdigital/ekstre";

async function pdfSatirlari(veri: Uint8Array): Promise<string[]> {
  const gorev = getDocument({ data: veri });
  const belge = await gorev.promise;
  const satirlar: string[] = [];
  for (let no = 1; no <= belge.numPages; no += 1) {
    const sayfa = await belge.getPage(no);
    const icerik = await sayfa.getTextContent();
    satirlar.push(...groupLines(icerik.items as TextPiece[]));
  }
  await gorev.destroy();
  return satirlar;
}

const ekstre = parseEkstre(await pdfSatirlari(pdfBaytlari));
```

- Node'da pdf.js'in `legacy` yapısı kullanılır (ana giriş Node 24'te çalışmadı). Tarayıcıda ve paketleyicilerde `"pdfjs-dist"` içe aktarılır.
- `pdfBaytlari` bir `Uint8Array` olmalıdır.
- Örnek, pdfjs-dist 6.5 ve Node 24 ile iki sayfalık bir deneme PDF'iyle çalıştırıldı.
- Taranmış (resim) ekstrelerde metin yoktur; önce OCR gerekir.

## Sınırlar

- Bankalar ekstre düzenini değiştirebilir. Düzen değişirse satırlar atlanabilir ya da yanlış türde okunabilir.
- Yalnızca tarihle (`GG/AA/YYYY` ya da `GG.AA.YYYY`) başlayıp tutarla biten satırlar okunur. Tutarı satır sonunda olmayan düzenler okunamaz. Tutarı okunamayan satır `warnings` listesine yazılır.
- Tür, açıklamadaki sözcüklere (faiz, iade, ödeme gibi) bakılarak tahmin edilir. Bu sözcükleri içermeyen bir ücret satırı harcama sayılır.
- Satıcı adı da bir tahmindir. Banka şehri adın sonuna yapıştırıp kesebilir (yukarıdaki `ORNEK MOBILYA TEKST` gibi); şehir adıyla biten bir satıcı adı da kısalabilir (Kuveyt Türk ve tanınmayan bankalarda `ORNEK DIVAN` satıcısı `ORNEK DI` olur).
- Tutarlar TL kabul edilir. Yabancı para yalnızca açıklamanın başındaki `50 USD ...` biçiminde ve yalnızca USD, EUR, GBP için aranır.

## Geliştirme

```bash
npm install
npm test
npm run typecheck
npm run build
```

Testlerdeki ekstre satırlarının hepsi uydurmadır: gerçek ekstre, kart numarası ya da kişi bilgisi içermez.

## Lisans

MIT
