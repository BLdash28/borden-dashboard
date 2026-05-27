import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

// fact_sales_sellout almacena ventas_valor en USD (RetailLink). TC para convertir a moneda local.
const TC: Record<string, number> = { CR: 510, GT: 7.75, HN: 25, NI: 37, SV: 1 }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Busca precio en VTEX por EAN primero, luego por texto
// Devuelve ListPrice (PVP original) y Price (precio con posible descuento)
async function scrapePrecio(domain: string, ean: string, nombre: string): Promise<{
  precioLista: number | null; precioOferta: number | null; url: string | null; encontrado: boolean
}> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; BLDashboard/1.0; +https://bordenlatam.com)',
    'Accept': 'application/json',
  }

  function extraerPrecios(item: any): { precioLista: number | null; precioOferta: number | null } {
    const offer = item?.items?.[0]?.sellers?.[0]?.commertialOffer
    const lista  = offer?.ListPrice ?? null
    const oferta = offer?.Price     ?? null
    return {
      precioLista:  lista  ? parseFloat(lista)  : null,
      precioOferta: oferta ? parseFloat(oferta) : null,
    }
  }

  // Intento 1: buscar por EAN — prueba el valor original y padded a 13 dígitos (EAN-13)
  try {
    const cleanEan = ean?.replace(/[^0-9]/g, '')
    if (cleanEan) {
      const eanVariants = [...new Set([cleanEan, cleanEan.padStart(13, '0'), cleanEan.padStart(12, '0')])]
      for (const eanVal of eanVariants) {
        const res = await fetch(
          `https://${domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${eanVal}`,
          { headers, signal: AbortSignal.timeout(8000) }
        )
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            const item = data[0]
            const { precioLista, precioOferta } = extraerPrecios(item)
            const linkId = item?.linkText
            if (precioLista !== null || precioOferta !== null) {
              return {
                precioLista, precioOferta,
                url: linkId ? `https://${domain}/${linkId}/p` : null,
                encontrado: true,
              }
            }
          }
        }
      }
    }
  } catch { /* continúa con búsqueda por texto */ }

  // Intento 2: buscar por nombre (primeros 60 caracteres)
  try {
    const query = encodeURIComponent(nombre.slice(0, 60))
    const res = await fetch(
      `https://${domain}/api/catalog_system/pub/products/search?ft=${query}&_from=0&_to=2`,
      { headers, signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0]
        const { precioLista, precioOferta } = extraerPrecios(item)
        const linkId = item?.linkText
        if (precioLista !== null || precioOferta !== null) {
          return {
            precioLista, precioOferta,
            url: linkId ? `https://${domain}/${linkId}/p` : null,
            encontrado: true,
          }
        }
      }
    }
  } catch { /* nada */ }

  return { precioLista: null, precioOferta: null, url: null, encontrado: false }
}

