/**
 * Headless screenshots of the running dev server, for checking layout and
 * theme without a browser in the loop. Not a test — see tests/ for those.
 *
 * Usage: npm run shoot [-- <url>]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = "screenshots";

const SHOTS = [
  { name: "desktop-dark", width: 1440, height: 900, theme: "dark" },
  { name: "desktop-light", width: 1440, height: 900, theme: "light" },
  { name: "wide-dark", width: 1920, height: 1080, theme: "dark" },
  { name: "short-dark", width: 1280, height: 560, theme: "dark" },
  { name: "narrow-dark", width: 700, height: 900, theme: "dark" },
] as const;

const browser = await chromium.launch();
await mkdir(out, { recursive: true });

for (const shot of SHOTS) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
  });
  await page.addInitScript((theme) => localStorage.setItem("theme", theme), shot.theme);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".board");

  // Report the board's real geometry: a stretched board is the failure mode
  // aspect-ratio alone could not prevent.
  const box = await page.locator(".board").boundingBox();
  const ratio = box ? (box.width / box.height).toFixed(3) : "?";
  console.log(
    `${shot.name.padEnd(14)} ${shot.width}x${shot.height}  board ` +
      `${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}  ratio ${ratio}`,
  );

  await page.screenshot({ path: `${out}/${shot.name}.png` });
  await page.close();
}

await browser.close();
