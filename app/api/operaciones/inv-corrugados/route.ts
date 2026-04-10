// app/api/operaciones/inv-corrugados/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

// SKUs válidos para corrugados
const SKUS_CORRUGADOS = [
  'B138-003-001',
  'B138-002-001',
  'B138-004-001',
  'B138-006-001',
  'B138-005-001',
  'B138-001-001',
]

const DESCRIPCIONES: Record<string, string> = {
  'B138-003-001': 'CAJA BORDEN GENERICA 12 LITROS',
  'B138-002-001': 'CAJA BORDEN GENERICA 3 PACK',
  'B138-004-001': 'CAJA BORDEN LECHE ENTERA 12 PACK',
  'B138-006-001': 'CAJA BORDEN DESCREMADA PACK',
  'B138-005-001': 'CAJA BORDEN SEMIDESCREMADA 12 PACK',
  'B138-001-001': 'CAJA BORDEN DESLACTOSADA SEMIDESCREMADA 12 PACK',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vista = searchParams.get('vista')
  const cod   = searchParams.get('cod')

  const client = await pool.connect()
  try {

    // ── INVENTARIO ────────────────────────────────────────
    if (!vista || vista === 'inventario') {
      // Asegurar que los 6 SKUs existen en la tabla
      for (const sku of SKUS_CORRUGADOS) {
        await client.query(
          `INSERT INTO inv_corrugados (cod_interno, descripcion, u_m, cant_bodega)
           VALUES ($1, $2, 'UNIDAD', 0)
           ON CONFLICT (cod_interno) DO NOTHING`,
          [sku, DESCRIPCIONES[sku]]
        )
      }

      const r = await client.query(
        `SELECT cod_interno, descripcion, u_m,
                ROUND(cant_bodega, 4)                        AS cant_bodega,
                ROUND(cant_bodega * 0.01, 4)                AS merma,
                ROUND(cant_bodega - cant_bodega * 0.01, 4)  AS total_disponible,
                fecha_actualizacion
         FROM inv_corrugados
         WHERE activo = TRUE
         ${cod ? 'AND cod_interno = $1' : ''}
         ORDER BY cod_interno`,
        cod ? [cod] : []
      )
      return NextResponse.json({ rows: r.rows })
    }

    // ── PEDIDOS ───────────────────────────────────────────
    if (vista === 'pedidos') {
      const estado = searchParams.get('estado')
      const params: any[] = []
      let where = 'WHERE 1=1'
      if (estado) { params.push(estado); where += ` AND p.estado = $${params.length}` }
      if (cod)    { params.push(cod);    where += ` AND p.cod_interno = $${params.length}` }

      const r = await client.query(
        `SELECT p.id, p.fecha, p.cod_interno, p.descripcion, p.u_m,
                p.cantidad_pedida, p.estado, p.referencia,
                p.creado_en, p.procesado_en,
                c.cant_bodega - c.cant_bodega * 0.01 AS total_disponible
         FROM inv_corrugados_pedidos p
         LEFT JOIN inv_corrugados c ON c.cod_interno = p.cod_interno
         ${where}
         ORDER BY p.fecha DESC, p.id DESC`,
        params
      )
      return NextResponse.json({ rows: r.rows })
    }

    // ── SALIDAS ───────────────────────────────────────────
    if (vista === 'salidas') {
      const params: any[] = []
      let where = 'WHERE 1=1'
      if (cod) { params.push(cod); where += ` AND s.cod_interno = $${params.length}` }

      const r = await client.query(
        `SELECT s.id, s.fecha, s.cod_interno, s.descripcion, s.u_m,
                s.cantidad_salida, s.referencia_pedido, s.tipo,
                p.referencia AS ref_orden, s.observacion, s.creado_en
         FROM inv_corrugados_salidas s
         LEFT JOIN inv_corrugados_pedidos p ON p.id = s.referencia_pedido
         ${where}
         ORDER BY s.fecha DESC, s.id DESC`,
        params
      )
      return NextResponse.json({ rows: r.rows })
    }

    // ── HISTORIAL AUDITORÍA ───────────────────────────────
    if (vista === 'historial') {
      if (!cod) return NextResponse.json({ error: 'cod requerido' }, { status: 400 })
      // Entradas
      const entradas = await client.query(
        `SELECT fecha, 'ENTRADA' AS tipo, cantidad, observacion AS detalle, proveedor AS ref
         FROM inv_corrugados_movs WHERE cod_interno = $1`, [cod]
      )
      // Salidas a producción
      const salidas = await client.query(
        `SELECT fecha, 
                CASE WHEN tipo = 'produccion' THEN 'SALIDA PRODUCCIÓN' ELSE 'SALIDA PEDIDO' END AS tipo,
                cantidad_salida AS cantidad,
                observacion AS detalle,
                referencia_pedido::text AS ref
         FROM inv_corrugados_salidas WHERE cod_interno = $1`, [cod]
      )
      const rows = [...entradas.rows, ...salidas.rows].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      )
      return NextResponse.json({ rows })
    }

    return NextResponse.json({ error: 'Vista inválida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { accion } = body
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // ── ENTRADA ───────────────────────────────────────────
    if (accion === 'entrada') {
      const { cod_interno, descripcion, u_m, cantidad, fecha, observacion, proveedor } = body

      // Insertar si no existe
      await client.query(
        `INSERT INTO inv_corrugados (cod_interno, descripcion, u_m, cant_bodega)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (cod_interno) DO NOTHING`,
        [cod_interno, descripcion || DESCRIPCIONES[cod_interno] || '', u_m || 'UNIDAD']
      )

      // Sumar a bodega
      await client.query(
        `UPDATE inv_corrugados
         SET cant_bodega = cant_bodega + $1, fecha_actualizacion = NOW()
         WHERE cod_interno = $2`,
        [cantidad, cod_interno]
      )

      // Log del movimiento
      await client.query(
        `INSERT INTO inv_corrugados_movs
           (fecha, cod_interno, descripcion, u_m, tipo, cantidad, observacion, proveedor)
         VALUES ($1, $2, $3, $4, 'ENTRADA', $5, $6, $7)`,
        [
          fecha || new Date().toISOString().slice(0, 10),
          cod_interno,
          descripcion || DESCRIPCIONES[cod_interno] || '',
          u_m || 'UNIDAD',
          cantidad,
          observacion || null,
          proveedor || null,
        ]
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, accion: 'entrada' })
    }

    // ── SALIDA A PRODUCCIÓN ───────────────────────────────
    if (accion === 'salida_produccion') {
      const { cod_interno, descripcion, u_m, cantidad, fecha, observacion } = body

      const inv = await client.query(
        `SELECT cant_bodega, cant_bodega - cant_bodega * 0.01 AS total_disponible
         FROM inv_corrugados WHERE cod_interno = $1 AND activo = TRUE`,
        [cod_interno]
      )
      if (inv.rows.length === 0)
        throw new Error(`Producto ${cod_interno} no existe en inventario`)

      if (parseFloat(cantidad) > parseFloat(inv.rows[0].total_disponible))
        throw new Error(
          `Stock insuficiente. Disponible: ${inv.rows[0].total_disponible}, Solicitado: ${cantidad}`
        )

      // Insertar salida con tipo produccion
      await client.query(
        `INSERT INTO inv_corrugados_salidas
           (fecha, cod_interno, descripcion, u_m, cantidad_salida, tipo, observacion)
         VALUES ($1, $2, $3, $4, $5, 'produccion', $6)`,
        [
          fecha || new Date().toISOString().slice(0, 10),
          cod_interno,
          descripcion || DESCRIPCIONES[cod_interno] || '',
          u_m || 'UNIDAD',
          cantidad,
          observacion || null,
        ]
      )

      // Reducir bodega
      await client.query(
        `UPDATE inv_corrugados
         SET cant_bodega = cant_bodega - $1, fecha_actualizacion = NOW()
         WHERE cod_interno = $2`,
        [cantidad, cod_interno]
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, accion: 'salida_produccion' })
    }

    // ── CREAR PEDIDO ──────────────────────────────────────
    if (accion === 'crear_pedido') {
      const { cod_interno, cantidad_pedida, referencia, fecha } = body

      const inv = await client.query(
        `SELECT cod_interno, descripcion, u_m,
                cant_bodega - cant_bodega * 0.01 AS total_disponible
         FROM inv_corrugados WHERE cod_interno = $1 AND activo = TRUE`,
        [cod_interno]
      )
      if (inv.rows.length === 0)
        throw new Error(`Producto ${cod_interno} no existe en inventario`)

      const prod = inv.rows[0]

      if (parseFloat(cantidad_pedida) > parseFloat(prod.total_disponible))
        throw new Error(
          `Stock insuficiente. Disponible: ${prod.total_disponible}, Pedido: ${cantidad_pedida}`
        )

      const r = await client.query(
        `INSERT INTO inv_corrugados_pedidos
           (fecha, cod_interno, descripcion, u_m, cantidad_pedida, estado, referencia)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6)
         RETURNING id`,
        [
          fecha || new Date().toISOString().slice(0, 10),
          cod_interno,
          prod.descripcion,
          prod.u_m,
          cantidad_pedida,
          referencia || null,
        ]
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, id: r.rows[0].id, accion: 'crear_pedido' })
    }

    // ── ULTIMO PEDIDO POR COD ─────────────────────────────
    if (accion === 'ultimo_pedido_cod') {
      const { cod_interno } = body
      await client.query('COMMIT')
      const r = await client.query(
        `SELECT id FROM inv_corrugados_pedidos
         WHERE cod_interno = $1 AND estado = 'PENDIENTE'
         ORDER BY id DESC LIMIT 1`,
        [cod_interno]
      )
      return NextResponse.json({ id: r.rows[0]?.id || null })
    }

    // ── APROBAR PEDIDO → genera SALIDA automática ─────────
    if (accion === 'aprobar_pedido') {
      const { pedido_id } = body

      const ped = await client.query(
        `SELECT p.*, c.cant_bodega - c.cant_bodega * 0.01 AS total_disponible
         FROM inv_corrugados_pedidos p
         JOIN inv_corrugados c ON c.cod_interno = p.cod_interno
         WHERE p.id = $1 AND p.estado = 'PENDIENTE'`,
        [pedido_id]
      )
      if (ped.rows.length === 0)
        throw new Error('Pedido no encontrado o ya procesado')

      const p = ped.rows[0]

      if (parseFloat(p.cantidad_pedida) > parseFloat(p.total_disponible))
        throw new Error(
          `Stock insuficiente al aprobar. Disponible: ${p.total_disponible}, Pedido: ${p.cantidad_pedida}`
        )

      // Cambiar estado
      await client.query(
        `UPDATE inv_corrugados_pedidos
         SET estado = 'PROCESADO', procesado_en = NOW()
         WHERE id = $1`,
        [pedido_id]
      )

      // Generar salida automática
      await client.query(
        `INSERT INTO inv_corrugados_salidas
           (fecha, cod_interno, descripcion, u_m, cantidad_salida, referencia_pedido, tipo)
         VALUES ($1, $2, $3, $4, $5, $6, 'pedido')`,
        [
          new Date().toISOString().slice(0, 10),
          p.cod_interno, p.descripcion, p.u_m,
          p.cantidad_pedida, pedido_id,
        ]
      )

      // Reducir bodega
      await client.query(
        `UPDATE inv_corrugados
         SET cant_bodega = cant_bodega - $1, fecha_actualizacion = NOW()
         WHERE cod_interno = $2`,
        [p.cantidad_pedida, p.cod_interno]
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, accion: 'aprobado', pedido_id })
    }

    // ── AJUSTE DIRECTO DE INVENTARIO (solo superadmin) ────
    if (accion === 'ajuste_inventario') {
      const restricciones = await getUserRestrictions()
      const rolOk = restricciones?.role === 'superadmin' || restricciones?.role === 'admin'
      if (!rolOk) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'Solo admin puede hacer ajustes directos de inventario' }, { status: 403 })
      }

      const { cod_interno, cantidad_nueva, motivo } = body
      if (cantidad_nueva === undefined || cantidad_nueva === null)
        throw new Error('cantidad_nueva requerida')

      const prev = await client.query(
        'SELECT cant_bodega, descripcion, u_m FROM inv_corrugados WHERE cod_interno = $1',
        [cod_interno]
      )
      if (prev.rows.length === 0) throw new Error(`Producto ${cod_interno} no encontrado`)

      const cantPrev = parseFloat(prev.rows[0].cant_bodega)
      const cantNueva = parseFloat(cantidad_nueva)
      const diff = cantNueva - cantPrev

      await client.query(
        'UPDATE inv_corrugados SET cant_bodega = $1, fecha_actualizacion = NOW() WHERE cod_interno = $2',
        [cantNueva, cod_interno]
      )

      await client.query(
        `INSERT INTO inv_corrugados_movs
           (fecha, cod_interno, descripcion, u_m, tipo, cantidad, observacion)
         VALUES (NOW()::date, $1, $2, $3, 'AJUSTE', $4, $5)`,
        [
          cod_interno,
          prev.rows[0].descripcion,
          prev.rows[0].u_m,
          Math.abs(diff),
          motivo || `Ajuste manual: ${cantPrev} → ${cantNueva}`,
        ]
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, accion: 'ajuste_inventario', anterior: cantPrev, nueva: cantNueva })
    }

    throw new Error('Acción no reconocida')
  } catch (e: any) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e.message }, { status: 400 })
  } finally {
    client.release()
  }
}
