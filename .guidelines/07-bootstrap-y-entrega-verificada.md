# 07 — Bootstrap y entrega verificada

El arranque de un workspace es el primer corte vertical del producto: deja el stack operando de
extremo a extremo y nada más. Este lineamiento fija sus criterios; los pasos viven en la plantilla y
en el manual, y los comandos en `.roo/rules/04-verificacion.md`.

## 1. Tooling antes del código

- Lint y formato existen antes del primer archivo de fuente: agregarlos después cuesta lo mismo más
  la corrección.
- Una sola configuración de cada tipo, en la raíz, con **pasada única**: la raíz y el arnés también
  se escanean.
- Una configuración que no se ejecuta no existe: se verifica en la misma corrida que el resto.

## 2. El humo es el walking skeleton

- El arranque no implementa features: demuestra build, despliegue, base, CORS y errores de punta a
  punta.
- El humo afirma **valores** resueltos, no la forma del componente: aceptar que la petición resuelva
  tolera un `error` o un `not-configured`.
- El cierre del arranque es local y ejecutable: la corrida local en verde, no una captura de
  pantalla.

## 3. Verificación local por defecto

- Todo gate de ciclo corre en la máquina, contra URLs **derivadas** y con las integraciones en
  `fake`.
- Ninguna prueba depende de una API real, del almacenamiento de objetos ni del motor de IA.
- La verificación es proporcional al corte y crece con el producto; los comandos son de
  `04-verificacion`.

## 4. El arnés posee su entorno

- El envoltorio e2e deriva la URL de pruebas e inyecta el entorno del backend; la config del runner
  lo aplica sobre `webServer.env`.
- Node no sobrescribe una variable presente: un `.env.local` local no puede arrastrar la corrida a
  los servicios reales.
- Un backend de desarrollo escuchando en el puerto del arnés es un fallo del operador, no del
  arnés.

## 5. Desplegable una vez; desplegado, a mano y por hecho remoto

- El contrato de despliegue se declara en el arranque y se prueba en el primer bring-up.
- La verificación remota **no** es parte del gate de ciclo: ocurre cuando cambia un hecho que solo
  existe en remoto.
- **Sin obligación de cadencia:** no se verifica producción por calendario ni por número de commits.

| Hecho remoto                                                           | Por qué no se puede verificar local                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Variable de entorno nueva o renombrada                                 | El valor lo inyecta la plataforma; vacío cuenta como ausente             |
| `APP_BASE_URL`, orígenes de CORS o URL pública                         | El origen es el Worker desplegado; el preflight solo es cross-origin ahí |
| Frontend nuevo, nombre de Worker o `wrangler.jsonc`                    | El nombre del dashboard debe coincidir con `name` o el build falla       |
| Comandos de build, start o healthcheck, o `railway.json` (watch paths) | Solo la plataforma los resuelve y decide qué push dispara el build       |
| Migración que debe existir en remoto                                   | El runner es manual y hacia adelante                                     |
| Dependencia de runtime en el camino de arranque                        | La resuelve la instalación de la plataforma                              |
| Integración que pasa de `fake` a `live`                                | Las credenciales viven en la plataforma                                  |

- El hecho remoto se cierra con un commit que anota los valores observados, nunca credenciales.

## 6. Un artefacto desplegable por frontend

- Cada frontend tiene su build y su Worker; no hay directorio de assets compartido ni Worker
  implícito.
- El nombre del Worker es un parámetro **por frontend** y se declara una sola vez.

## 7. Los contratos del plan son hipótesis

- Un snippet o un contrato escrito en un documento de trabajo no es evidencia hasta la primera
  corrida real.
- Si la corrida lo contradice, se corrige el snippet; no se defiende.

## 8. Nada de esto amplía el alcance

- El arranque no implementa capacidades: cada una llega con su ciclo, según `01` y `06`.
- Una excepción a este lineamiento se anota con la nota de excepción razonable del glosario.
