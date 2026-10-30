# Componente indicador de carga

> **Rol:** documento único de conocimiento del componente `app-indicador-carga`. Es el único lugar
> donde vive este hecho; los demás documentos solo lo referencian. Se carga **únicamente** cuando el
> ciclo toque el indicador: no pertenece al núcleo de contexto.
>
> **Estado:** componente cerrado y **parado**. Su código vive archivado en
> `.plans/referencia/indicador-carga/` y **no** compila, no se prueba y no se despliega. La
> integración al producto es un ciclo futuro que abre el dueño.

El historial de hipótesis y sus números vive en [`../plans/indicador-carga-tentativo.md`](../plans/indicador-carga-tentativo.md:1);
este documento no lo repite: registra el contrato y los valores finales.

## 1. Qué es y qué no es

- Dibuja una tira con cuatro vehículos y una **ventana móvil** que muestra el par de vehículos donde
  cabe la carga. El relleno de cada vehículo es su porcentaje real de llenado.
- **No** posee forma externa: no tiene formulario, ni total, ni botones. Solo recibe `carga`.
- **No** conoce m³ reales de negocio: las capacidades son placeholder (§4).
- Una sola instancia estricta: los `id` de los `clipPath` no llevan sufijo (§8).

## 2. Contrato del componente

| Miembro | Tipo | Papel |
| --- | --- | --- |
| `carga` | `input.required<number>()` | m³ totales. Única señal de la que todo se deriva |
| `sinTransicion` | `input(false)` | Apaga las tres transiciones mientras el host pinta el estado fresco del reset (§7) |

- `ChangeDetectionStrategy.OnPush`, `computed` puros, **sin `effect()`** y sin medidas de DOM.
- Host: `[class.sin-transicion]` desde `sinTransicion`.
- Accesibilidad: el par activo expone `role="meter"` con `aria-valuemin=0`, `aria-valuemax=100`,
  `aria-valuenow` con el **porcentaje real** (no el deformado) y `aria-label="Carga de {nombre}"`.
  El resto de vehículos y el texto del porcentaje van `aria-hidden`. Riesgo abierto: `role="meter"`
  sobre `<g>` está sin verificar con lector de pantalla (§9).

## 3. Pintura: tokens del tema y override local

Los colores **no** viven en el componente. Cada clase lee un rol local y cae a un token de
`shared/src/theme.css`:

| Clase | Rol local | Token del tema | Valor |
| --- | --- | --- | --- |
| `.carga-vacia` | `--indicador-pista` | `--color-meter-track` | `#4953d3` |
| `.carga-llena` | `--indicador-relleno` | `--color-meter-fill` | `#d93a2b` |
| `.rin` | `--indicador-hardware` | `--color-meter-hardware` | `#b3a6a6` |
| `.hueco` | `--indicador-hueco` | `--color-canvas` | `#f8fafc` |
| `.trazo`, `.eje` | `--indicador-trazo` | `--color-ink` | `#0f172a` |
| `.carga-dentro` | `--indicador-texto-dentro` | `--color-surface` | `#ffffff` |
| `.carga-fuera` | `--indicador-texto-fuera` | `--color-ink` | `#0f172a` |

Reglas que sostienen el mecanismo:

- **Un atributo `fill` de SVG no acepta `var()`.** Por eso los 25 colores que antes eran atributos
  son clases. Nunca `fill="none"` en el trazo: borraría el dibujo.
- Las siluetas (`.trazo`) y los centros de eje (`.eje`) **no tenían color declarado**: heredaban el
  negro por defecto del SVG, que es un color sin fuente. La clase lo hace explícito.
- El rol se **lee con fallback y nunca se asigna** (`var(--indicador-x, var(--color-y))`). Eso
  permite el override desde fuera declarando `--indicador-*` en el host o en un ancestro, sin pelear
  con la especificidad de `:host`.
- Delta visual aprobado: el trazo pasó de `#000` a `--color-ink` (`#0f172a`). El resto es idéntico.
- Los tres tokens nuevos existen en el CSS emitido del build; Tailwind no los descarta. Están
  agrupados bajo un comentario en el `@theme` y **no** usan nombres del dominio del indicador.

## 4. Derivación del estado

Capacidades placeholder, derivadas del área de la silueta con 1.8 m³ por 1 000 u², salvo `v3`, que
el dueño fijó en 8. Migrar a configuración o `InjectionToken` al integrar (§8).