// GET — última captura de precios por sku+formato, o catálogo de cadenas
export async function GET(req: NextRequest) {
  try {
    const sp      = req.nextUrl.searchParams
    const pais    = sp.get('pais') || ''
    const formato = sp.get('formato') || ''

    // ?cadenas=true → devuelve el catálogo de dim_cadena para poblar la UI
    if (sp.get('cadenas') === 'true') {
      const r = await pool.query(`
        SELECT pais, cadena, formato, url, dominio, shared_site, shared_with
        FROM dim_cadena
        WHERE activo = true
        ${pais ? `AND pais = '${pais.replace(/'/g, "''")}'` : ''}
        ORDER BY pais, formato, cadena
      `)
      return NextResponse.json({ cadenas: r.rows })
    }

    const ano    = sp.get('ano')    || ''
    const mes    = sp.get('mes')    || ''

    const mFilters: string[] = []
    if (pais)    mFilters.push(`mpw.pais = '${pais.replace(/'/g, "''")}'`)
    if (formato) mFilters.push(`mpw.formato = '${formato.replace(/'/g, "''")}'`)
    const where = mFilters.length ? 'WHERE ' + mFilters.join(' AND ') : ''

    // Filtro de período para el PVP dinámico
    const periodoFilter = ano
      ? `AND fs.ano = ${parseInt(ano)}${mes ? ` AND fs.mes = ${parseInt(mes)}` : ''}`
      : `AND fs.ano IN (2025,2026)`

    // PVP calculado on-the-fly según el período elegido.
    // diferencia_pct también se recalcula para reflejar el PVP del período.
    const tcFactor = pais ? (TC[pais] ?? 1) : 1

    const r = await pool.query(`
      WITH pvp AS (
        SELECT fs.sku, fs.pais,
          ROUND(
            SUM(fs.ventas_valor) / NULLIF(SUM(fs.ventas_unidades), 0) * ${tcFactor}::numeric, 2
          ) AS precio_pvp
        FROM fact_sales_sellout fs
        WHERE TRUE ${pais ? `AND fs.pais = '${pais.replace(/'/g, "''")}'` : ''} ${periodoFilter}
        GROUP BY fs.sku, fs.pais
      )
      SELECT DISTINCT ON (mpw.sku, mpw.formato)
        mpw.id, mpw.fecha_captura, mpw.pais, mpw.formato, mpw.cadena,
        mpw.sku, mpw.codigo_barras, mpw.descripcion,
        mpw.precio_walmart, mpw.precio_oferta, mpw.url_producto, mpw.encontrado, mpw.estado,
        pvp.precio_pvp,
        CASE WHEN pvp.precio_pvp > 0 AND mpw.precio_walmart IS NOT NULL
             THEN ROUND(((mpw.precio_walmart - pvp.precio_pvp) / pvp.precio_pvp * 100)::numeric, 1)
             ELSE NULL END AS diferencia_pct
      FROM monitor_precios_walmart mpw
      LEFT JOIN pvp ON pvp.sku = mpw.sku AND pvp.pais = mpw.pais
      ${where}
      ORDER BY mpw.sku, mpw.formato, mpw.fecha_captura DESC
      LIMIT 500
    `)
    return NextResponse.json({ rows: r.rows })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST — lanza monitoreo para pais + formatos
// Si se incluye `sku` en el body, solo scrape ese producto (modo rápido, sin rate-limit).
// Si no hay `sku`, scrape todos los productos del país (modo batch, 1 s entre peticiones).
export async function POST(req: NextRequest) {
  try {
    const { pais, formatos, sku: singleSku, ano, mes }: {
      pais: string; formatos: string[]; sku?: string; ano?: number; mes?: number
    } = await req.json()

    if (!pais || !formatos?.length) {
      return NextResponse.json({ error: 'pais y formatos requeridos' }, { status: 400 })
    }

    // Obtener cadenas activas para el país y los formatos pedidos
    const cadenasR = await pool.query<{
      cadena: string; formato: string; dominio: string; shared_site: boolean
    }>(`
      SELECT cadena, formato, dominio, shared_site
      FROM dim_cadena
      WHERE activo = true
        AND pais = $1
        AND formato = ANY($2::text[])
      ORDER BY formato, cadena
    `, [pais, formatos])

    if (cadenasR.rows.length === 0) {
      return NextResponse.json({ error: 'No hay cadenas configuradas para ese país/formatos' }, { status: 404 })
    }

    // Deduplicar por dominio — evita dobles peticiones en sitios shared_site=true
    const porDominio = new Map<string, typeof cadenasR.rows>()
    for (const c of cadenasR.rows) {
      if (!porDominio.has(c.dominio)) porDominio.set(c.dominio, [])
      porDominio.get(c.dominio)!.push(c)
    }

    // Filtro de período para el PVP
    const periodoFilter = ano
      ? `AND fs.ano = ${ano}${mes ? ` AND fs.mes = ${mes}` : ''}`
      : `AND fs.ano IN (2025,2026)`

    // Obtener producto(s). Si viene singleSku, solo ese (sin filtro de ventas mínimas).
    const prodR = await pool.query(`
      SELECT
        dp.sku,
        dp.codigo_barras,
        dp.descripcion,
        ROUND(
          CASE WHEN SUM(fs.ventas_unidades) > 0
               THEN SUM(fs.ventas_valor) / SUM(fs.ventas_unidades)
               ELSE 0 END::numeric, 2
        ) AS pvp
      FROM dim_producto dp
      LEFT JOIN fact_sales_sellout fs
        ON fs.sku = dp.sku AND fs.pais = $1 ${periodoFilter}
      WHERE dp.is_active = true AND dp.sku IS NOT NULL
        ${singleSku ? `AND dp.sku = '${singleSku.replace(/'/g, "''")}'` : ''}
      GROUP BY dp.sku, dp.codigo_barras, dp.descripcion
      ORDER BY dp.descripcion
      LIMIT ${singleSku ? 1 : 300}
    `, [pais])

    const productos = prodR.rows
    const resultados: any[] = []

    for (const [dominio, grupo] of porDominio) {
      for (const prod of productos) {
        // Rate limit solo en modo batch para respetar la plataforma VTEX
        if (!singleSku) await sleep(1000)

        const { precioLista, precioOferta, url, encontrado } = await scrapePrecio(
          dominio,
          String(prod.codigo_barras ?? ''),
          prod.descripcion ?? ''
        )

        const pvpLocal = prod.pvp ? parseFloat(prod.pvp) * (TC[pais] ?? 1) : null
        // Compara PVP original (ListPrice, moneda local) contra nuestro precio de referencia
        const precioRef = precioLista ?? precioOferta

        for (const c of grupo) {
          const estado = !encontrado                     ? 'no_encontrado'
            : precioRef === null                          ? 'error'
            : pvpLocal && Math.abs((precioRef - pvpLocal) / pvpLocal) > 0.05 ? 'diferencia'
            : 'ok'

          await pool.query(`
            INSERT INTO monitor_precios_walmart
              (pais, formato, cadena, sku, codigo_barras, descripcion,
               precio_walmart, precio_oferta, precio_pvp, url_producto, encontrado, estado)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          `, [
            pais, c.formato, c.cadena,
            prod.sku, prod.codigo_barras, prod.descripcion,
            precioLista, precioOferta, pvpLocal, url, encontrado, estado,
          ])

          resultados.push({ sku: prod.sku, formato: c.formato, cadena: c.cadena, precioLista, precioOferta, encontrado, estado })
        }
      }
    }

    return NextResponse.json({ ok: true, procesados: resultados.length, resultados })
  } catch (err: any) {
    // Tabla no existe → mensaje claro en vez de 500 genérico
    if (err?.code === '42P01') {
      return NextResponse.json(
        { error: `Tabla no encontrada: "${err.table ?? err.message}". Corre db/monitor_precios_walmart.sql en Supabase.` },
        { status: 500 }
      )
    }
    // Columna inválida
    if (err?.code === '42703') {
      return NextResponse.json({ error: `Columna inválida: ${err.message}` }, { status: 500 })
    }
    console.error('[monitor-walmart POST]', err)
    return NextResponse.json({ error: err?.message ?? 'Error interno' }, { status: 500 })
  }
}
