/**
 * Parse WM SOS gondola exercise → CSV + resumen
 */
import XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const SP = 'C:/Users/IAN/AppData/Local/Temp/claude/c--Users-IAN-Documents-bl-dashboard/ceb6616b-df65-4963-b452-50f601f62b10/scratchpad'
const PATH = SP + '/sos.xlsx'
const wb = XLSX.readFile(PATH)

const out = []
const pdvSummary = []

for (const sheetName of wb.SheetNames) {
  if (sheetName === 'LISTA P.V' || sheetName === 'FORMATO') continue
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!grid || grid.length < 10) continue

  const pdvName = grid[4]?.[1] ?? sheetName
  const merca   = grid[5]?.[1] ?? null
  const superv  = grid[5]?.[3] ?? null
  const totalFrentesCategoria = Number(grid[6]?.[2]) || 0
  const totalPaños = Number(grid[7]?.[2]) || 0

  const marcaHeaderRows = []
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]?.[0] === 'Marca' && grid[i]?.[1] === 'Variedad') marcaHeaderRows.push(i)
  }

  const marcasData = []
  for (const hRow of marcaHeaderRows) {
    const marca = grid[hRow + 1]?.[0]
    if (!marca) continue

    for (let v = 0; v < 12; v++) {
      const row = grid[hRow + 1 + v]
      if (!row) continue
      const variedad = row[1]
      if (!variedad) continue
      const ind = Number(row[2]) || 0
      const p3  = Number(row[3]) || 0
      const p6  = Number(row[4]) || 0
      const p12 = Number(row[5]) || 0
      const totalFrentes = ind + p3 + p6 + p12
      if (totalFrentes === 0) continue

      marcasData.push({
        pdv: pdvName,
        merca, superv,
        total_frentes_pdv: totalFrentesCategoria,
        total_paños: totalPaños,
        marca,
        variedad,
        frentes_individual: ind,
        frentes_3pack: p3,
        frentes_6pack: p6,
        frentes_12pack: p12,
        frentes_total: totalFrentes,
      })
    }
  }

  out.push(...marcasData)

  const totalBorden = marcasData.filter(m => m.marca === 'Borden').reduce((s, m) => s + m.frentes_total, 0)
  const totalCounted = marcasData.reduce((s, m) => s + m.frentes_total, 0)
  pdvSummary.push({
    pdv: pdvName,
    total_frentes_categoria: totalFrentesCategoria,
    paños: totalPaños,
    frentes_contados: totalCounted,
    frentes_borden: totalBorden,
    sos_vs_declarados: totalFrentesCategoria > 0 ? (totalBorden / totalFrentesCategoria * 100).toFixed(1) + '%' : '—',
    sos_vs_contados: totalCounted > 0 ? (totalBorden / totalCounted * 100).toFixed(1) + '%' : '—',
    marcas: [...new Set(marcasData.map(m => m.marca))].join(', '),
  })
}

const csvDetalle = ['PDV,Mercaderista,Supervisor,Total_Frentes_Categoria,Paños,Marca,Variedad,Frentes_Individual,Frentes_3pack,Frentes_6pack,Frentes_12pack,Frentes_Total']
for (const r of out) {
  const esc = (v) => { const s = String(v ?? ''); return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s }
  csvDetalle.push([r.pdv, r.merca, r.superv, r.total_frentes_pdv, r.total_paños, r.marca, r.variedad, r.frentes_individual, r.frentes_3pack, r.frentes_6pack, r.frentes_12pack, r.frentes_total].map(esc).join(','))
}
writeFileSync(SP + '/sos_detalle.csv', csvDetalle.join('\n'))

console.log('=== RESUMEN POR PDV ===')
console.table(pdvSummary)

const totalByMarca = {}
for (const r of out) totalByMarca[r.marca] = (totalByMarca[r.marca] || 0) + r.frentes_total
const totalGlobal = Object.values(totalByMarca).reduce((a, b) => a + b, 0)
console.log('\n=== SHARE OF SHELF · GLOBAL (' + out.length + ' filas · ' + pdvSummary.length + ' PDVs) ===')
console.table(Object.entries(totalByMarca).sort((a, b) => b[1] - a[1]).map(([marca, frentes]) => ({
  marca, frentes, pct: (frentes / totalGlobal * 100).toFixed(1) + '%',
})))

const totFrentesDeclarados = pdvSummary.reduce((s, p) => s + Number(p.total_frentes_categoria), 0)
const totFrentesContados = pdvSummary.reduce((s, p) => s + Number(p.frentes_contados), 0)
const totBorden = pdvSummary.reduce((s, p) => s + Number(p.frentes_borden), 0)
console.log('\n=== TOTALES ===')
console.log('PDVs analizados:', pdvSummary.length)
console.log('Frentes categoría (declarados):', totFrentesDeclarados)
console.log('Frentes contados (suma marcas):', totFrentesContados)
console.log('Frentes Borden:', totBorden)
console.log('SOS Borden vs declarados:', (totBorden / totFrentesDeclarados * 100).toFixed(1) + '%')
console.log('SOS Borden vs contados:',   (totBorden / totFrentesContados * 100).toFixed(1) + '%')
console.log('\n📄 CSV: scratchpad/sos_detalle.csv')