| Carga (m³) | En escena | Relleno |
| --- | --- | --- |
| 0 – 2 | v4, v3 | carga/2, carga/8 |
| > 2 – 8 | v3, v2 | carga/8, carga/18 |
| > 8 – 18 | v2, v1 | carga/18, carga/40 |
| > 18 | v1 solo | carga/40, tope 100 % |

- `candidatos`: vehículos con `capacidadM3 >= carga`, ascendente, los dos primeros; si no hay
  ninguno, el mayor solo. El umbral es `>=` para que al llegar justo a su capacidad el vehículo **se
  vea al 100 %** antes de salir de escena.
- Los **cuatro** vehículos se dibujan y se rellenan; el par activo solo decide la ventana y los
  `role="meter"`. Así el recorrido de la tira nunca muestra un vehículo sin relleno.

### 4.1 Curva de percepción

```ts
const t = clamp(carga / capacidadM3, 0, 1);
const k = 0.74;                                  // CURVA_K
const arco = Math.acos(1 - 2 * t) / Math.PI;      // inversa del ease coseno
const p = (1 - k) * t + k * arco;
const nivel = x - 0.03 * ancho + p * ancho * (1 + 2 * 0.03); // OVERHANG = 0.03
```

Amplifica los extremos: 1 % real → 5.0 % visual; 99 % → 95.0 %. La deformación es **solo visual**:
`aria-valuenow` y los umbrales usan el porcentaje real. El sobre-ancho deja el nivel fuera de la
silueta en 0 % y 100 %, así los extremos no dejan astillas.

## 5. Geometría

- `viewBox="0 444 1024 180"`; la tira tiene los cuatro vehículos en un mismo lienzo y se mueve con
  un solo `translateX` (`--dx`), sin reescalar.
- Ventanas con margen de 6 u por lado: `v4+v3` x16 span350 · `v3+v2` x151 span458 · `v2+v1`
  x378 span628 · `v1` x609 span397. El margen evita que el trazo del borde se corte en el marco.
- La ventana se dimensiona por alto y su ancho sale de `calc`:
  `--ventana-alto: min(280px, calc((100vw - 3rem) * 180 / 628))`. `aspect-ratio` no transiciona.
- El rect rojo mide 1024 de ancho y se desplaza con `transform`, no con `width`: no hay reflow y el
  `clipPath` queda estático.
- `100vw` asume contenedor de ancho completo. Si se embebe en algo más angosto, hacen falta
  container queries (§9).

## 6. Tipografía del porcentaje

`Permanent Marker` 400 (único peso publicado, sin negrita real), `@font-face` con el `.woff2` real
del subconjunto latín y `font-display: block` para no medir nunca contra una fuente de reemplazo.

| Vehículo | Modo | `tamano` | `tamano100` | `desplazamientoY` |
| --- | --- | --- | --- | --- |
| v1 | dentro | 64 | 64 | 0 |
| v2 | dentro | 52 | 48 | 0 |
| v3 | dentro | 48 | 40 | −2 |
| v4 | fuera | 40 | 40 | 0 |

- Las medidas se derivan del **ancho de la caja**, en unidades del `viewBox`, nunca en píxeles.
- El 100 % es caso especial: es el único texto de tres dígitos. Con `tamano100` queda entre 1.8 y
  2.1 u de aire por lado; sin él, `v3` desbordaba 6.7 u y `v2` 2.3 u por lado.
- **Medir con `CanvasRenderingContext2D.measureText` y sus `actualBoundingBox*`.** `getBBox()` de un
  `<text>` devuelve la caja de línea del font (1.44 em aquí), no el glifo, y con esa medida todos los
  tamaños quedaban a la mitad. Constantes: `ASCENTE_TINTA_EM=0.77`, `DESCENTE_TINTA_EM=0.03`,
  `CENTRO_TINTA_EM=0.37`, `ANCHO_TEXTO_PEOR_EM=2.34`.
- El centrado usa línea base explícita, no `dominant-baseline`.
- La etiqueta flotante de `v4` se ancla al **vehículo completo**, no a la caja, con
  `y = techo − separacionTecho(2) − descente·tamaño`. Anclarla a la caja la metía en el techo de la
  cabina y la recortaba contra el borde izquierdo de la ventana.

## 7. Animación

| Movimiento | Duración y curva | Motivo |
| --- | --- | --- |
| Tira y ventana | 520 ms `cubic-bezier(0.34, 1.56, 0.64, 1)` | El rebote avisa que se cruzó un umbral. Misma curva y duración en ambas o el marco se desalinea a mitad de la animación |
| Nivel | 300 ms `cubic-bezier(0.2, 0, 0.2, 1)` | Se mueve muchas veces dentro del mismo par; si rebotara, el rebote del recorrido perdería significado |

