import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('base_maestra_colombia')
      .select('cadena, subcadena, departamento, ciudad, punto_venta')

    if (error) throw error

    const rows = data || []

    const cadenaSet      = new Set<string>()
    const subcadenaSet   = new Set<string>()
    const deptoSet       = new Set<string>()
    const ciudadSet      = new Set<string>()

    // cadena → Set<subcadena>
    const subcadenasByCadena: Record<string, Set<string>> = {}
    // subcadena → cadena
    const cadenaBySub: Record<string, string> = {}
    // departamento → Set<cadena>
    const cadenasByDept: Record<string, Set<string>> = {}
    // ciudad → Set<cadena>
    const cadenasByCity: Record<string, Set<string>> = {}
    // departamento → Set<punto_venta>
    const pdvsByDept: Record<string, Set<string>> = {}
    // ciudad → Set<punto_venta>
    const pdvsByCity: Record<string, Set<string>> = {}
    // departamento → Set<subcadena>
    const subcadenasByDept: Record<string, Set<string>> = {}
    // ciudad → Set<subcadena>
    const subcadenasByCity: Record<string, Set<string>> = {}
    // departamento → Set<ciudad>
    const ciudadesByDept: Record<string, Set<string>> = {}

    for (const r of rows) {
      const cadena      = (r.cadena      || '').trim()
      const subcadena   = (r.subcadena   || '').trim()
      const depto       = (r.departamento || '').trim()
      const ciudad      = (r.ciudad      || '').trim()
      const pdv         = (r.punto_venta  || '').trim()

      if (cadena)    cadenaSet.add(cadena)
      if (subcadena) subcadenaSet.add(subcadena)
      if (depto)     deptoSet.add(depto)
      if (ciudad)    ciudadSet.add(ciudad)

      if (cadena && subcadena) {
        subcadenasByCadena[cadena] ??= new Set()
        subcadenasByCadena[cadena].add(subcadena)
        cadenaBySub[subcadena] = cadena
      }

      if (depto && cadena) {
        cadenasByDept[depto] ??= new Set()
        cadenasByDept[depto].add(cadena)
      }

      if (ciudad && cadena) {
        cadenasByCity[ciudad] ??= new Set()
        cadenasByCity[ciudad].add(cadena)
      }

      if (depto && pdv) {
        pdvsByDept[depto] ??= new Set()
        pdvsByDept[depto].add(pdv)
      }

      if (ciudad && pdv) {
        pdvsByCity[ciudad] ??= new Set()
        pdvsByCity[ciudad].add(pdv)
      }

      if (depto && subcadena) {
        subcadenasByDept[depto] ??= new Set()
        subcadenasByDept[depto].add(subcadena)
      }

      if (ciudad && subcadena) {
        subcadenasByCity[ciudad] ??= new Set()
        subcadenasByCity[ciudad].add(subcadena)
      }

      if (depto && ciudad) {
        ciudadesByDept[depto] ??= new Set()
        ciudadesByDept[depto].add(ciudad)
      }
    }

    // Serialize Sets → arrays / numbers
    const toArr = (m: Record<string, Set<string>>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Array.from(v).sort()]))

    return NextResponse.json({
      cadenas:            Array.from(cadenaSet).sort(),
      subcadenas:         Array.from(subcadenaSet).sort(),
      departamentos:      Array.from(deptoSet).sort(),
      ciudades:           Array.from(ciudadSet).sort(),
      subcadenasByCadena: toArr(subcadenasByCadena),
      cadenaBySub,
      cadenasByDept:      toArr(cadenasByDept),
      cadenasByCity:      toArr(cadenasByCity),
      subcadenasByDept:   toArr(subcadenasByDept),
      subcadenasByCity:   toArr(subcadenasByCity),
      ciudadesByDept:     toArr(ciudadesByDept),
      pdvCountByDept:     Object.fromEntries(Object.entries(pdvsByDept).map(([k, v]) => [k, v.size])),
      pdvCountByCity:     Object.fromEntries(Object.entries(pdvsByCity).map(([k, v]) => [k, v.size])),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
