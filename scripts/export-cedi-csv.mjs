/**
 * Exporta inventario_cedi a CSV
 * Uso: node scripts/export-cedi-csv.mjs [pais]
 * Ejemplo: node scripts/export-cedi-csv.mjs NI
 */
import pg from 'pg'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx < 0) continue
    process.env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch (e) { console.warn('No se pudo cargar .env.local:', e.message) }

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const pais = process.argv[2] || null

async function main() {
  const paisClause = pais ? `AND pais = '${pais.toUpperCase()}'` : ''

  const res = await pool.query(`
    SELECT * FROM inventario_cedi
    WHERE fecha = (SELECT MAX(fecha) FROM inventario_cedi${pais ? ` WHERE pais = '${pais.toUpperCase()}'` : ''})
    ${paisClause}
    ORDER BY pais, descripcion
  `)

  if (res.rows.length === 0) {
    console.log('Sin datos' + (pais ? ` para ${pais}` : ''))
    await pool.end()
    return
  }

  const headers = Object.keys(res.rows[0])
  const lines = [
    headers.join(','),
    ...res.rows.map(row =>
      headers.map(h => {
        const v = row[h]
        if (v === null || v === undefined) return ''
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      }).join(',')
    )
  ]

  const filename = pais
    ? `inventario_cedi_${pais.toUpperCase()}_${new Date().toISOString().slice(0,10)}.csv`
    : `inventario_cedi_${new Date().toISOString().slice(0,10)}.csv`

  const outPath = join(__dirname, '..', filename)
  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`✓ ${res.rows.length} filas exportadas → ${outPath}`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