Con `prefers-reduced-motion: reduce` las tres transiciones se apagan.

**Reset en dos fases** (solo si el host admite entradas negativas): fase 1, `carga = 0` con
`sinTransicion` para pintar el estado fresco sin animar; fase 2, el destino con transición normal.
Necesita **dos `requestAnimationFrame` anidados**: los callbacks de rAF corren antes del pintado, así
que con uno solo las dos fases caerían en el mismo recálculo de estilo y el salto no se vería. El
destino es `Math.max(0, total + valor)`.

## 8. Código archivado e integración futura

`.plans/referencia/indicador-carga/` contiene diez archivos, copia exacta del estado cerrado:

| Archivo | Papel |
| --- | --- |
| `indicador-carga.component.ts` | Contrato, `computed`, host binding |
| `indicador-carga.component.html` | SVG inline con los cuatro vehículos, sin colores literales |
| `indicador-carga.component.css` | Ventana, tira, nivel, easings y capa de pintura por tokens |
| `indicador-carga.component.spec.ts` | Límites, `role="meter"`, `aria-valuenow` |
| `vehiculos-carga.ts` | Capacidades placeholder, ventanas, curva y tipografía |
| `vehiculos-carga.spec.ts` | 21 pruebas de derivación y curva |
| `sandbox-indicador.component.*` (4) | Host con formulario externo, total y reset en dos fases; referencia de la forma que el producto necesite |

- **No se archivó `generar-template.mjs`**: fue un generador one-off que producía el template
  anterior a los tokens; conservarlo invitaría a regenerar un template ya obsoleto.
- Herramientas que se conservan: `plans/screenshot-sandbox.mjs` (acepta prefijo de salida:
  `node plans/screenshot-sandbox.mjs <prefijo>`) y `plans/medir-*.mjs` de la exploración tipográfica.
- Los `.spec.ts` archivados importan rutas relativas: al restaurarlos hay que ajustar el `import` y
  comprobar que Vitest los descubre. Conservan 40 aserciones.

Checklist para cuando el dueño abra el ciclo de integración:

1. Declarar la capacidad en `.plans/resumen-funcional-app-mudanzapp.md` (hoy es un stub; es
   requisito previo, no un paso posterior).
2. Decidir dónde vive y en qué contenedor; si no es de ancho completo, container queries.
3. Capacidades reales por `InjectionToken`, siguiendo el patrón de `API_BASE_URL`.
4. Si habrá segunda instancia, sufijar los `id` de los `clipPath` por instancia.
5. Definir la estrategia de inline del SVG en build. El template de ~246 líneas es tolerable; nunca
   `innerHTML` ni fetch en runtime.
6. Verificar `role="meter"` sobre `<g>` con lector de pantalla; si no se expone, mover el rol a un
   wrapper HTML con texto alternativo.
7. Mantener el porcentaje real en ARIA aunque la curva deforme lo visual.

## 9. Hechos abiertos

- Capacidades reales de los cuatro vehículos.
- Segunda instancia del componente (colisión de `id`).
- Selección manual de un vehículo mayor.
- Estado de sobrecarga o de peligro (hoy: el mayor se queda al 100 %).
- Container queries si el indicador se embebe en un contenedor más angosto.
- Exposición de `role="meter"` en lectores de pantalla.
- Estrategia de inline del SVG para el build.
- Ajuste fino de `k` y `overhang` con pruebas del dueño.
- El patrón «token del tema → rol del componente» es reutilizable; cuando exista un segundo
  consumidor, se promueve a `.plans/decisiones-tecnicas-app-mudanzapp.md` en lugar de duplicarlo.

## 10. Evidencia del cierre

- Gate: `typecheck`, `lint`, `format:check`, `test:web:frontend` (40 pruebas con el sandbox en el
  árbol y 3 después de retirarlo), `build:web:frontend` y `build:web:wiki` — los dos builds porque
  `shared/src/theme.css` es común a los dos frontends.
- Los tres tokens aparecen en el CSS emitido (`styles-*.css`): verificado, sin necesidad de marcar el
  bloque como `static`.
- El `main` del dev server bajó de 95.23 kB a 8.75 kB al retirar el sandbox: el componente salió del
  bundle.
- Capturas del estado cerrado: `plans/tokens-1m3-*.png` y `plans/tokens-10m3-*.png` (320, 768, 1440).
  Las capturas `plans/sandbox-*.png` son **anteriores** al ajuste de `v3` a 8 m³ y no sirven como
  referencia del estado actual.
