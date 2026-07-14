/**
 * Barra de navegación por tabs para módulos Ejecución.
 * Reutilizado por Éxito, Walmart, Selectos, etc. — mismo look y behavior.
 */
export type SectionDef = { key: string; label: string }

export function SectionNav({
  sections, section, onChange, accent = 'amber',
}: {
  sections: readonly SectionDef[]
  section: string
  onChange: (key: string) => void
  /** Color del border/text del tab activo. Default 'amber' (Éxito). */
  accent?: 'amber' | 'blue' | 'emerald' | 'violet'
}) {
  const accentCls = {
    amber:   'border-amber-500 text-amber-600 bg-amber-50/40',
    blue:    'border-blue-500 text-blue-600 bg-blue-50/40',
    emerald: 'border-emerald-500 text-emerald-600 bg-emerald-50/40',
    violet:  'border-violet-500 text-violet-600 bg-violet-50/40',
  }[accent]

  return (
    <div className="px-6 pt-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto">
          {sections.map(s => (
            <button key={s.key} onClick={() => onChange(s.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0
                ${section === s.key
                  ? accentCls
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
