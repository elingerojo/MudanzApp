# @mudanzapp/wiki

SPA del proyecto (Angular v22 standalone, zoneless, Tailwind v4, plantillas `.html` separadas) del
monorepo MudanzApp. No es un apéndice del arranque: es un frontend con su propio mapa de rutas y
crece una ruta por ciclo.

## Rutas

| Ruta                      | Página                      | Qué es                                                      |
| ------------------------- | --------------------------- | ----------------------------------------------------------- |
| `/`                       | `IndiceComponent`           | Índice del registro: los diez tiles del mapa                |
| `/estado`                 | `StatusComponent`           | Humo del arranque: proceso y base desde `/health`           |
| `/ingenieria/m0-registro` | `M0RegistroComponent`       | Contrato del registro: mapa fijo, frescura y forma de citar |
| `/ingenieria/e1-entorno`  | `E1EntornoComponent`        | Entorno, prohibiciones y dependencias aprobadas             |
| `/ingenieria/e2-alcance`  | `E2AlcanceComponent`        | Alcance, fuera de alcance y hechos pendientes del dueño     |
| `/ingenieria/e3-entrega`  | `E3EntregaComponent`        | Gate, comandos, matriz de bases y despliegue                |
| `/app/a0-superficies`     | `A0SuperficiesComponent`    | Actores, superficies, puertos y Workers                     |
| `/app/a1-administracion`  | `A1AdministracionComponent` | Plataforma y evento, con sus guardas y sus actos            |
| `/app/a2-captura`         | `A2CapturaComponent`        | Cuenta, foto, borrador de IA, revisión y publicación        |
| `/app/a3-catalogo`        | `A3CatalogoComponent`       | Índice del evento, ficha, cuenta del visitante y carrito    |
| `/app/a4-contratos`       | `A4ContratosComponent`      | Contratos compartidos, esquema, códigos e integraciones     |
| `/app/a5-brechas`         | `A5BrechasComponent`        | Brechas, aparcado y correcciones pendientes                 |

- El mapa de tiles —código, título, ruta y disponibilidad— vive en
  [`src/app/tiles.ts`](src/app/tiles.ts:1) y de ahí se derivan el índice y las rutas. Un tile sin
  cargador aparece en el índice sin enlace y no tiene ruta publicada; hoy los diez están construidos.
- **Dev**: `npm run dev -w wiki -- --port 4201` desde la raíz. El puerto `4200` lo usa
  `frontend`; el segundo frontend queda en `4201`. El proxy `/api` apunta al backend local en
  `:3000`.
- **Build**: `npm run build:web:wiki` desde la raíz.
- **Tests unitarios**: `npm run test:web:wiki` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`.

## Dossier

El dossier es el producto de `wiki`: describe el estado **presente** de la aplicación y por qué está
así, como base para colaboradores externos del proyecto open source. El registro no cuenta la
historia de los ciclos y no crece con una sección por funcionalidad: es un mapa fijo de tiles que se
actualiza cuando su hecho cambia.

| Bloque     | Tiles     | Cubre                                                                                                 |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Ingeniería | M0, E1–E3 | Contrato del registro, entorno y dependencias, alcance, entrega y verificación                        |
| Aplicación | A0–A5     | Actores y superficies, administración, cuenta y captura, catálogo público, contratos y datos, brechas |

- El contrato del registro —un dueño por hecho, cabecera de frescura, qué se cita y qué se retira—
  vive en [`/ingenieria/m0-registro`](src/app/ingenieria/m0-registro/m0-registro.component.html:1).
- El registro se mantiene en el mismo commit de cada funcionalidad: lo exige
  [`04-verificacion`](../.roo/rules/04-verificacion.md:1), y el procedimiento —tabla área → tile,
  cabecera y forma de citar— vive en [`wiki-delta`](../.plans/wiki-delta.md:1). Sin delta, el cuerpo
  del commit declara `wiki: sin delta — <motivo>`.
- Un tile sin contenido verificado aparece en el índice como `pendiente` y no se enlaza.
- El roadmap anterior de seis secciones queda superado: las secciones 1, 2 y 4 se absorben en A2, A0
  y A3; las 5 y 6 pasan a A5 como brechas. La revisión del corte 4g (`direct-upload`) sigue vigente
  —el navegador escribe las tres variantes con una URL prefirmada y la mediana del borrador va a
  Railway— y sus claims pertenecen a A2 y A4. Referencias: decisiones §20, §28 y §45 de
  [`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md)).
