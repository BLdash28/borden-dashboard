// Agrega `export const revalidate = 300` (o 60 para tiempo real) a endpoints GET
// que solo leen data. Skip: auth, admin, bots, cron, debug (mutaciones o dinámicos).
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'app/api'
const SKIP_PATTERNS = [
  /auth\//, /admin\//, /bots\//, /cron/, /debug/, /alertas\/test/,
  /config-reportes/, /fix-sidebar/, /ajustes\//, /base-maestra/,
  /reportes\/export/, /forecast/, /export/,
]
const REVALIDATE_SECS = 300  // 5 min default

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, files)
    else if (entry.name === 'route.ts') files.push(p)
  }
  return files
}

let added = 0, skipped = 0, hadIt = 0
for (const f of walk(ROOT)) {
  const rel = f.replace(/\\/g, '/')
  if (SKIP_PATTERNS.some(re => re.test(rel))) { skipped++; continue }
  const src = fs.readFileSync(f, 'utf-8')
  if (/^export\s+const\s+revalidate/m.test(src)) { hadIt++; continue }
  if (!/export\s+async\s+function\s+GET/.test(src)) { skipped++; continue }
  // Insertar después del último `import` o al inicio
  const lines = src.split('\n')
  let insertAt = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) insertAt = i + 1
  }
  lines.splice(insertAt, 0, '', `export const revalidate = ${REVALIDATE_SECS}`)
  fs.writeFileSync(f, lines.join('\n'))
  added++
  console.log('+', rel)
}
console.log(`\n=== agregados: ${added}, ya tenían: ${hadIt}, skipped: ${skipped} ===`)
