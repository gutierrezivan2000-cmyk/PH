/**
 * Sonda de endpoints: recorre TODAS las rutas de /api y las pide sin sesión y
 * con sesión demo, buscando revientes (500) y respuestas abiertas.
 *
 * Existe porque leer el código no basta: así se encontró que el asistente no
 * podía responder en modo demo (la ruta tocaba `db`, que en demo lanza) y que
 * exportar la conversación devolvía 500 con el botón mudo.
 *
 * Uso:  node scripts/probe-api.mjs           (requiere `next dev` en :3100)
 *
 * Las rutas con parámetros se rellenan con los identificadores del demo. Las de
 * /cron se omiten: van protegidas por CRON_SECRET y no las llama el navegador.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const rutas = execSync(`find src/app/api -name route.ts | sed 's|src/app/api||; s|/route.ts||' | sort`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((r) => !r.includes("[...nextauth]") && !r.startsWith("/cron"))
  .map((r) =>
    r
      .replace("[agentId]", "themis")
      .replace("[generationId]", "gen-demo-jan-001")
      .replace("[fileType]", "informe")
      .replace("[jobId]", "gen-demo-jan-001")
      .replace("[unitId]", "unit-demo-001")
      .replace("[propertyId]", "prop-demo-001")
      .replace("[id]", "prop-demo-001")
      .replace("[token]", "tok-demo")
  );

const pedirTodas = (page, rs) =>
  page.evaluate(async (lista) => {
    const out = [];
    for (const r of lista) {
      try {
        const res = await fetch("/api" + r);
        let cuerpo = "";
        try { cuerpo = (await res.text()).slice(0, 110); } catch {}
        out.push([r, res.status, cuerpo]);
      } catch (e) {
        out.push([r, "ERR", String(e).slice(0, 60)]);
      }
    }
    return out;
  }, rs);

const browser = await chromium.launch({ executablePath: CHROME });

const anon = await (await browser.newContext()).newPage();
await anon.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await anon.waitForTimeout(1000);
const sinSesion = await pedirTodas(anon, rutas);

const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await Promise.all([
  page.waitForURL(/dashboard/, { timeout: 60000 }).catch(() => {}),
  page.getByRole("button", { name: /Entrar al Demo/i }).first().click(),
]);
await page.waitForTimeout(3000);
const conSesion = await pedirTodas(page, rutas);

let fallos = 0;
console.log("=== 500 / ERR con sesión demo ===");
for (const [r, s, b] of conSesion) {
  if (s >= 500 || s === "ERR") { console.log(`  ${s}  ${r}\n       ${(b || "").replace(/\s+/g, " ").slice(0, 100)}`); fallos++; }
}
if (!fallos) console.log("  ninguno");

let fallosAnon = 0;
console.log("=== 500 / ERR sin sesión ===");
for (const [r, s] of sinSesion) {
  if (s >= 500 || s === "ERR") { console.log(`  ${s}  ${r}`); fallosAnon++; }
}
if (!fallosAnon) console.log("  ninguno");

// Revisar a mano: en demo varias ramas responden datos falsos antes de
// comprobar la sesión, lo cual es correcto; en producción no deben abrirse.
console.log("=== responden 200 sin sesión (revisar que sea a propósito) ===");
for (const [r, s] of sinSesion) if (s === 200) console.log(`  ${r}`);

const codigos = {};
for (const [, s] of conSesion) codigos[s] = (codigos[s] || 0) + 1;
console.log(`\nresumen con sesión: ${JSON.stringify(codigos)}  (${rutas.length} rutas)`);

await browser.close();
process.exit(fallos + fallosAnon > 0 ? 1 : 0);
