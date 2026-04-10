import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AppError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

/*
──────────────────────────────────────────────────────────────────────
SQL — ejecutar en Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS dim_ofertas (
  id                    BIGSERIAL PRIMARY KEY,
  cliente               VARCHAR(200) NOT NULL,
  codigo_interno        VARCHAR(50),
  ean                   VARCHAR(30),
  descripcion           VARCHAR(300),
  baseline_mensual      NUMERIC(14,2) DEFAULT 0,
  baseline_diario       NUMERIC(14,4) DEFAULT 0,
  periodo_oferta_inicio DATE NOT NULL,
  periodo_oferta_fin    DATE NOT NULL,
  dias_oferta           INT           GENERATED ALWAYS AS
                          (CAST(periodo_oferta_fin - periodo_oferta_inicio + 1 AS INT)) STORED,
  precio_regular        NUMERIC(14,4) DEFAULT 0,
  precio_oferta         NUMERIC(14,4) DEFAULT 0,
  descuento_porcentaje  NUMERIC(8,4)  GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND((precio_oferta / precio_regular - 1) * 100, 4)
                            ELSE 0 END) STORED,
  descuento_absoluto    NUMERIC(14,4) GENERATED ALWAYS AS
                          (precio_regular - precio_oferta) STORED,
  incremental_pct       NUMERIC(8,4)  GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND((1 - precio_oferta / precio_regular) * 1.3 * 100, 4)
                            ELSE 0 END) STORED,
  inversion             NUMERIC(14,2) GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND(
                              CAST(periodo_oferta_fin - periodo_oferta_inicio + 1 AS NUMERIC)
                              * baseline_diario
                              * (precio_regular - precio_oferta)
                              * (1 + (1 - precio_oferta / precio_regular) * 1.3),
                            2)
                            ELSE 0 END) STORED,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_ofertas_cliente ON dim_ofertas (LOWER(cliente));
CREATE INDEX IF NOT EXISTS idx_dim_ofertas_ean     ON dim_ofertas (ean);
CREATE INDEX IF NOT EXISTS idx_dim_ofertas_inicio  ON dim_ofertas (periodo_oferta_inicio);
──────────────────────────────────────────────────────────────────────
*/

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new AppError(401, 'Not authenticated', 'Authentication required')

    const sp     = req.nextUrl.searchParams
    const buscar = (sp.get('buscar') || '').trim()
    const page   = Math.max(1, Number(sp.get('page')  || 1))
    const limit  = Math.min(100, Math.max(10, Number(sp.get('limit') || 20)))
    const from   = (page - 1) * limit
    const to     = from + limit - 1

    let query = supabase
      .from('dim_ofertas')
      .select('*', { count: 'exact' })
      .order('periodo_oferta_inicio', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (buscar) {
      query = query.or(
        `cliente.ilike.%${buscar}%,ean.ilike.%${buscar}%,descripcion.ilike.%${buscar}%`
      )
    }

    const { data, error, count } = await query
    if (error) throw new AppError(500, error.message, 'Error al obtener ofertas')

    return NextResponse.json({ ofertas: data ?? [], total: count ?? 0, page, limit })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new AppError(401, 'Not authenticated', 'Authentication required')

    const body = await req.json()
    const {
      cliente, codigo_interno, ean, descripcion,
      baseline_mensual, baseline_diario,
      periodo_oferta_inicio, periodo_oferta_fin,
      precio_regular, precio_oferta,
    } = body

    if (!cliente?.trim())       throw new AppError(400, 'cliente required', 'El campo cliente es requerido')
    if (!periodo_oferta_inicio) throw new AppError(400, 'inicio required',  'Fecha de inicio requerida')
    if (!periodo_oferta_fin)    throw new AppError(400, 'fin required',     'Fecha de fin requerida')
    if (periodo_oferta_fin < periodo_oferta_inicio)
      throw new AppError(400, 'dates', 'La fecha de fin debe ser mayor o igual a la de inicio')

    const { data, error } = await supabase
      .from('dim_ofertas')
      .insert({
        cliente:               cliente.trim(),
        codigo_interno:        codigo_interno || null,
        ean:                   ean            || null,
        descripcion:           descripcion    || null,
        baseline_mensual:      Number(baseline_mensual) || 0,
        baseline_diario:       Number(baseline_diario)  || 0,
        periodo_oferta_inicio,
        periodo_oferta_fin,
        precio_regular:        Number(precio_regular) || 0,
        precio_oferta:         Number(precio_oferta)  || 0,
      })
      .select()
      .single()

    if (error) throw new AppError(500, error.message, 'Error al crear oferta')
    return NextResponse.json({ oferta: data }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
