// Convierte cualquier valor a número de forma segura
export const toNum = (v: any): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

// Formato moneda abreviado: $1.2M / $34.5K / $123
export const fmt = (v: any): string => {
  const n = toNum(v)
  if (!isFinite(n)) return '$0'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + Math.round(n).toString()
}

// Formato moneda con 2 decimales: $2.56
export const fmt$ = (v: any): string => '$' + toNum(v).toFixed(2)

// Formato porcentaje: 12.3%
export const fmtPct = (v: any): string => toNum(v).toFixed(1) + '%'

// Alias numérico sin símbolo de moneda: 1,234 / 45.6K / 1.2M
export const fmtNum = (v: any): string => {
  const n = toNum(v)
  if (!isFinite(n)) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.round(n).toLocaleString()
}

export const cn = (...classes: (string | undefined | false | null)[]): string =>
  classes.filter(Boolean).join(' ')

// Record<string, string> permite indexar con variable dinámica (fix del error TS)
// Alias de fmtNum — formato numérico abreviado sin símbolo de moneda
export const fmtK = fmtNum

export const COUNTRY_FLAGS: Record<string, string> = {
  CO: '🇨🇴', CR: '🇨🇷', GT: '🇬🇹', HN: '🇭🇳', NI: '🇳🇮', SV: '🇸🇻',
}

export const COUNTRY_COLORS: Record<string, string> = {
  CO: '#c8873a', CR: '#2a7a58', GT: '#3a6fa8', HN: '#6b4fa8', NI: '#c0402f', SV: '#2a8a8a',
}

// índice 0 vacío para que MONTHS[1] = 'Ene', MONTHS[12] = 'Dic'
export const MONTHS = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
