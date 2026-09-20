import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1180, deviceScaleFactor: 2 });
await page.goto("file://" + process.argv[2], { waitUntil: "networkidle0" });
await page.screenshot({ path: process.argv[3] });
await browser.close();
console.log("shot");
