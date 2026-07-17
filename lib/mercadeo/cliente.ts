/**
 * Utilidades server-side para Mercadeo · cliente-nivel.
 *
 * El slug de cliente en la URL (walmart, unisuper, grupo-exito, ...) se traduce
 * al valor exacto de `v_ventas.cliente` y a la tabla de inventario que aplica.
 */

export type ClienteSlug =
  | 'walmart' | 'unisuper' | 'selectos' | 'grupo-exito'
  | 'costa-dairy' | 'sensacion'

export function clienteDb(slug: string): string | null {
  const map: Record<string, string> = {
    walmart:       'WALMART',
    unisuper:      'UNISUPER',
    selectos:      'SELECTOS',
    'grupo-exito': 'GRUPO ÉXITO',
    'costa-dairy': 'COSTA DAIRY',
    sensacion:     'SENSACION',
  }
  return map[slug.toLowerCase()] ?? null
}

/**
 * Tabla y columnas de inventario según cliente. `null` cuando el cliente no
 * tiene tabla de inventario dedicada (Costa Dairy, Sensación).
 */
export interface InventarioConfig {
  tabla:      string          // fact_inventario_walmart_pdv | inventario_exito | fact_selectos_inventario
  colInv:     string          // inv_mano | inv_unidades
  colFecha:   string          // fecha | fecha_snapshot
  filtroPais: boolean         // true cuando la tabla tiene columna pais
  filtroCadena: boolean       // true cuando la tabla tiene columna cadena (Walmart)
  colPdv:     string          // punto_venta | gln
  colSku:     string          // sku | codigo_barras
  colUpc:     string          // codigo_barras
}

export function inventarioConfig(slug: string): InventarioConfig | null {
  const s = slug.toLowerCase()
  if (s === 'walmart') return {
    tabla: 'fact_inventario_walmart_pdv',
    colInv: 'inv_mano', colFecha: 'fecha',
    filtroPais: true, filtroCadena: false,
    colPdv: 'punto_venta', colSku: 'sku', colUpc: 'codigo_barras',
  }
  if (s === 'grupo-exito') return {
    tabla: 'inventario_exito',
    colInv: 'inv_unidades', colFecha: 'fecha_snapshot',
    filtroPais: true, filtroCadena: false,
    colPdv: 'gln', colSku: 'codigo_interno', colUpc: 'codigo_barras',
  }
  if (s === 'selectos') return {
    tabla: 'fact_selectos_inventario',
    colInv: 'inv_mano', colFecha: 'fecha',
    filtroPais: false, filtroCadena: false,
    colPdv: 'punto_venta', colSku: 'sku', colUpc: 'codigo_barras',
  }
  return null
}
