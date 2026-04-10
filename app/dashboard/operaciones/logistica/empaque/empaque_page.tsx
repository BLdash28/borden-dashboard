'use client'
export default function Empaque() {
  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--acc)' }}>
            DASHBOARD OPERACIONES · LOGÍSTICA
          </p>
          <h1 className="text-[22px] font-display font-black" style={{ color: 'var(--t1)' }}>
            Empaque
          </h1>
        </div>
      </div>
      <div className="card p-10 flex flex-col items-center justify-center gap-3" style={{ minHeight: 300 }}>
        <span style={{ fontSize: 48 }}>🗂️</span>
        <p className="text-[15px] font-medium" style={{ color: 'var(--t2)' }}>Módulo Empaque</p>
        <p className="text-[12px]" style={{ color: 'var(--t3)' }}>Próximamente — en desarrollo</p>
      </div>
    </div>
  )
}
