// File names in scripts that write vowels as marks (notes/audit-documents.md,
// second pass, N3): pdfName kept \p{L}\p{N} and turned everything else into a
// space, and a combining mark is "everything else", so "हिन्दी बिल" saved as
// "ह न द ब ल.pdf". Both pdfName and tidyFileName also cut at 80 UTF-16 units,
// which can end a name on half an emoji.
const { pdfName } = await import("./gen/lib/documentPdf.js");
const { tidyFileName } = await import("./gen/lib/saveFile.js");
const { firstChars } = await import("./gen/lib/firstChars.js");
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const loneSurrogate = (s) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(s);

check("Hindi keeps its vowel signs", pdfName("हिन्दी बिल", "Document") === "हिन्दी बिल.pdf", pdfName("हिन्दी बिल", "Document"));
check("Thai keeps its vowels and tones", pdfName("ใบแจ้งหนี้", "Document") === "ใบแจ้งหนี้.pdf", pdfName("ใบแจ้งหนี้", "Document"));
check("Bengali keeps its signs", pdfName("চালান", "Document") === "চালান.pdf", pdfName("চালান", "Document"));
check("Arabic keeps its vowel marks", pdfName("فَاتُورَة", "Document") === "فَاتُورَة.pdf", pdfName("فَاتُورَة", "Document"));
check("a decomposed Café keeps its accent", pdfName("Café bill", "Document") === "Café bill.pdf", pdfName("Café bill", "Document"));
check("plain English is unchanged", pdfName("Receipts October", "Document") === "Receipts October.pdf");
check("what a file name cannot hold still goes", pdfName("a/b:c*d?.pdf", "Document") === "a b c d.pdf", pdfName("a/b:c*d?.pdf", "Document"));
check("nothing typed takes the fallback", pdfName("  ", "Copy") === "Copy.pdf" && pdfName("", "") === "Document.pdf");
check("nothing usable typed is a Document", pdfName("///", "Copy") === "Document.pdf", pdfName("///", "Copy"));

const long = "a".repeat(79) + "😀" + "b";
// 𝐀 is a letter outside the 16-bit range, so it is kept, and is two units.
const wide = "a".repeat(79) + "𝐀𝐀";
check("pdfName: 79 letters and a two-unit letter end on the whole letter", pdfName(wide, "x") === "a".repeat(79) + "𝐀.pdf" && !loneSurrogate(pdfName(wide, "x")), JSON.stringify(pdfName(wide, "x")));
check("tidyFileName: never half an emoji", !loneSurrogate(tidyFileName(long, "x")) && tidyFileName(long, "x") === "a".repeat(79) + "😀", JSON.stringify(tidyFileName(long, "x")));
check("tidyFileName: an accent is not cut from its letter", tidyFileName("e".repeat(79) + "éx", "x") === "e".repeat(79) + "é", JSON.stringify(tidyFileName("e".repeat(79) + "éx", "x")));
check("tidyFileName: the 80 still holds for plain names", tidyFileName("z".repeat(200), "x").length === 80);
check("tidyFileName: Windows' forbidden characters still go", tidyFileName('Invoice <1>: "a"|b', "x") === "Invoice 1 a b", tidyFileName('Invoice <1>: "a"|b', "x"));
check("firstChars counts a flag as one", firstChars("🇬🇧🇬🇧", 1) === "🇬🇧");

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
