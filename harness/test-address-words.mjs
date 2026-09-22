// The free address search keeps only matches that carry the words typed:
// "149 Benares Road" once listed a school in Devon and one in Hampshire
// (Atanas, 2026-09-22). Pure logic, off the app's own module.
import { typedWords, typedParts, matchesTypedWords, looksLikeStreet, osmMatch } from "./gen/lib/addressLookup.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const j = JSON.stringify;

check("the house number and the kind of street are not words to match", j(typedWords("149 Benares Road")) === j(["benares"]), j(typedWords("149 Benares Road")));
check("a town typed is a word to match", j(typedWords("149 Benares Road, London")) === j(["benares", "london"]), j(typedWords("149 Benares Road, London")));
check("'10 Downing Street' asks for downing", j(typedWords("10 Downing Street")) === j(["downing"]));
check("'12 The Street' has nothing to insist on", j(typedWords("12 The Street")) === j([]));
check("a flat-number range is still a house number", j(typedWords("12-14 High Street")) === j(["high"]));
check("short words are let go, and an apostrophe is folded away", j(typedWords("1 St Ann's Rd")) === j(["anns"]), j(typedWords("1 St Ann's Rd")));

const benares = { name: "Benares Road", osm_key: "highway", type: "street", city: "London", postcode: "SE18 1HS" };
const teignmouth = { name: "Teignmouth Community School, Exeter Road", street: "Exeter Road", city: "Teignmouth", postcode: "TQ14 9HZ" };
const bedales = { name: "Bedales School", street: "Church Road", city: "Steep", postcode: "GU32 2DG" };
const w = typedWords("149 Benares Road");
check("the road itself matches", matchesTypedWords(benares, w));
check("a school in Devon that only shares 'Road' does not", !matchesTypedWords(teignmouth, w));
check("nor one in Hampshire", !matchesTypedWords(bedales, w));
check("with a town typed, the road in that town matches", matchesTypedWords(benares, typedWords("149 Benares Road London")));
check("...and the same road name in another town does not", !matchesTypedWords({ ...benares, city: "Leeds" }, typedWords("149 Benares Road London")));
check("nothing to insist on: everything matches", matchesTypedWords(teignmouth, []));
check("case does not matter", matchesTypedWords(benares, typedWords("149 BENARES ROAD")));

// Apostrophes and dots, flat and unit prefixes, stray numbers and postcodes.
check("an apostrophe on the map does not lose the street", matchesTypedWords({ name: "King's Road", city: "London", district: "Brompton" }, typedWords("12 Kings Road")));
check("...nor a typographic one typed", matchesTypedWords({ name: "St Ann's Road", city: "London" }, typedWords("St Ann\u2019s Rd")));
check("'Unit 4, Mill Lane' asks only for mill", j(typedWords("Unit 4, Mill Lane")) === j(["mill"]), j(typedWords("Unit 4, Mill Lane")));
check("'Flat 3, 9 Kings Road' asks only for kings", j(typedWords("Flat 3, 9 Kings Road")) === j(["kings"]), j(typedWords("Flat 3, 9 Kings Road")));
check("a postcode or a bare number typed in the street box is not a word to match", j(typedWords("Mill Lane SE18 1HU 42")) === j(["mill"]), j(typedWords("Mill Lane SE18 1HU 42")));
// The town a person types is often not the one the map files the street under.
const market = { name: "Market Street", osm_key: "highway", type: "street", city: "Kirklees", postcode: "HD1 2AB", town: "Huddersfield" };
check("the words before the comma are the street, after it the town", j(typedParts("12 Market Street, Huddersfield")) === j({ must: ["market"], may: ["huddersfield"] }), j(typedParts("12 Market Street, Huddersfield")));
check("the post town resolved from the postcode counts", matchesTypedWords(market, typedParts("12 Market Street, Huddersfield")));
check("the town typed may be missing from the map's fields", matchesTypedWords({ ...market, town: undefined, city: "Kirklees" }, typedParts("12 Market Street, Huddersfield")));
check("...but the street's own name may not", !matchesTypedWords({ name: "Church Road", city: "Huddersfield" }, typedParts("12 Market Street, Huddersfield")));
check("with no street words, the town is what must match", matchesTypedWords({ name: "The Street", city: "Woolwich" }, typedParts("12 The Street, Woolwich")) && !matchesTypedWords({ name: "The Street", city: "Leeds" }, typedParts("12 The Street, Woolwich")));
check("with one word typed it has to be there", !matchesTypedWords(teignmouth, typedWords("149 Benares Road")));

// What searches by itself as it's typed (his second ask): a number and a
// street, or a street's name with its kind; not a flat number, a house name
// on its own or half a word.
for (const [typed, want] of [["149 Benares Road", true], ["149 Ben", true], ["Mill Lane", true], ["Unit 4, Mill Lane", true], ["12-14 High Street", true], ["149", false], ["149 B", false], ["Rose Cottage", false], ["Flat 2", false], ["12 The Street", false], ["", false]]) {
  check(`${JSON.stringify(typed)} ${want ? "searches" : "waits"}`, looksLikeStreet(typed) === want);
}
// A street ends with its postcode when the free data has one, and asks for
// it to be checked; without one it still says to add it.
const withPc = osmMatch({ osm_key: "highway", type: "street", name: "Benares Road", city: "London", postcode: "se18 1hs" }, "osm:0", { houseNumber: "149" });
check("a street with a postcode fills it and asks to check it", j(withPc?.lines) === j(["149 Benares Road", "London", "SE18 1HS"]) && /check it's your postcode/.test(withPc?.detail ?? ""), j(withPc));
const noPc = osmMatch({ osm_key: "highway", type: "street", name: "Amar Court", city: "London" }, "osm:1");
check("a street without one says to add it", j(noPc?.lines) === j(["Amar Court", "London"]) && /add the postcode/.test(noPc?.detail ?? ""), j(noPc));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
