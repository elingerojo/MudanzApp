# Stack y restricciones (aplican a todos los modos)

Fuente del **CÓMO**: `.plans/stack-tecnologico-app-mudanzapp.md`.
Lineamientos 0 → 1: `.guidelines/00`–`07`.

Este archivo solo fija las restricciones no negociables. El detalle, la identidad y las
integraciones concretas viven en la fuente del stack.

- TypeScript estricto en todo el monorepo (npm workspaces: `shared`, `backend` y cada frontend de
  `⟨FRONTENDS⟩`; en MudanzApp: `frontend` y `wiki`, más `shop`, declarada en el stack y sin
  workspace hasta su ciclo de bootstrap).
- Frontends: Angular v22 standalone, Signals-first, zoneless, NgOptimizedImage, httpResource,
  Tailwind v4. Plantillas en archivos `.html` separados (nunca inline). `frontend` es la superficie
  privada; `shop` es la superficie pública e indexable y se materializa en su ciclo de bootstrap;
  `wiki` es una SPA propia con su mapa de rutas, igual que la app principal: crece una ruta por
  ciclo, puede consumir el backend con sus propios contratos y no conserva el alcance del arranque.
  El mapa vigente vive en `wiki/README.md`.
- Backend: Node.js + TypeScript (ESM) con Express.
- Datos: Postgres (Neon) con SQL crudo parametrizado vía `pg`. Prohibido cualquier ORM o query
  builder que oculte el SQL. Una sola dev branch de base de datos, local y remota; la rama
  principal se protege.
- Validación: `zod` en la frontera HTTP y en la salida de **toda** integración externa.
- Contratos: mínimos y provisionales; una fuente por hecho; códigos estables en el borde.
- Prohibido `dotenv`: las variables se leen de `process.env`.
- Configuración: el servidor lee el entorno **una sola vez**, en configuración tipada; el
  navegador recibe configuración compilada. Una variable vacía cuenta como ausente.
- Puerto del backend: `PORT` se lee de `process.env`. El default `3000` del código es solo de local y
  de pruebas. En Railway el servicio **define `PORT=3000`** de forma explícita y el dominio público
  apunta a ese puerto; el target port sigue al listener y nunca lo sustituye.
- Integraciones declaradas: `APP_MODE` (integración primaria que reemplaza Wix), `OAUTH_MODE`
  (identidad de cuenta), `R2_MODE` (almacenamiento opcional) y `AI_MODE` (IA), con `live`/`fake` y
  default `live`. `live` exige credenciales válidas; `fake` es el doble determinista de pruebas
  mientras se consiguen. `APP_MODE` gobierna solo las credenciales de esa integración primaria y
  `OAUTH_MODE` solo las de OAUTH. `AI_MODEL` y `OAUTH_ISSUER` se parametrizan si aplica; ni el ID del
  modelo ni el emisor se cablean. Toda integración nueva sigue el mismo patrón y se declara en la
  fuente del stack. El modo de una integración solo se lee cuando su capacidad existe; sin capacidad
  no se construye adaptador ni se exige credencial. El default `live` aplica solo a integraciones
  implementadas. Una variable de modo vacía cuenta como ausente; solo `live` y `fake` son valores
  válidos, y cualquier otro valor falla con un código estable en la primera petición.
- Almacenamiento de objetos: opcional; solo si la app guarda archivos. R2 se declara en la fuente
  del stack.
- Costuras: solo donde compran aprendizaje (fake, segundo adaptador o dependencia cara).
- Testing: Vitest (unit) y Playwright (e2e).
- Fallos: liveness no es readiness; falla ruidoso con evidencia y sin filtrar secretos.
- Alcance aprobado y revisable: no agregar funcionalidad fuera del alcance; si cambia, proponer el
  cambio con su costo (`.guidelines/01`).
- Entrega: un ciclo a la vez, serial estricto; una sola dev branch; commit del ciclo validado.
