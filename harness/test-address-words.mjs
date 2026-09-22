// The free address search keeps only matches that carry the words typed:
// "149 Benares Road" once listed a school in Devon and one in Hampshire
// (Atanas, 2026-09-22). Pure logic, off the app's own module.
import { typedWords, matchesTypedWords } from "./gen/lib/addressLookup.js";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const j = JSON.stringify;

check("the house number and the kind of street are not words to match", j(typedWords("149 Benares Road")) === j(["benares"]), j(typedWords("149 Benares Road")));
check("a town typed is a word to match", j(typedWords("149 Benares Road, London")) === j(["benares", "london"]), j(typedWords("149 Benares Road, London")));
check("'10 Downing Street' asks for downing", j(typedWords("10 Downing Street")) === j(["downing"]));
check("'12 The Street' has nothing to insist on", j(typedWords("12 The Street")) === j([]));
check("a flat-number range is still a house number", j(typedWords("12-14 High Street")) === j(["high"]));
check("short words are let go", j(typedWords("1 St Ann's Rd")) === j(["ann's"]));

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

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
