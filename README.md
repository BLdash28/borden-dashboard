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

## Cargar datos de Sell-Out (sellout)
```powershell
python cargar_sellout.py "COMERCIAL_2025_2026_MARZO.csv"
```
El script elimina todos los datos existentes de `fact_sales_sellout` e inserta desde cero.

## Cargar datos de Sell-In

### Formato del archivo esperado
El archivo puede ser `.xlsx`, `.xls`, `.xlsb` o `.csv`. Columnas mínimas requeridas:

| Columna | Aliases aceptados | Obligatorio |
|---|---|---|
| `numero_factura` | `factura`, `invoice`, `nro_factura`, `num_factura` | Sí |
| `linea_factura` | `linea`, `line`, `item`, `renglon` | Sí |
| `fecha_factura` | `fecha`, `date`, `invoice_date`, `fecha_doc` | Sí |
| `pais` | `country`, `pais_codigo` | Sí |
| `cliente_codigo` | `cod_cliente`, `client_code`, `customer_id` | No |
| `cliente_nombre` | `cliente`, `client`, `customer`, `razon_social` | No |
| `sku` | `codigo`, `cod_producto`, `item_code`, `product_code` | Sí |
| `descripcion` | `description`, `producto`, `product`, `nombre_producto` | No |
| `cantidad_unidades` | `unidades`, `units`, `qty`, `cantidad` | No |
| `venta_neta` | `neto`, `net`, `importe_neto`, `valor_neto` | No |
| `costo_total` | `costo`, `cost`, `total_cost`, `costo_mercancia` | No |

### Ejemplo de uso

```bash
# Carga normal (UPSERT — no borra data existente)
python cargar_sellin.py --archivo "Facturacion_Marzo_2026.xlsx"

# Reemplazar toda la data de un mes específico
python cargar_sellin.py --archivo "Facturacion_GT_Feb26.xlsx" --modo reemplazar --pais GT --mes 2 --ano 2026

# Cargar CSV con separador automático
python cargar_sellin.py --archivo "sellin_sv.csv" --pais SV
```

### Verificar que los datos cargaron correctamente

```sql
-- Resumen por país / año / mes
SELECT
    pais,
    ano,
    mes,
    COUNT(*)                        AS lineas,
    SUM(cantidad_unidades)          AS unidades,
    ROUND(SUM(venta_neta)::numeric, 2) AS venta_neta_usd,
    ROUND(AVG(margen_pct)*100, 1)   AS margen_pct_avg
FROM fact_sales_sellin
GROUP BY pais, ano, mes
ORDER BY pais, ano, mes;

-- Vista rápida del último mes cargado
SELECT * FROM mv_sellin_resumen_mensual
ORDER BY ano DESC, mes DESC
LIMIT 20;
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
