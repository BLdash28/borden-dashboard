// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface Row {
  fecha: string
  semana: number
  cadena: string
  subcadena: string
  formato: string
  region: string
  departamento: string
  ciudad: string
  sku: string
  codigo_barras: string
  descripcion: string
  categoria: string
  subcategoria: string
  unidades_sell_in: number
  valor_sell_in_cop: number
  unidades_sell_out: number
  valor_sell_out_cop: number
  precio_compra: number
  precio_comparable: number
  precio_venta: number
  inventario_unidades: number
  devoluciones_unidades: number
  tasa_usd_cop: number
}

export interface Filtros {
  fechaDesde: string
  fechaHasta: string
  formato: string[]
  subcategoria: string[]
  cadena: string[]
  subcadena: string[]
  region: string[]
  departamento: string[]
  ciudad: string[]
  moneda: 'COP' | 'USD'
  tasa: number
}

// ── Catálogos ─────────────────────────────────────────────────────────────────
export const CADENAS: Record<string, { subcadenas: string[]; formato: string }> = {
  'Éxito':        { subcadenas: ['Éxito Extra', 'Éxito Express', 'Éxito Wow'], formato: 'Hipermercado' },
  'Jumbo':        { subcadenas: ['Jumbo Grande', 'Jumbo City'],               formato: 'Hipermercado' },
  'Carulla':      { subcadenas: ['Carulla Fresh', 'Carulla Express'],         formato: 'Supermercado' },
  'Olímpica':     { subcadenas: ['Olímpica Super', 'Olímpica Sao'],           formato: 'Supermercado' },
  'D1':           { subcadenas: ['D1 Urbano', 'D1 Barrio'],                   formato: 'Hard Discount' },
  'Ara':          { subcadenas: ['Ara Estándar'],                             formato: 'Hard Discount' },
  'Justo & Bueno':{ subcadenas: ['Justo & Bueno'],                            formato: 'Hard Discount' },
  'PriceSmart':   { subcadenas: ['PriceSmart Club'],                          formato: 'Mayorista' },
}

export const GEOS: Record<string, { departamentos: Record<string, string[]> }> = {
  Andina:   { departamentos: { Cundinamarca: ['Bogotá', 'Soacha', 'Zipaquirá'], Antioquia: ['Medellín', 'Bello', 'Envigado'], Caldas: ['Manizales'], Risaralda: ['Pereira'], Santander: ['Bucaramanga', 'Floridablanca'] } },
  Caribe:   { departamentos: { Atlántico: ['Barranquilla', 'Soledad'], Bolívar: ['Cartagena'], Magdalena: ['Santa Marta'], Córdoba: ['Montería'] } },
  Pacífica: { departamentos: { 'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura'], Nariño: ['Pasto'] } },
  Orinoquía:{ departamentos: { Meta: ['Villavicencio'], Casanare: ['Yopal'] } },
  Amazonía: { departamentos: { Caquetá: ['Florencia'] } },
}

export const PRODUCTOS = [
  { sku: '53000016052', desc: 'QUESO IWS 500G',        cat: 'QUESOS', subcat: 'IWS',     pc: 14200, pv: 18900, pcomp: 15100 },
  { sku: '53000003502', desc: 'QUESO IWS 250G',        cat: 'QUESOS', subcat: 'IWS',     pc: 7800,  pv: 10500, pcomp: 8200  },
  { sku: '53000067351', desc: 'QUESO SHRED 400G',      cat: 'QUESOS', subcat: 'SHREDS',  pc: 11500, pv: 15200, pcomp: 12100 },
  { sku: '53000052647', desc: 'QUESO SHRED 200G',      cat: 'QUESOS', subcat: 'SHREDS',  pc: 6200,  pv: 8400,  pcomp: 6700  },
  { sku: '53000000631', desc: 'QUESO CHUNK 1KG',       cat: 'QUESOS', subcat: 'CHUNK',   pc: 24000, pv: 31500, pcomp: 25500 },
  { sku: '7452105970109', desc: 'LECHE UHT 1L ENTERA', cat: 'LECHE',  subcat: 'ENTERA',  pc: 2800,  pv: 3600,  pcomp: 2950  },
  { sku: '7452105970093', desc: 'LECHE UHT 1L SEMI',   cat: 'LECHE',  subcat: 'SEMIDESCREMADA', pc: 2900, pv: 3700, pcomp: 3050 },
  { sku: '7452105970055', desc: 'LECHE UHT 1L DESCRM', cat: 'LECHE',  subcat: 'DESCREMADA', pc: 3000, pv: 3800, pcomp: 3150 },
]

