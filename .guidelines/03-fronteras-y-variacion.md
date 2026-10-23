# 03 — Fronteras y variación

En 0 → 1, la arquitectura debe permitir aprender sin pagar por abstracciones que todavía no se justifican.

## 1. Costuras solo donde compran aprendizaje

Extrae una interfaz cuando se cumpla al menos una condición:

- necesitas un doble determinista para probar;
- existe un segundo adaptador probable;
- la dependencia externa es cara, lenta o riesgosa.

Una costura sin un consumidor concreto es deuda, no diseño. No abstracts "por si acaso".

## 2. Configuración por frontera de confianza

- El servidor lee `process.env` una sola vez, en configuración tipada.
- El navegador recibe configuración compilada en el bundle; nunca lee secretos en runtime.
- Una variable declarada pero vacía cuenta como ausente.

Esta frontera es cara de revertir: ciérrala antes de construir sobre ella.

## 3. Núcleo puro, efectos en los bordes

- La lógica de dominio no conoce HTTP, base de datos, reloj ni red.
- El I/O vive en adaptadores y en el arranque del proceso.
- El arranque es el único lugar que posee el ciclo de vida y el reloj.

Un núcleo puro hace que cada ciclo de aprendizaje sea barato y determinista.

## 4. Superficies aditivas por defecto; rupturas explícitas

- Las superficies públicas (contratos de API, CORS, códigos de error) son aditivas.
- Las superficies internas pueden romperse, pero la ruptura se hace explícita, versionada o migrada, y se registra.
- En 0→1 romper es válido; romper por accidente, no.

## 5. Simetría para infraestructura, divergencia para producto

- La infraestructura mantiene contratos simétricos y predecibles: un Worker por frontend, una configuración por frontera, un patrón de despliegue.
- Los experimentos de producto pueden divergir; consolida un patrón solo cuando se repita.
- No fuerces simetría sobre hipótesis de producto que todavía no se han validado.
