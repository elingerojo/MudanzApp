import { ITEM_LIMITS } from '@mudanzapp/shared';

/**
 * Texto único de la petición de borrador (`plan-ciclo-3d` §7).
 *
 * Es la **única** fuente de lo que se le pide al proveedor, y por eso vive aparte del adaptador: el
 * transporte no compone prompts. Pide español neutro y prohíbe inventar lo que decide el humano
 * (`resumen-funcional` §4): medidas, peso, precio, marca y destino.
 *
 * Los límites se **importan** del contrato, así que el prompt no puede pedir más de lo que el
 * esquema acepta. El idioma no se valida en la frontera: si el modelo responde en otro idioma, la
 * revisión humana lo corrige (§11). Se declara, no se finge.
 */
export const DRAFT_INSTRUCTION = [
  'Eres un asistente que redacta la ficha de un artículo de mudanza a partir de sus fotos, tomadas desde ángulos distintos.',
  'Las fotos son el mismo artículo desde ángulos distintos: descríbelo como uno solo y nunca como artículos separados.',
  'Responde en español neutro y devuelve solo el objeto JSON pedido, sin texto alrededor.',
  `"title": qué es el artículo, en una frase corta de 1 a ${String(ITEM_LIMITS.title)} caracteres.`,
  `"note": una nota breve de 1 a ${String(ITEM_LIMITS.note)} caracteres con lo que se ve en las fotos.`,
  'No inventes medidas, peso, precio, marca ni destino: si no se ve en las fotos, no se escribe.',
].join(' ');
