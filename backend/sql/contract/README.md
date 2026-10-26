# Contracción de esquema

Quitar tablas o columnas vive aquí, nunca en `backend/sql/*.sql`.

## Por qué un directorio aparte

El runner ([`scripts/migrate.ts`](../../scripts/migrate.ts:39)) enumera **solo el primer nivel** de
`backend/sql` y aplica **todos** los `.sql` en **cada** invocación. Este directorio no coincide con
ese filtro, así que nada de lo que haya aquí se ejecuta por accidente. Esa es toda la garantía: **la
ruta automática no destruye**.

## Reglas de un archivo de contracción

1. Nombre `NNN_descripcion.sql`, con su propia secuencia, independiente de la del nivel superior.
2. DDL destructivo con `IF EXISTS`, para que reejecutarlo sea inofensivo.
3. Nunca mezcla DDL aditivo con destructivo: lo aditivo va en `backend/sql/*.sql`.
4. Se aplica **después** de la corrida aditiva del mismo destino.
5. Un archivo aplicado no se edita.
6. Los destinos protegidos son `mudanzapp` local y remota: aquí se puede destruir, pero con revisión
   y a mano.

## Cómo se aplica hoy

A mano, sobre el destino elegido por su nombre: en remoto, con el editor SQL del proveedor; en local,
con el cliente del operador. Ningún valor de conexión se transporta ni se imprime. Cuando el gesto se
repita, se convierte en script y entra al catálogo de
[`07-secretos`](../../../.roo/rules/07-secretos.md:1).

Referencia normativa: [`06-datos`](../../../.roo/rules/06-datos.md:1) y la nota E6 de
[`.guidelines/04`](../../../.guidelines/04-datos-y-seguridad.md:1) §3.
