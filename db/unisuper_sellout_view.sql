-- VIEW que une fact_sales_sellout + fact_ventas_unisuper
-- Ejecutar en Supabase SQL Editor al actualizar

CREATE OR REPLACE VIEW v_sellout_mensual AS

  -- RetailLink / Walmart (ya en USD, via materialized view)
  SELECT ano, mes, pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades
  FROM mv_sellout_mensual

  UNION ALL

  -- Unisuper GT — datos nuevos en fact_sales_sellout (ya en USD)
  -- Insertados por el bot unisuper_venta_diaria / venta_mensual
  SELECT ano, mes, pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades
  FROM fact_sales_sellout
  WHERE pais = 'GT' AND cliente = 'Unisuper'

  UNION ALL

  -- Unisuper GT — datos históricos en tabla legacy (GTQ → USD ÷ 7.7)
  -- Mantener hasta que se migre la data histórica a fact_sales_sellout
  SELECT
    EXTRACT(YEAR  FROM fecha)::int                    AS ano,
    EXTRACT(MONTH FROM fecha)::int                    AS mes,
    'GT'                                              AS pais,
    COALESCE(NULLIF(cadena, ''), 'Unisuper')          AS cadena,
    categoria,
    codigo_sku                                        AS sku,
    nombre_sucursal                                   AS punto_venta,
    ROUND((venta_neta / 7.7)::numeric, 2)             AS ventas_valor,
    unidades                                          AS ventas_unidades
  FROM fact_ventas_unisuper;
