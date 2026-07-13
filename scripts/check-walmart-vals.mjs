/**
 * check-walmart-vals.mjs — examina filas Walmart con valores bajos/negativos
 */
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const path = 'C:/Users/IAN/AppData/Local/Temp/wm_xls/xl/worksheets/sheet1.xml'
const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })

let buf = ''
const lowSamples = []
const negSamples = []
let totalBorden = 0, lowCount = 0, negCount = 0, zeroValueCount = 0

for await (const line of rl) {
  if (line.startsWith('<row r="')) { buf = line + ' '; continue }
  buf += line + ' '
  if (!line.includes('</row>')) continue
  const vals = []
  const re = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g
  let m
  while ((m = re.exec(buf))) {
    const cl = m[1]
    const ci = cl.length === 1 ? cl.charCodeAt(0) - 65 : (cl.charCodeAt(0) - 64) * 26 + (cl.charCodeAt(1) - 65)
    vals[ci] = m[2] ?? m[3] ?? ''
  }
  buf = ''
  if (vals.length < 14) continue
  const [country, , upc, signingDesc, , brandDesc, daily, , posQty, posSales, posSalesUsd, , storeName, finRptCode] = vals
  if ((brandDesc ?? '').trim().toUpperCase() !== 'BORDEN') continue
  totalBorden++

  const qty = parseFloat(posQty) || 0
  const usd = parseFloat(posSalesUsd) || 0
  const localSales = parseFloat(posSales) || 0

  if (usd < 0) {
    negCount++
    if (negSamples.length < 5)
      negSamples.push({ country, daily, qty, usd, localSales, storeName, signingDesc, finRptCode, upc })
  }
  if (usd > 0 && usd < 1) {
    lowCount++
    if (lowSamples.length < 10)
      lowSamples.push({ country, daily, qty, usd, localSales, storeName, signingDesc, finRptCode, upc })
  }
  if (usd === 0 && qty > 0) zeroValueCount++
}

console.log(`Total filas Borden Walmart: ${totalBorden.toLocaleString()}\n`)
console.log(`Filas con USD entre $0 y $1: ${lowCount.toLocaleString()}`)
console.log(`Filas con USD negativo: ${negCount.toLocaleString()}`)
console.log(`Filas con USD = 0 pero unidades > 0: ${zeroValueCount.toLocaleString()}\n`)

console.log('=== Ejemplos USD < $1 (no negativo) ===')
for (const s of lowSamples) {
  console.log(`  ${s.country} ${s.daily} | ${s.storeName} (${s.finRptCode}) | ${s.signingDesc}`)
  console.log(`     UPC=${s.upc} qty=${s.qty} sales_local=${s.localSales} sales_USD=$${s.usd}`)
}

console.log('\n=== Ejemplos USD negativo (devoluciones?) ===')
for (const s of negSamples) {
  console.log(`  ${s.country} ${s.daily} | ${s.storeName} (${s.finRptCode}) | ${s.signingDesc}`)
  console.log(`     UPC=${s.upc} qty=${s.qty} sales_local=${s.localSales} sales_USD=$${s.usd}`)
}
