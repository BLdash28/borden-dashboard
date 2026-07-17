import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { clienteDb, inventarioConfig } from '@/lib/mercadeo/cliente'

export const revalidate = 300

/**
 * GET /api/mercadeo/[pais]/[cliente]/faltantes/pdvs?upc=
 *   Drill-down: PDVs específicos donde este SKU está en 0 stock (en el snapshot).
 */
export async function GET(req: NextRequest, { params }: { params: { pais: string; cliente: string } }) {
  try {
    await requireAuth()
    const pais    = params.pais.toUpperCase()
    const cliente = clienteDb(params.cliente)
    if (!cliente) throw new AppError(400, 'cliente', 'Cliente no reconocido')

    const upc = (req.nextUrl.searchParams.get('upc') ?? '').trim()
    if (!upc) throw new AppError(400, 'upc', 'Falta parámetro upc')

    const inv = inventarioConfig(params.cliente)
    if (!inv) return NextResponse.json({ pdvs: [], disponible: false })

    const paisFilter = inv.filtroPais ? `AND t.pais = '${pais.replace(/'/g,"''")}'` : ''

    const snapQ = await pool.query(
      `SELECT MAX(${inv.colFecha})::text AS f FROM ${inv.tabla} t WHERE 1=1 ${paisFilter}`,
    )
    const fecha = snapQ.rows[0]?.f
    if (!fecha) return NextResponse.json({ pdvs: [], fecha: null })

    // Cadena/departamento/ciudad varían por tabla; devolvemos las columnas
    // que existan y NULL las demás.
    const extraCols = inv.tabla === 'inventario_exito'
      ? 't.cadena, t.subcadena, t.departamento, t.ciudad'
      : inv.tabla === 'fact_inventario_walmart_pdv'
        ? 't.cadena, NULL::text AS subcadena, NULL::text AS departamento, NULL::text AS ciudad'
        : 'NULL::text AS cadena, NULL::text AS subcadena, NULL::text AS departamento, NULL::text AS ciudad'

    const { rows } = await pool.query(
      `SELECT
         t.${inv.colPdv} AS punto_venta,
         ${extraCols},
         t.${inv.colInv} AS inv_uds
       FROM ${inv.tabla} t
       WHERE t.${inv.colFecha} = $1
         AND t.${inv.colUpc} = $2
         AND t.${inv.colInv} = 0
         ${paisFilter}
       ORDER BY t.${inv.colPdv}
       LIMIT 500`,
      [fecha, upc],
    )

    return NextResponse.json({
      pais, cliente, upc, fecha, disponible: true,
      pdvs: rows.map((r: any) => ({
        punto_venta:  r.punto_venta,
        cadena:       r.cadena ?? null,
        subcadena:    r.subcadena ?? null,
        departamento: r.departamento ?? null,
        ciudad:       r.ciudad ?? null,
        inv_uds:      Number(r.inv_uds) || 0,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
