// Normalizes raw RetailLink rptcodes stored in fact_ventas_walmart.cadena
// to their proper chain names. Use CADENA_NORM_SQL in SELECT and GROUP BY.

export const CADENA_NORM_SQL = `CASE UPPER(TRIM(cadena))
  WHEN 'HM' THEN 'WALMART'
  WHEN 'PI' THEN 'PALI'
  WHEN 'ME' THEN 'MAS X MENOS'
  WHEN 'MI' THEN 'MAXI PALI'
  WHEN 'DF' THEN 'DESPENSA FAMILIAR'
  WHEN 'LJ' THEN 'LA DESPENSA DON JUAN'
  WHEN 'PZ' THEN 'PAIZ'
  WHEN 'LN' THEN 'LA UNION'
  ELSE UPPER(TRIM(cadena))
END`

// Inverse: proper name → all raw values that may appear in DB (both code and name)
const CADENA_ALIASES: Record<string, string[]> = {
  'WALMART':               ['WALMART', 'HM'],
  'PALI':                  ['PALI', 'PI'],
  'MAS X MENOS':           ['MAS X MENOS', 'ME'],
  'MAXI PALI':             ['MAXI PALI', 'MI'],
  'MAXI DESPENSA':         ['MAXI DESPENSA', 'MI'],
  'DESPENSA FAMILIAR':     ['DESPENSA FAMILIAR', 'DF'],
  'LA DESPENSA DON JUAN':  ['LA DESPENSA DON JUAN', 'LJ'],
  'PAIZ':                  ['PAIZ', 'PZ'],
  'LA UNION':              ['LA UNION', 'LN'],
}

/** Returns `AND UPPER(TRIM(cadena)) IN (...)` covering rptcodes and name variants. */
export function cadenaWhereSQL(cadena: string): string {
  if (!cadena) return ''
  const aliases = CADENA_ALIASES[cadena.toUpperCase()] ?? [cadena.toUpperCase()]
  const list = aliases.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')
  return `AND UPPER(TRIM(cadena)) IN (${list})`
}
