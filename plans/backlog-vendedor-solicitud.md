# Backlog del vendedor — la solicitud como registro en el panel

> **Rol:** inventario de funcionalidades deseadas para el lado del vendedor, derivadas de B9
> (`request-record`). **No es alcance y no autoriza implementación**: abrir cualquiera exige su fila en
> [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3/§4, su plan y su gate
> ([`01-scope`](../.roo/rules/01-scope.md:1)).
> **Fuente:** [`plan-ciclo-b9`](plan-ciclo-b9-registro-solicitud-comprador.md:1) §4 y §5,
> [`plan-ciclo-b8`](plan-ciclo-b8-request-staleness.md:1) y
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1031) §44.
> **Última revisión:** 2026-11-07, hoja creada al cerrar B9.

## 1. Reglas de uso

1. Una fila es una **hipótesis**, no una promesa; el costo se confirma al abrir el ciclo.
2. La derivación del estado ya existe y es **una sola** (`CART_REQUEST_SNAPSHOT_SQL`). Ninguna fila
   propone una segunda: todas leen el mismo `state` y el mismo `currentPriceCents`.
3. Costo: **S** corte pequeño sin migración; **M** corte vertical o migración; **L** ciclo.
4. Nada de esto cambia lo que el comprador ve, salvo que la fila lo diga.

## 2. Filas

| Id  | Funcionalidad                     | Qué es                                                                                                                                                                                                        | Costo |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| V1  | Registro de la solicitud          | Cada solicitud se relee como un registro: los renglones de la instantánea, el estado de cada artículo y el importe vigente, en un card colapsable con la leyenda `Registro de Artículos solicitados`.         | S     |
| V2  | Importe vigente en el renglón     | El panel publica lo que se pidió y lo que vale hoy: lo no disponible suma `0`, un precio cambiado suma el actual y la nota `Atención, al menos uno de los artículos cambió de precio.` aparece en el resumen. | S     |
| V3  | Historial de solicitudes cerradas | Las canceladas por el comprador y las descartadas por el vendedor dejan de desaparecer: se leen con su instante de cierre y su causa.                                                                         | M     |
| V4  | Filtro por estado                 | La pestaña `Solicitudes` se filtra por `pendiente`, `atendida`, `cancelada` y por «con cambios», sin recargar la lista entera.                                                                                | S     |
| V5  | Búsqueda por referencia o nombre  | Encontrar una solicitud con la referencia que llegó por WhatsApp o con el nombre de la cuenta del comprador.                                                                                                  | S     |
| V6  | Nota privada del vendedor         | Un comentario por solicitud, para lo que ocurre fuera de la aplicación. Exige tabla propia y su migración.                                                                                                    | M     |
| V7  | Contador de pendientes            | Cuántas solicitudes esperan atención, visible en la Cuenta y en la pestaña `Solicitudes`.                                                                                                                     | S     |

## 3. Fuera de esta hoja

- Escribirle al comprador desde la aplicación, avisos en tiempo real (B6) y exclusividad por artículo
  (B3).
- Cambiar la derivación del estado, el importe congelado del panel o el mensaje de WhatsApp.
