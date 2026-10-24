-- 001_init.sql — marcador idempotente de la capa de datos (pre-decisión §14.2).
-- No define tablas de negocio: el modelo de datos se fija con el primer ciclo.
-- Solo hacia adelante e idempotente: se puede aplicar a las cuatro bases locales.

CREATE SCHEMA IF NOT EXISTS app;

COMMENT ON SCHEMA app IS 'Esquema de la aplicación; las tablas de negocio llegan con su ciclo.';
