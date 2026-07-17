'use client'
import { createContext, useContext } from 'react'

/**
 * MercadeoMode — cuando true, los componentes de Ejecución embebidos en
 * Mercadeo ocultan métricas monetarias y fuerzan vistas por unidades.
 *
 * Uso en Ejecución: envolver elementos monetarios con
 *   className="hide-in-mercadeo"
 * (regla CSS en globals.css los oculta cuando el root tiene data-mercadeo-mode="1").
 *
 * Uso programático: `const modo = useMercadeoMode()` — devuelve true cuando el
 * componente está renderizado dentro de un módulo de Mercadeo. Sirve para
 * forzar toggles (ej. valor/unidades) a "unidades" y para skip fetches
 * innecesarios de KPIs monetarios.
 */

export const MercadeoModeContext = createContext<boolean>(false)

export function useMercadeoMode(): boolean {
  return useContext(MercadeoModeContext)
}
