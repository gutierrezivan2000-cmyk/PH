import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3100";
const OUT = "/tmp/claude-0/-home-user-PH/4db7f506-05a8-515f-b471-15c0481b6dfd/scratchpad/shots";
fs.mkdirSync(OUT, { recursive: true });

// node scripts/screenshots.mjs [filtro] [--mobile]
const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const only = args.find((a) => !a.startsWith("--")) || null;

const PAGES = [
  { name: "01-landing-hero", url: "/", auth: false },
  { name: "02-landing-plataforma", url: "/#plataforma", auth: false, scrollTo: "#plataforma" },
  { name: "03-landing-planes", url: "/#planes", auth: false, scrollTo: "#planes" },
  { name: "10-dashboard", url: "/dashboard", auth: true },
  { name: "11-cartera", url: "/dashboard/cartera", auth: true },
  { name: "12-calendario", url: "/dashboard/calendario", auth: true },
  { name: "13-comunicados", url: "/dashboard/comunicados", auth: true },
  { name: "14-presupuesto", url: "/dashboard/presupuesto", auth: true },
  { name: "15-residentes", url: "/dashboard/residentes", auth: true },
  { name: "16-propiedades", url: "/dashboard/propiedades", auth: true },
  { name: "17-generar", url: "/dashboard/generar", auth: true },
  { name: "18-asistente", url: "/dashboard/asistente", auth: true },
  { name: "19-pqrs", url: "/dashboard/pqrs", auth: true },
  { name: "20-certificados", url: "/dashboard/certificados", auth: true },
  { name: "21-asambleas", url: "/dashboard/asambleas", auth: true },
  { name: "22-historial", url: "/dashboard/historial", auth: true },
  { name: "23-portal-recuperar", url: "/portal", auth: false },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext(
  mobile
    ? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" }
);
const page = await ctx.newPage();

// ── Log in once with the demo provider ─────────────────────────────
async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const btn = page.getByRole("button", { name: /Entrar al Demo/i }).first();
  if ((await btn.count()) === 0) {
    console.log("NO demo button found");
    return false;
  }
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 30000 }).catch(() => {}),
    btn.click(),
  ]);
  await page.waitForTimeout(3000);
  console.log("after login →", page.url());
  return page.url().includes("/dashboard");
}

console.log("authenticated:", await login(), mobile ? "(móvil 390x844)" : "(escritorio 1440x900)");

const suffix = mobile ? "-m" : "";
for (const p of PAGES) {
  if (only && !p.name.includes(only)) continue;
  try {
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // let animations settle
    if (p.scrollTo) {
      await page.locator(p.scrollTo).scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(900);
    }
    await page.screenshot({ path: `${OUT}/${p.name}${suffix}.png` });
    // Horizontal overflow is the classic mobile bug — flag it instead of
    // making me eyeball every capture.
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    console.log("✓", p.name, over > 2 ? `⚠ desborda ${over}px` : "");
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
 *   3) node scripts/screenshots.mjs                    (escritorio, todas)
 *      node scripts/screenshots.mjs --mobile           (móvil 390x844, todas)
 *      node scripts/screenshots.mjs 11-cartera         (una sola)
 * Las capturas quedan en el scratchpad; sirven para revisar el diseño real
 * renderizado en vez de suponerlo desde el código.
 */
