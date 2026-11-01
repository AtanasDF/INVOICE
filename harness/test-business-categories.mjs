// Launch review item 13: a B&Q receipt was guessed "Household" in a business
// app, because the default category list mixed personal and business on one
// level. The default is now business headings only; personal spending is a
// group of its own in the drop-downs, never guessed; every category already
// saved on a receipt is still shown as it is.
import { CATEGORIES, OLD_DEFAULT, CATEGORY_SETS, defaultCategoriesFor, effectiveCategories, personalExtras, categoryChoices, isDefaultSet, withUsed } from "./gen/lib/categories.js";
import fs from "fs";
import { REPO } from "./repo.mjs";
const results = [];
const check = (n, ok, d) => { results.push(ok); console.log(ok ? "PASS" : "FAIL", n, ok ? "" : (d ?? "")); };
const J = (x) => JSON.stringify(x);
const PERSONAL_ONLY = ["Groceries", "Household", "Clothes", "Childcare", "Gifts", "Health"];

check("the default list has no personal spending in it", !CATEGORIES.some((c) => PERSONAL_ONLY.includes(c)), J(CATEGORIES));
check("it follows the self-assessment expense headings", ["Materials & stock", "Subcontractors", "Travel & hotels", "Rent & rates", "Repairs", "Phone & internet", "Insurance", "Accountant & legal", "Bank charges & interest", "Advertising"].every((c) => CATEGORIES.includes(c)), J(CATEGORIES));
check("Mileage is still the exact word the mileage page files under", CATEGORIES.includes("Mileage"));
check("Other is still last", CATEGORIES[CATEGORIES.length - 1] === "Other");
check("an account that hasn't said what it is gets the business list", J(defaultCategoriesFor(null)) === J(CATEGORIES));
check("a sole trader's and a company's lists are business only too", ["sole_trader", "limited"].every((k) => !CATEGORY_SETS[k].some((c) => PERSONAL_ONLY.includes(c))));
check("a personal account keeps its personal list", defaultCategoriesFor("personal").includes("Groceries") && defaultCategoriesFor("personal").includes("Household"));

// A list saved back unchanged from the old mixed default was never a choice.
check("the old mixed default saved back as a custom list reads as the business default", J(effectiveCategories([...OLD_DEFAULT], null)) === J(CATEGORIES));
check("and as the kind's own list when the kind is known", J(effectiveCategories([...OLD_DEFAULT], "limited")) === J(CATEGORY_SETS.limited));
const mine = ["Fuel", "Household", "Van", "Other"];
check("a list somebody made themselves is theirs, Household and all", J(effectiveCategories(mine, "sole_trader")) === J(mine));
check("the old default still counts as untouched for Settings", isDefaultSet([...OLD_DEFAULT]) && isDefaultSet([...CATEGORIES]));

// The scanner only ever guesses from the list it is given; with none (the
// email import sends none) it falls back to CATEGORIES, now business only.
const src = (f) => fs.readFileSync(`${REPO}/web/src/${f}`, "utf8");
check("the scanner falls back to the default list", /categories\.length \? categories : \[\.\.\.CATEGORIES\]/.test(src("lib/scanExtraction.ts")));
check("and so does the scan route", /sentCategories\.length \? sentCategories : \[\.\.\.CATEGORIES\]/.test(src("app/api/scan/route.ts")));
check("no category drop-down lists options on its own any more", ["app/receipts/new/page.tsx", "app/receipts/review/page.tsx", "app/receipts/page.tsx", "app/recurring/page.tsx", "app/scan/page.tsx"].every((f) => !/withCurrent\(categories/.test(src(f)) && /<CategoryOptions /.test(src(f))));

// Personal spending is still there, in its own group.
const p = personalExtras([...CATEGORIES]);
check("a business list offers personal spending in a group of its own", p.includes("Groceries") && p.includes("Household"), J(p));
check("without repeating what the business list already has", !p.some((c) => CATEGORIES.includes(c)), J(p));
check("and with no second Other", !p.includes("Other"));
check("a personal account has no extra group: its list already is that", personalExtras(defaultCategoriesFor("personal")).length === 0);
check("nor does a list somebody made with Household in it", personalExtras(mine).length === 0);

// A receipt already filed under a category keeps it.
let c = categoryChoices([...CATEGORIES], "Household");
check("a receipt already filed Household shows Household, in the Personal group", c.personal.includes("Household") && !c.main.includes("Household"), J(c));
c = categoryChoices([...CATEGORIES], "Supplies");
check("one filed under an old heading that left the list shows it, at the top", c.main[0] === "Supplies", J(c.main.slice(0, 3)));
c = categoryChoices([...CATEGORIES], "Fuel");
check("and one already on the list isn't repeated", c.main.filter((x) => x === "Fuel").length === 1);
check("the filter still offers every category the receipts carry", ["Household", "Supplies", "Meals"].every((x) => withUsed([...CATEGORIES], ["Household", "Supplies", "Meals", null]).includes(x)));

console.log(JSON.stringify({ passed: results.filter(Boolean).length, total: results.length }));