// ── Generador de datos mock ────────────────────────────────────────────────────
// PRNG determinista (LCG) para evitar hydration mismatch en SSR
let _seed = 20251002
function _rand(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff
  return _seed / 0x7fffffff
}
function rnd(min: number, max: number) { return Math.floor(_rand() * (max - min + 1)) + min }
function rndF(min: number, max: number) { return +(_rand() * (max - min) + min).toFixed(0) }
function addDays(base: Date, d: number) { const r = new Date(base); r.setDate(r.getDate() + d); return r }

export function generateMockData(): Row[] {
  _seed = 20251002  // reset para resultados deterministas
  const rows: Row[] = []
  const baseDate = new Date('2025-10-02') // jueves
  const TASA = 4320

  const cadenasArr = Object.entries(CADENAS)
  const regionesArr = Object.entries(GEOS)

  for (let semana = 0; semana < 13; semana++) {
    const fechaBase = addDays(baseDate, semana * 7)
    const fechaStr  = fechaBase.toISOString().slice(0, 10)

    for (const prod of PRODUCTOS) {
      // Seleccionar 5-6 combos cadena x ciudad por semana/producto
      const nCombos = rnd(5, 8)
      for (let c = 0; c < nCombos; c++) {
        const [cadena, cadInfo] = cadenasArr[c % cadenasArr.length]
        const subcadena = cadInfo.subcadenas[rnd(0, cadInfo.subcadenas.length - 1)]
        const formato   = cadInfo.formato
        const [region, regInfo] = regionesArr[c % regionesArr.length]
        const deptArr   = Object.entries(regInfo.departamentos)
        const [depto, ciudades] = deptArr[rnd(0, deptArr.length - 1)]
        const ciudad    = ciudades[rnd(0, ciudades.length - 1)]

        // Variación estacional (Q4 Colombia pico)
        const estacFactor = 1 + (semana >= 8 ? 0.15 : 0)
        const uSellIn    = rnd(20, 120) * (formato === 'Hipermercado' ? 2 : 1)
        const uSellOut   = Math.max(0, Math.round(uSellIn * rndF(0.6, 0.95) * estacFactor))
        const uDev       = rnd(0, Math.max(1, Math.floor(uSellIn * 0.05)))
        const uInv       = rnd(10, 80)
        const pcCompra   = prod.pc * rndF(0.95, 1.05)
        const pventa     = prod.pv * rndF(0.98, 1.08)
        const pcomp      = prod.pcomp * rndF(0.97, 1.06)

        rows.push({
          fecha:                fechaStr,
          semana:               semana + 1,
          cadena,
          subcadena,
          formato,
          region,
          departamento:         depto,
          ciudad,
          sku:                  prod.sku,
          codigo_barras:        '',
          descripcion:          prod.desc,
          categoria:            prod.cat,
          subcategoria:         prod.subcat,
          unidades_sell_in:     uSellIn,
          valor_sell_in_cop:    Math.round(uSellIn * pcCompra),
          unidades_sell_out:    uSellOut,
          valor_sell_out_cop:   Math.round(uSellOut * pventa),
          precio_compra:        Math.round(pcCompra),
          precio_comparable:    Math.round(pcomp),
          precio_venta:         Math.round(pventa),
          inventario_unidades:  uInv,
          devoluciones_unidades: uDev,
          tasa_usd_cop:         TASA,
        })
      }
    }
  }
  return rows
}

// ── Helpers de formato ─────────────────────────────────────────────────────────
/**
 * Los valores almacenados en DB (ventas_valor) están en USD.
 * - Modo USD: mostrar tal cual (n = USD)
 * - Modo COP: multiplicar por tasa para convertir USD → COP
 */
export function fmtCOP(n: number, moneda: 'COP' | 'USD', tasa: number): string {
  if (moneda === 'USD') {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const cop = n * tasa
  return 'COP ' + cop.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Formato para precios unitarios (almacenados en USD) */
export function fmtPrice(n: number, moneda: 'COP' | 'USD', tasa: number): string {
  if (moneda === 'USD') return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return 'COP ' + (n * tasa).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Número completo con separador de miles — sin abreviación K/M */
export function fmtN(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function exportCSV(data: any[], filename: string) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const csv  = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
