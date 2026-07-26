import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3100";
const OUT = "/tmp/claude-0/-home-user-PH/4db7f506-05a8-515f-b471-15c0481b6dfd/scratchpad/shots";
fs.mkdirSync(OUT, { recursive: true });

const only = process.argv[2] || null; // optional: capture a single page

const PAGES = [
  { name: "01-landing-hero", url: "/", auth: false, full: false },
  { name: "02-landing-plataforma", url: "/#plataforma", auth: false, full: false, scrollTo: "#plataforma" },
  { name: "03-landing-planes", url: "/#planes", auth: false, full: false, scrollTo: "#planes" },
  { name: "10-dashboard", url: "/dashboard", auth: true, full: false },
  { name: "11-cartera", url: "/dashboard/cartera", auth: true, full: false },
  { name: "12-calendario", url: "/dashboard/calendario", auth: true, full: false },
  { name: "13-comunicados", url: "/dashboard/comunicados", auth: true, full: false },
  { name: "14-presupuesto", url: "/dashboard/presupuesto", auth: true, full: false },
  { name: "15-residentes", url: "/dashboard/residentes", auth: true, full: false },
  { name: "16-propiedades", url: "/dashboard/propiedades", auth: true, full: false },
  { name: "17-generar", url: "/dashboard/generar", auth: true, full: false },
  { name: "18-asistente", url: "/dashboard/asistente", auth: true, full: false },
  { name: "20-portal-recuperar", url: "/portal", auth: false, full: false },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

// ── Log in once with the demo provider ─────────────────────────────
async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // The demo button text varies; try a few selectors.
  const btn = page.getByRole("button", { name: /Entrar al Demo/i }).first();
  if ((await btn.count()) > 0) {
    await Promise.all([
      page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}),
      btn.click(),
    ]);
    await page.waitForTimeout(3000);
  } else {
    console.log("NO demo button found");
  }
  const url = page.url();
  console.log("after login →", url);
  return url.includes("/dashboard");
}

const authed = await login();
console.log("authenticated:", authed);

for (const p of PAGES) {
  if (only && !p.name.includes(only)) continue;
  try {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // let animations settle
    if (p.scrollTo) {
      await page.locator(p.scrollTo).scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(900);
    }
    await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: !!p.full });
    console.log("✓", p.name);
  } catch (e) {
    console.log("✗", p.name, String(e).slice(0, 120));
  }
}

await browser.close();
console.log("\nlistas en", OUT);

/*
 * USO:
 *   1) cp .env.example .env  → DEMO_MODE=true, AUTH_SECRET=..., AUTH_URL=http://localhost:3100
 *   2) npx next dev -p 3100
 *   3) node scripts/screenshots.mjs            (todas)
 *      node scripts/screenshots.mjs 11-cartera (una)
 * Las capturas quedan en el scratchpad; sirven para revisar el diseño real
 * renderizado en vez de suponerlo desde el código.
 */
