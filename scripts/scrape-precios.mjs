/**
 * scrape-precios.mjs
 *
 * Scraping de precios por categoría en Walmart CR/GT/HN/NI/SV, La Torre GT (Unisuper) y Selectos SV.
 *
 * Uso:
 *   node scrape-precios.mjs                    → todas las categorías
 *   node scrape-precios.mjs crema-dulce        → solo crema dulce
 *   node scrape-precios.mjs leches quesos      → leches + quesos
 *
 * Categorías disponibles: crema-dulce, leches, quesos, helados
 * Output: C:/Users/IAN/Downloads/Precios_<fecha>_<hora>.xlsx (un sheet por categoría)
 */
import XLSX from 'xlsx'

const CATEGORIAS = {
  'crema-dulce': {
    label: 'Crema Dulce',
    walmart_term: 'crema dulce',
    latorre_term: 'crema dulce',
    selectos_cat: '01526',
    selectos_search: 'crema dulce',
    keyword_filter: /crema/i,
  },
  'leches': {
    label: 'Leches',
    walmart_term: 'leche',
    latorre_term: 'leche',
    selectos_cat: '01529',
    selectos_search: 'leche',
    keyword_filter: /leche/i,
  },
  'quesos': {
    label: 'Quesos',
    walmart_term: 'queso',
    latorre_term: 'queso',
    selectos_cat: '01528',
    selectos_search: 'queso',
    keyword_filter: /queso/i,
  },
  'helados': {
    label: 'Helados',
    walmart_term: 'helado',
    latorre_term: 'helado',
    selectos_cat: null,
    selectos_search: 'helado',
    keyword_filter: /helado|nieve|ice/i,
  },
}

const argv = process.argv.slice(2).map(s => s.toLowerCase())
const CATS_RUN = argv.length === 0 ? Object.keys(CATEGORIAS) : argv.filter(c => CATEGORIAS[c])
if (CATS_RUN.length === 0) {
  console.error('❌ Categorías inválidas. Disponibles:', Object.keys(CATEGORIAS).join(', '))
  process.exit(1)
}

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const ts = today.toISOString().slice(11, 16).replace(':', '')

