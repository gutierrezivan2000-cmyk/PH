import { chromium } from "playwright";
const BASE = "http://localhost:3100";

const PAGES = [
  ["landing", "/", false], ["login", "/login", false],
  ["panel", "/dashboard", true], ["generar", "/dashboard/generar", true],
  ["historial", "/dashboard/historial", true], ["propiedades", "/dashboard/propiedades", true],
  ["residentes", "/dashboard/residentes", true], ["bitacora", "/dashboard/calendario", true],
  ["asistente", "/dashboard/asistente", true], ["agente", "/dashboard/asistente/themis", true],
  ["cartera", "/dashboard/cartera", true], ["presupuesto", "/dashboard/presupuesto", true],
  ["pqrs", "/dashboard/pqrs", true], ["certificados", "/dashboard/certificados", true],
  ["asambleas", "/dashboard/asambleas", true], ["comunicados", "/dashboard/comunicados", true],
  ["configuracion", "/dashboard/configuracion", true], ["suscripcion", "/dashboard/suscripcion", true],
  ["empresa", "/empresa", true],
];

const AUDIT = `(() => {
  const parse = (c) => {
    // Chrome devuelve color-mix() ya resuelto como \`color(srgb r g b / a)\`
    // con los canales en 0..1, no como rgb(). Sin esta rama, todos los fondos
    // y textos con tinte de acento se leían como \`null\` y el auditor los
    // saltaba en silencio: justo los que hay que comprobar.
    const cs = c.match(/color\\(srgb\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)(?:\\s*\\/\\s*([\\d.eE+-]+))?\\)/);
    if (cs) return { r: +cs[1]*255, g: +cs[2]*255, b: +cs[3]*255, a: cs[4] === undefined ? 1 : +cs[4] };
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(s => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
  const lum = (c) => { const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };

  // Fondo real: se apilan los fondos de los ancestros hasta encontrar uno opaco.
  const bgOf = (el) => {
    const capas = [];
    let n = el;
    let degradado = false;
    while (n && n.nodeType === 1) {
      const cs2 = getComputedStyle(n);
      // Un degradado no se puede componer con este método: se marca y el texto
      // se excluye en vez de reportarlo como ilegible. Sin esto, un botón con
      // fondo degradado se leía como blanco sobre blanco (falso positivo).
      if (cs2.backgroundImage && cs2.backgroundImage.indexOf("gradient") !== -1) degradado = true;
      const bg = parse(cs2.backgroundColor);
      if (bg && bg.a > 0) { capas.push(bg); if (bg.a === 1) break; }
      n = n.parentElement;
    }
    if (degradado) return null;
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const ultima = capas[capas.length - 1];
    if (!ultima || ultima.a < 1) {
      const body = parse(getComputedStyle(document.body).backgroundColor);
      base = body && body.a === 1 ? body : base;
    }
    let acc = base;
    for (let i = capas.length - 1; i >= 0; i--) acc = over(capas[i], acc);
    return acc;
  };

  const fallos = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
    if (!txt || txt.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const fg = parse(cs.color); if (!fg || fg.a === 0) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const efectivo = fg.a < 1 ? over(fg, bg) : fg;
    const c = ratio(efectivo, bg);
    const size = parseFloat(cs.fontSize);
    const peso = parseInt(cs.fontWeight) || 400;
    const grande = size >= 24 || (size >= 18.66 && peso >= 700);
    const minimo = grande ? 3 : 4.5;
    if (c < minimo) {
      const clave = txt.slice(0, 40) + "|" + cs.color;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      fallos.push({ texto: txt.slice(0, 48), ratio: +c.toFixed(2), minimo, color: cs.color, size: Math.round(size) });
    }
  }
  return fallos.sort((a, b) => a.ratio - b.ratio);
})()`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const tema = process.argv[2] || "dark";
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: tema === "light" ? "light" : "dark" });
const page = await ctx.newPage();
await page.addInitScript((t) => { try { localStorage.setItem("sophia-theme", t); } catch {} }, tema);

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
const btn = page.getByRole("button", { name: /Entrar al Demo/i }).first();
if (await btn.count()) { await Promise.all([page.waitForURL(/dashboard/, { timeout: 60000 }).catch(()=>{}), btn.click()]); }
await page.waitForTimeout(2500);

let totalFallos = 0;
for (const [nombre, url, auth] of PAGES) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
  await page.waitForTimeout(2200);
  const aplicado = await page.evaluate(() => document.documentElement.dataset.theme);
  const fallos = await page.evaluate(AUDIT);
  totalFallos += fallos.length;
  if (fallos.length) {
    console.log(`\n[${tema}] ${nombre} (tema aplicado: ${aplicado}) — ${fallos.length} textos por debajo del mínimo`);
    for (const f of fallos.slice(0, 6)) console.log(`   ${f.ratio}:1 (min ${f.minimo}) ${f.color} ${f.size}px — "${f.texto}"`);
  } else {
    console.log(`[${tema}] ${nombre} ✓  (tema aplicado: ${aplicado})`);
  }
}
console.log(`\n[${tema}] TOTAL de textos ilegibles: ${totalFallos}`);
await browser.close();
