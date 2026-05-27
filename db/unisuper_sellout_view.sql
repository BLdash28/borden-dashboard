-- VIEW que une mv_sellout_mensual (Walmart/RetailLink) + fact_sales_sellout GT (Unisuper)
-- fact_ventas_unisuper está vacía — se eliminó ese leg
-- Ejecutar en Supabase SQL Editor al actualizar

-- Paso 1: refrescar el MV tras insertar nuevos datos GT
-- REFRESH MATERIALIZED VIEW mv_sellout_mensual;

-- Paso 2: vista con GT directo desde fact_sales_sellout (sin depender del refresh del MV)
CREATE OR REPLACE VIEW v_sellout_mensual AS

  -- Otros países via MV pre-agregado (rápido, excluye GT para evitar duplicados)
  SELECT ano, mes, pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades
  FROM mv_sellout_mensual
  WHERE pais <> 'GT'

  UNION ALL

  -- GT: Unisuper + Walmart Guatemala — siempre fresco desde la tabla base
  SELECT ano, mes, pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades
  FROM fact_sales_sellout
  WHERE pais = 'GT';
