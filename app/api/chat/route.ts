import { NextRequest } from 'next/server'
import { streamText, tool, stepCountIs } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { pool } from '@/lib/db/pool'
import PDFDocument from 'pdfkit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `Eres Elsie, la asistente de inteligencia comercial de BL Foods.
Siempre respondes en español. Eres amable, precisa y orientada a datos.
Conoces el portafolio de BL Foods: Quesos, Leches y Helados.
Operas en 6 países: Guatemala (GT), Honduras (HN), Nicaragua (NI), El Salvador (SV), Costa Rica (CR) y Colombia (CO).
Los principales clientes/cadenas son: Walmart, Unisuper, Selectos, Grupo Éxito.
Tienes acceso a datos de ventas Sellout (2024–2026), Sell-In y niveles de inventario.
Cuando el usuario pide datos, usa las herramientas disponibles para consultarlos.
Cuando el usuario pide un PDF, genera uno con la información disponible usando generar_pdf.
Responde siempre de forma concisa y estructurada. Usa emojis con moderación.
Si no encuentras datos para un filtro, dilo claramente.`

export async function POST(req: NextRequest) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM,
    messages,
    stopWhen: stepCountIs(6),
    tools: {
      get_ventas: tool({
        description: 'Consulta ventas sellout agregadas por período, país, categoría o cliente.',
        inputSchema: z.object({
          ano:       z.number().optional().describe('Año (ej. 2025)'),
          mes:       z.number().min(1).max(12).optional().describe('Mes 1-12'),
          pais:      z.string().optional().describe('Código de país: GT, HN, NI, SV, CR, CO'),
          categoria: z.string().optional().describe('Categoría: Quesos, Leches, Helados'),
          cliente:   z.string().optional().describe('Nombre del cliente/cadena (parcial)'),
        }),
        execute: async ({ ano, mes, pais, categoria, cliente }) => {
          const conds: string[] = ['ano > 2000']
          const params: unknown[] = []
          let i = 1
          if (ano)      { conds.push(`ano = $${i++}`);                       params.push(ano) }
          if (mes)      { conds.push(`mes = $${i++}`);                       params.push(mes) }
          if (pais)     { conds.push(`pais = $${i++}`);                      params.push(pais.toUpperCase()) }
          if (categoria){ conds.push(`INITCAP(LOWER(categoria)) = $${i++}`); params.push(categoria) }
          if (cliente)  { conds.push(`cliente ILIKE $${i++}`);               params.push(`%${cliente}%`) }
          const where = conds.join(' AND ')
          const [kpi, byPais, byCat, byCliente] = await Promise.all([
            pool.query(`SELECT ROUND(SUM(ventas_valor)::numeric,0) AS total_usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS total_unidades,
              COUNT(DISTINCT pais) AS n_paises, COUNT(DISTINCT sku) AS n_skus,
              COUNT(DISTINCT cliente) AS n_clientes FROM mv_ventas_agg WHERE ${where}`, params),
            pool.query(`SELECT pais, ROUND(SUM(ventas_valor)::numeric,0) AS usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
              FROM mv_ventas_agg WHERE ${where} GROUP BY pais ORDER BY usd DESC`, params),
            pool.query(`SELECT INITCAP(LOWER(categoria)) AS cat,
              ROUND(SUM(ventas_valor)::numeric,0) AS usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
              FROM mv_ventas_agg WHERE ${where} GROUP BY INITCAP(LOWER(categoria)) ORDER BY usd DESC`, params),
            pool.query(`SELECT cliente, ROUND(SUM(ventas_valor)::numeric,0) AS usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
              FROM mv_ventas_agg WHERE ${where} AND cliente IS NOT NULL
              GROUP BY cliente ORDER BY usd DESC LIMIT 10`, params),
          ])
          return { kpi: kpi.rows[0], por_pais: byPais.rows, por_categoria: byCat.rows, por_cliente: byCliente.rows }
        },
      }),

      get_top_skus: tool({
        description: 'Top SKUs por ventas agrupados por código de barras.',
        inputSchema: z.object({
          ano:       z.number().optional(),
          mes:       z.number().min(1).max(12).optional(),
          pais:      z.string().optional(),
          categoria: z.string().optional(),
          limite:    z.number().min(1).max(50).default(10),
        }),
        execute: async ({ ano, mes, pais, categoria, limite }) => {
          const conds: string[] = ['ano > 2000', "codigo_barras IS NOT NULL", "codigo_barras != ''"]
          const params: unknown[] = []
          let i = 1
          if (ano)      { conds.push(`ano = $${i++}`);                       params.push(ano) }
          if (mes)      { conds.push(`mes = $${i++}`);                       params.push(mes) }
          if (pais)     { conds.push(`pais = $${i++}`);                      params.push(pais.toUpperCase()) }
          if (categoria){ conds.push(`INITCAP(LOWER(categoria)) = $${i++}`); params.push(categoria) }
          const where = conds.join(' AND ')
          const r = await pool.query(`
            SELECT codigo_barras, MAX(sku) AS sku, MAX(descripcion) AS descripcion,
              ROUND(SUM(ventas_valor)::numeric,0) AS usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
            FROM mmv_sellout_mensual WHERE ${where}
            GROUP BY codigo_barras ORDER BY usd DESC LIMIT $${i}`, [...params, limite])
          return { top_skus: r.rows }
        },
      }),

      get_evolucion: tool({
        description: 'Evolución mensual de ventas (serie de tiempo).',
        inputSchema: z.object({
          pais:      z.string().optional(),
          categoria: z.string().optional(),
          cliente:   z.string().optional(),
          anos:      z.array(z.number()).optional().describe('Lista de años, ej. [2024, 2025]'),
        }),
        execute: async ({ pais, categoria, cliente, anos }) => {
          const conds: string[] = ['ano > 2000']
          const params: unknown[] = []
          let i = 1
          if (anos && anos.length > 0) {
            conds.push(`ano IN (${anos.map(() => `$${i++}`).join(',')})`); params.push(...anos)
          }
          if (pais)     { conds.push(`pais = $${i++}`);                      params.push(pais.toUpperCase()) }
          if (categoria){ conds.push(`INITCAP(LOWER(categoria)) = $${i++}`); params.push(categoria) }
          if (cliente)  { conds.push(`cliente ILIKE $${i++}`);               params.push(`%${cliente}%`) }
          const where = conds.join(' AND ')
          const r = await pool.query(`
            SELECT ano, mes, ROUND(SUM(ventas_valor)::numeric,0) AS usd,
              ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
            FROM mv_ventas_agg WHERE ${where}
            GROUP BY ano, mes ORDER BY ano, mes`, params)
          return { evolucion: r.rows }
        },
      }),

      get_inventario: tool({
        description: 'Niveles de inventario en tiendas (PDV) o CEDI (bodega Walmart).',
        inputSchema: z.object({
          tipo:   z.enum(['pdv', 'cedi']).describe('pdv = tiendas, cedi = bodega central'),
          pais:   z.string().optional(),
          cadena: z.string().optional(),
          sku:    z.string().optional().describe('Código de barras o descripción parcial'),
        }),
        execute: async ({ tipo, pais, cadena, sku }) => {
          if (tipo === 'pdv') {
            const conds: string[] = ['fecha = (SELECT MAX(fecha) FROM fact_inventario_walmart_pdv)']
            const params: unknown[] = []
            let i = 1
            if (pais)   { conds.push(`pais = $${i++}`);       params.push(pais.toUpperCase()) }
            if (cadena) { conds.push(`cadena ILIKE $${i++}`); params.push(`%${cadena}%`) }
            if (sku)    { conds.push(`(codigo_barras = $${i} OR descripcion ILIKE $${i})`); i++; params.push(sku) }
            const where = conds.join(' AND ')
            const r = await pool.query(`SELECT pais, cadena,
              COUNT(DISTINCT punto_venta) AS tiendas,
              COUNT(DISTINCT codigo_barras) AS skus,
              SUM(inv_mano) AS total_mano,
              SUM(CASE WHEN inv_mano = 0 THEN 1 ELSE 0 END) AS quiebres,
              MIN(fecha) AS fecha
              FROM fact_inventario_walmart_pdv WHERE ${where}
              GROUP BY pais, cadena ORDER BY pais, cadena`, params)
            return { tipo: 'pdv', resumen: r.rows }
          } else {
            const conds: string[] = ['fecha = (SELECT MAX(fecha) FROM fact_inventario_walmart_cedi)']
            const params: unknown[] = []
            let i = 1
            if (pais) { conds.push(`pais = $${i++}`); params.push(pais.toUpperCase()) }
            if (sku)  { conds.push(`(codigo_barras = $${i} OR descripcion ILIKE $${i})`); i++; params.push(sku) }
            const where = conds.join(' AND ')
            const r = await pool.query(`SELECT pais, codigo_barras, descripcion, categoria,
              inv_cajas, inv_orden_cajas, estado, fecha
              FROM fact_inventario_walmart_cedi WHERE ${where}
              ORDER BY pais, inv_cajas DESC LIMIT 50`, params)
            return { tipo: 'cedi', registros: r.rows }
          }
        },
      }),

      get_sell_in: tool({
        description: 'Datos de Sell-In (ventas a clientes/distribuidores).',
        inputSchema: z.object({
          ano:       z.number().optional(),
          mes:       z.number().min(1).max(12).optional(),
          pais:      z.string().optional(),
          cliente:   z.string().optional(),
          categoria: z.string().optional(),
        }),
        execute: async ({ ano, mes, pais, cliente, categoria }) => {
          const conds: string[] = []
          const params: unknown[] = []
          let i = 1
          if (ano)      { conds.push(`ano = $${i++}`);                       params.push(ano) }
          if (mes)      { conds.push(`mes = $${i++}`);                       params.push(mes) }
          if (pais)     { conds.push(`pais = $${i++}`);                      params.push(pais.toUpperCase()) }
          if (cliente)  { conds.push(`cliente_nombre ILIKE $${i++}`);        params.push(`%${cliente}%`) }
          if (categoria){ conds.push(`INITCAP(LOWER(categoria)) = $${i++}`); params.push(categoria) }
          const where = conds.length ? conds.join(' AND ') : 'TRUE'
          const [kpi, byCliente, byPais] = await Promise.all([
            pool.query(`SELECT ROUND(SUM(venta_neta)::numeric,0) AS total_venta_neta,
              ROUND(SUM(cantidad_cajas)::numeric,0) AS total_cajas,
              ROUND(AVG(margen_pct)::numeric,2) AS margen_promedio
              FROM fact_sales_sellin WHERE ${where}`, params),
            pool.query(`SELECT cliente_nombre,
              ROUND(SUM(venta_neta)::numeric,0) AS venta_neta,
              ROUND(SUM(cantidad_cajas)::numeric,0) AS cajas
              FROM fact_sales_sellin WHERE ${where}
              GROUP BY cliente_nombre ORDER BY venta_neta DESC LIMIT 10`, params),
            pool.query(`SELECT pais, ROUND(SUM(venta_neta)::numeric,0) AS venta_neta,
              ROUND(SUM(cantidad_cajas)::numeric,0) AS cajas
              FROM fact_sales_sellin WHERE ${where}
              GROUP BY pais ORDER BY venta_neta DESC`, params),
          ])
          return { kpi: kpi.rows[0], por_cliente: byCliente.rows, por_pais: byPais.rows }
        },
      }),

      generar_pdf: tool({
        description: 'Genera un PDF con el contenido especificado.',
        inputSchema: z.object({
          titulo:         z.string().describe('Título del documento'),
          contenido:      z.string().describe('Contenido del PDF. Secciones separadas por \\n\\n. Usa ## para encabezados de sección.'),
          nombre_archivo: z.string().optional().describe('Nombre del archivo sin extensión .pdf'),
        }),
        execute: async ({ titulo, contenido, nombre_archivo }) => {
          const chunks: Buffer[] = []
          const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
          doc.on('data', (c: Buffer) => chunks.push(c))
          await new Promise<void>((resolve) => {
            doc.on('end', resolve)
            doc.fontSize(18).font('Helvetica-Bold').text(titulo, { align: 'center' })
            doc.moveDown(0.5)
            doc.fontSize(9).font('Helvetica').fillColor('#888888')
              .text(`Generado por Elsie · BL Foods · ${new Date().toLocaleDateString('es-GT')}`, { align: 'center' })
            doc.fillColor('#000000').moveDown(1)
            for (const section of contenido.split('\n\n')) {
              const lines = section.split('\n')
              if (lines[0].startsWith('##')) {
                doc.fontSize(13).font('Helvetica-Bold').text(lines[0].replace(/^##\s*/, ''))
                doc.moveDown(0.3)
                if (lines.length > 1) doc.fontSize(10).font('Helvetica').text(lines.slice(1).join('\n'))
              } else {
                doc.fontSize(10).font('Helvetica').text(section)
              }
              doc.moveDown(0.8)
            }
            doc.end()
          })
          const buffer = Buffer.concat(chunks)
          const filename = (nombre_archivo ?? titulo.toLowerCase().replace(/\s+/g, '_')) + '.pdf'
          return { base64: buffer.toString('base64'), filename, size_kb: Math.round(buffer.length / 1024) }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