const VTEX_SITES = [
  { id: 'WM-CR',    name: 'Walmart CR',     base: 'https://www.walmart.co.cr',  moneda: 'CRC' },
  { id: 'WM-GT',    name: 'Walmart GT',     base: 'https://www.walmart.com.gt', moneda: 'GTQ' },
  { id: 'WM-HN',    name: 'Walmart HN',     base: 'https://www.walmart.com.hn', moneda: 'HNL' },
  { id: 'WM-NI',    name: 'Walmart NI',     base: 'https://www.walmart.com.ni', moneda: 'NIO' },
  { id: 'WM-SV',    name: 'Walmart SV',     base: 'https://www.walmart.com.sv', moneda: 'USD' },
  { id: 'LATORRE',  name: 'La Torre (Uni)', base: 'https://www.latorre.com.gt', moneda: 'GTQ' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function scrapeVtex(site, term) {
  const out = []
  for (let p = 0; p < 5; p++) {
    const from = p * 50
    const url = `${site.base}/api/catalog_system/pub/products/search/${encodeURIComponent(term)}?_from=${from}&_to=${from + 49}`
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      if (!r.ok) break
      const data = await r.json()
      if (!Array.isArray(data) || data.length === 0) break
      for (const prod of data) {
        const item    = prod.items?.[0] ?? {}
        const seller  = item.sellers?.[0] ?? prod.sellers?.[0] ?? {}
        const offer   = seller.commertialOffer ?? {}
        out.push({
          cadena: site.name, pais: site.id.split('-')[1] ?? '', moneda: site.moneda,
          productId: prod.productId,
          producto: prod.productName,
          marca: prod.brand ?? '',
          presentacion: prod['Contenido Neto']?.[0] ?? prod['Presentación']?.[0] ?? '',
          ean: item.ean ?? '',
          precio: offer.Price ?? offer.PriceWithoutDiscount ?? null,
          precio_lista: offer.ListPrice ?? null,
          disponible: offer.IsAvailable ?? null,
          url: prod.linkText ? `${site.base}/${prod.linkText}/p` : '',
          imagen: item.images?.[0]?.imageUrl ?? '',
        })
      }
      if (data.length < 50) break
      await sleep(400)
    } catch (e) {
      console.log(`   ⚠️  ${site.id} ${e.message}`); break
    }
  }
  return out
}

async function scrapeSelectos(cat) {
  const base = 'https://www.superselectos.com'
  const out = []
  const seen = new Set()
  // 1) Categoría conocida (si existe)
  const cats = cat.selectos_cat ? [cat.selectos_cat] : []
  for (const c of cats) {
    for (let page = 1; page <= 10; page++) {
      try {
        const r = await fetch(`${base}/products?category=${c}&page=${page}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(20000),
        })
        if (!r.ok) break
        const html = await r.text()
        const re = /<div class="info-prod">[\s\S]*?<strong class="precio"[^>]*>([^<]+)<\/strong>[\s\S]*?<h5 class="prod-nombre">\s*<a[^>]*href="([^"]*productId=(\d+)[^"]*)"[^>]*>([^<]+)<\/a>\s*<\/h5>/g
        let m, nuevos = 0, total = 0
        while ((m = re.exec(html))) {
          total++
          const id = m[3]
          if (seen.has(id)) continue
          seen.add(id)
          out.push({
            cadena: 'Selectos', pais: 'SV', moneda: 'USD',
            productId: id,
            producto: m[4].trim(),
            marca: '', presentacion: '', ean: '',
            precio: parseFloat(m[1].trim().replace('$', '').replace(',', '')),
            precio_lista: null, disponible: true,
            url: `${base}${m[2].replace(/&amp;/g, '&')}`,
            imagen: '',
          })
          nuevos++
        }
        if (total === 0 || nuevos === 0) break
        await sleep(400)
      } catch (e) { break }
    }
  }
  return out
}

// ── Main ─────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
const resumenGlobal = []

for (const catId of CATS_RUN) {
  const cat = CATEGORIAS[catId]
  console.log(`\n══ ${cat.label} ══`)
  const all = []
  for (const site of VTEX_SITES) {
    process.stdout.write(`  ${site.name}…`)
    const rows = await scrapeVtex(site, cat.walmart_term)
    console.log(` ${rows.length} prod`)
    all.push(...rows)
  }
  process.stdout.write(`  Selectos…`)
  const sel = await scrapeSelectos(cat)
  console.log(` ${sel.length} prod`)
  all.push(...sel)

  const filtered = all.filter(r => cat.keyword_filter.test(r.producto ?? ''))
  console.log(`  Total filtrado: ${filtered.length}`)

  // Sheet
  const cols = ['cadena','pais','moneda','marca','producto','presentacion','ean','precio','precio_lista','disponible','url','productId']
  const aoa = [
    [`Precios ${cat.label} — ${fechaIso}`],
    [`Fuentes: Walmart CR/GT/HN/NI/SV (VTEX API) · La Torre GT · Superselectos SV`],
    cols,
    ...filtered.map(r => cols.map(c => r[c] ?? '')),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
  ]
  ws['!cols'] = [
    { wch: 16 }, { wch: 6 }, { wch: 8 }, { wch: 18 }, { wch: 50 },
    { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 60 }, { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, cat.label.slice(0, 31))

  // Resumen por cadena
  const res = {}
  for (const r of filtered) {
    res[r.cadena] ??= { cadena: r.cadena, pais: r.pais, productos: 0, con_precio: 0 }
    res[r.cadena].productos++
    if (r.precio != null) res[r.cadena].con_precio++
  }
  for (const r of Object.values(res)) resumenGlobal.push({ categoria: cat.label, ...r })
}

// Sheet de resumen
const wsR = XLSX.utils.aoa_to_sheet([
  ['Resumen Precios'],
  [`Fecha: ${fechaIso} ${ts}`],
  ['Categoría','Cadena','País','Productos','Con precio'],
  ...resumenGlobal.map(r => [r.categoria, r.cadena, r.pais, r.productos, r.con_precio]),
])
wsR['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wb, wsR, 'Resumen')

const outPath = `C:/Users/IAN/Downloads/Precios_${CATS_RUN.join('-')}_${fechaIso}_${ts}.xlsx`
XLSX.writeFile(wb, outPath)
console.log(`\n📄 ${outPath}`)
console.log('\n=== Resumen ===')
for (const r of resumenGlobal) console.log(`  ${r.categoria.padEnd(12)} ${r.cadena.padEnd(16)} ${r.productos} (${r.con_precio} con precio)`)
