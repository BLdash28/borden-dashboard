# BL Foods · BI Dashboard

Plataforma Business Intelligence para BL Foods Corporation.

## Stack
- **Frontend**: Next.js 14 + React + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth)
- **Deploy**: Vercel

## Setup

### 1. Instalar dependencias
```powershell
cd "C:\Users\IAN\Documents\bl-dashboard"
npm install
```

### 2. Configurar variables de entorno
```powershell
Copy-Item .env.local.example .env.local
notepad .env.local
```

Llena los valores:
```
NEXT_PUBLIC_SUPABASE_URL=https://ntkmokdmpslqbkkqdnxq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Para obtener las keys: Supabase → Project Settings → API Keys

### 3. Ejecutar el SQL en Supabase
Ve a Supabase → SQL Editor → pega el contenido de `bl_foods_schema.sql` → Run

### 4. Crear SuperAdmin en Supabase
Supabase → Authentication → Users → Invite User

Luego actualiza el rol en SQL Editor:
```sql
UPDATE profiles SET role = 'superadmin' WHERE email = 'tu@email.com';
```

### 5. Correr el proyecto
```powershell
npm run dev
```

Abre: http://localhost:3000

## Cargar datos de ventas
```powershell
python cargar_ventas.py --archivo "ventas_enero_2026.xlsx"
python cargar_ventas.py --archivo "ventas.xlsx" --modo reemplazar --mes 1 --anio 2026
```

## Deploy en Vercel
```powershell
npx vercel --prod
```

## Estructura
```
bl-dashboard/
├── app/
│   ├── auth/login/          ← Login con Supabase Auth
│   ├── dashboard/
│   │   ├── page.tsx         ← Selector de departamento
│   │   ├── comercial/       ← Dashboard Comercial
│   │   ├── mercadeo/        ← Dashboard Mercadeo
│   │   ├── operaciones/     ← Dashboard Operaciones
│   │   └── finanzas/        ← Dashboard Finanzas
├── components/
│   ├── layout/              ← Sidebar + Topbar
│   ├── dashboard/           ← Filtros globales
│   ├── charts/              ← Gráficas Recharts
│   └── ui/                  ← KPI Cards, Buttons, etc.
├── lib/supabase/            ← Client + Server clients
├── types/                   ← TypeScript interfaces
├── utils/                   ← Helpers + formatters
├── bl_foods_schema.sql      ← Star Schema SQL completo
└── cargar_ventas.py         ← Loader Excel → Supabase
```
