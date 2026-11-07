import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  cartTotal,
  formatPriceCents,
  type CartRequestSummary,
  type InvitationSummary,
  type ItemSummary,
  type SessionSummary,
} from '@mudanzapp/shared';

import { ItemPhotoComponent } from '../../items/item-photo.component';
import { itemStatusClasses, itemStatusLabel } from '../../items/item-status';
import { SessionStore } from '../../session/session.store';
import { SHOP_BASE_URL } from '../../shop-base-url.token';
import { uiButtonClasses } from '../../ui/ui-button/ui-button';
import { UiCardComponent } from '../../ui/ui-card/ui-card';
import { EventItemsStore } from '../event-items.store';
import { eventPublicUrl } from '../event-public-url';
import { CartRequestsStore } from './cart-requests.store';
import { DashboardStore } from './dashboard.store';
import { EventContactComponent } from './event-contact.component';

/** Identificador de cada sección del panel (corte D11). */
export type DashboardTabId = 'articulos' | 'solicitudes' | 'invitaciones' | 'dispositivos';

/** Una pestaña del panel: el rótulo lo declara la pantalla, no una lista que llega del borde. */
interface DashboardTab {
  readonly id: DashboardTabId;
  readonly label: string;
}

/** Base de la tira de pestañas: la activa y la inactiva solo cambian de color. */
const TAB_CLASSES = 'rounded-full px-3 py-1 text-sm font-medium';

/**
 * Pantalla de administración del evento (ciclos 4c-2 y 4c-3, decisión §37; cortes D8 y D10).
 *
 * Desde D10 vive en `/cuenta/evento`, como ruta hija de la Cuenta: el panel deja de ser una ruta
 * hermana y la Cuenta es la que enlaza y la que enseña el rechazo. La guarda sigue preguntando al
 * borde y el contenido no cambia.
 *
 * Muestra el hecho que el borde autorizó: quién administra, el enlace público, el contador de capturas,
 * los co-dispositivos con su acceso y los enlaces que el evento emitió. Los contadores **no** se piden
 * aquí: salen del mismo recurso de artículos que pinta `Capturados`, así que publicar recarga una sola
 * vez y las dos pantallas ven el mismo número.
 *
 * Desde 4c-4 la sección `Capturas` ofrece `Eliminar` con confirmación en dos toques. Eliminar es
 * irreversible y distinto de `Despublicar` (F3): destruye la captura, su enlace y su presencia en las
 * selecciones de los compradores, mientras que despublicar la oculta y la conserva. Un artículo vendido
 * no se borra: el borde responde `item_sold` y la pantalla lo explica, porque la venta es la evidencia
 * (§40).
 *
 * Desde D11 el panel se lee por secciones: `Artículos`, `Solicitudes`, `Invitaciones` y
 * `Otros dispositivos`, en ese orden y con `Artículos` abierta por defecto. La configuración del
 * evento —trayecto, enlace público, quién administra y WhatsApp— queda fija arriba, porque no es una
 * lista. La pestaña vive en memoria: la URL sigue siendo `/cuenta/evento` y recargar vuelve a
 * `Artículos`.
 *
 * Lo que esta pantalla no hace también declara el corte: no edita el evento y no reemite un enlace
 * cancelado.
 */
@Component({
  selector: 'app-dashboard',
  imports: [EventContactComponent, ItemPhotoComponent, UiCardComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El panel no tiene push ni proveedor externo: al volver a la pestaña se releen las solicitudes,
  // que es el aviso del vendedor (decisión §38: refresco al enfocar y recarga manual).
  host: { '(window:focus)': 'reloadRequests()' },
})
export class DashboardComponent {
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);

  protected readonly store = inject(DashboardStore);

  /** Las solicitudes de carrito del evento (ciclo 4e), con su propia lectura. */
  protected readonly requests = inject(CartRequestsStore);

  /** El recurso de artículos es de la aplicación: de ahí sale el contador. */
  protected readonly items = inject(EventItemsStore);

  /** Evento activo de la sesión; la guarda ya esperó a que la identidad resolviera. */
  private readonly eventId = this.items.eventId;

  constructor() {
    effect(() => {
      const eventId = this.eventId();
      if (eventId.length > 0) {
        this.requests.load(eventId);
      }
    });
  }

  protected readonly dangerClasses = uiButtonClasses('danger');

  /**
   * Las cuatro secciones del panel, en el orden que fijó el dueño (corte D11). `Artículos` abre por
   * defecto porque es la lista que se mira primero al entrar a administrar.
   */
  protected readonly tabs: readonly DashboardTab[] = [
    { id: 'articulos', label: 'Artículos' },
    { id: 'solicitudes', label: 'Solicitudes' },
    { id: 'invitaciones', label: 'Invitaciones' },
    { id: 'dispositivos', label: 'Otros dispositivos' },
  ];

  /**
   * Pestaña abierta. Vive en memoria: la URL sigue siendo `/cuenta/evento` y recargar vuelve a
   * `Artículos`. Una ruta por pestaña se reabre cuando D1 pagine cada lista con su propio cursor.
   */
  protected readonly activeTab = signal<DashboardTabId>('articulos');

  protected isActiveTab(tab: DashboardTabId): boolean {
    return this.activeTab() === tab;
  }

  /** Solo la pestaña activa entra en el orden de tabulación; las demás se alcanzan con flechas. */
  protected tabIndex(tab: DashboardTabId): number {
    return this.isActiveTab(tab) ? 0 : -1;
  }

  protected tabClasses(tab: DashboardTabId): string {
    return this.isActiveTab(tab)
      ? `${TAB_CLASSES} bg-slate-900 text-white`
      : `${TAB_CLASSES} bg-slate-100 text-slate-700`;
  }

  protected selectTab(tab: DashboardTabId): void {
    this.activeTab.set(tab);
  }

  /**
   * Flechas, `Home` y `End` mueven la pestaña activa y el foco, que es lo que una tira de pestañas
   * promete al lector de pantalla. El foco va al botón hermano, no al panel.
   */
  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const next = this.nextTabIndex(event.key, index);
    if (next === null) {
      return;
    }

    event.preventDefault();
    const tab = this.tabs[next];
    if (tab === undefined) {
      return;
    }

    this.activeTab.set(tab.id);
    const list = (event.currentTarget as HTMLElement | null)?.parentElement ?? null;
    list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  private nextTabIndex(key: string, index: number): number | null {
    const last = this.tabs.length - 1;
    if (key === 'Home') {
      return 0;
    }

    if (key === 'End') {
      return last;
    }

    if (key === 'ArrowRight') {
      return index === last ? 0 : index + 1;
    }

    if (key === 'ArrowLeft') {
      return index === 0 ? last : index - 1;
    }

    return null;
  }

  /** Solicitud cuyo botón `Descartar` ya se pulsó una vez y espera la confirmación. */
  protected readonly confirmingDismissId = signal<string | null>(null);

  protected readonly event = computed(() => this.session.eventById(this.eventId()));

  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : eventPublicUrl(event.publicSlug, this.shopBaseUrl);
  });

  /** Estado visible del artículo y su color: la misma regla que `Capturados`. */
  protected readonly statusLabel = itemStatusLabel;
  protected readonly statusClasses = itemStatusClasses;

  /** Sesión cuyo botón ya se pulsó una vez y espera la confirmación. */
  protected readonly confirmingRevokeId = signal<string | null>(null);

  /** Enlace cuyo botón ya se pulsó una vez y espera la confirmación. */
  protected readonly confirmingCancelId = signal<string | null>(null);

  /** Artículo cuyo botón `Eliminar` ya se pulsó una vez y espera la confirmación. */
  protected readonly confirmingDeleteId = signal<string | null>(null);

  protected deviceLabel(device: SessionSummary): string {
    return device.deviceLabel ?? 'Dispositivo sin nombre';
  }

  protected deviceState(device: SessionSummary): string {
    return device.revokedAt === null ? 'con acceso' : 'sin acceso';
  }

  protected deviceStateClasses(device: SessionSummary): string {
    return device.revokedAt === null
      ? 'bg-emerald-100 text-emerald-900'
      : 'bg-slate-200 text-slate-700';
  }

  /**
   * Solo el día. El panel no necesita horas y la cadena ISO ya es estable: formatear con `Intl` haría
   * que el mismo instante se viera distinto según el navegador, para un dato que nadie compara.
   */
  protected day(iso: string): string {
    return iso.slice(0, 10);
  }

  protected lastSeen(device: SessionSummary): string {
    return device.lastSeenAt === null ? 'sin uso' : `último uso ${this.day(device.lastSeenAt)}`;
  }

  /**
   * Des-invitar no tiene vuelta atrás desde la interfaz, así que el primer toque arma la confirmación y
   * el segundo la ejecuta. Un toque en otra fila desarma la anterior.
   */
  protected confirmRevoke(device: SessionSummary): void {
    if (this.confirmingRevokeId() === device.id) {
      this.confirmingRevokeId.set(null);
      void this.store.revoke(this.eventId(), device);
      return;
    }

    this.confirmingRevokeId.set(device.id);
  }

  /**
   * El nombre humano del enlace (corte 4c-fix). Lo decide el servidor y viaja en el contrato; el panel
   * solo lo pinta. `null` solo aparece en una fila anterior a la migración `012`.
   */
  protected invitationName(invitation: InvitationSummary): string {
    return invitation.label ?? 'Sin etiqueta';
  }

  /** Los 8 primeros caracteres del `id`, para encontrar la fila en la base al depurar. */
  protected invitationReference(invitation: InvitationSummary): string {
    return invitation.id.slice(0, 8);
  }

  /**
   * Emisión con fecha **y hora** UTC: solo la fecha no distingue dos filas cuando el anillo repitió
   * palabra. La hora se corta de la cadena ISO para que el mismo instante se vea igual en cualquier
   * navegador, que es lo que hizo el panel desde 4c-3.
   */
  protected issuedAt(invitation: InvitationSummary): string {
    return `${invitation.createdAt.slice(0, 10)} ${invitation.createdAt.slice(11, 16)} UTC`;
  }

  /** Emisión, vencimiento y canjes en una sola frase: la fila no depende del formato del template. */
  protected invitationDetail(invitation: InvitationSummary): string {
    return `${this.issuedAt(invitation)} · vence ${this.day(invitation.expiresAt)} · ${this.uses(invitation)}`;
  }

  protected invitationState(invitation: InvitationSummary): string {
    return invitation.revokedAt === null ? 'activo' : 'cancelado';
  }

  protected invitationStateClasses(invitation: InvitationSummary): string {
    return invitation.revokedAt === null
      ? 'bg-emerald-100 text-emerald-900'
      : 'bg-slate-200 text-slate-700';
  }

  /** Cuántas entradas admitió ya. El máximo es del borde y no se repite aquí. */
  protected uses(invitation: InvitationSummary): string {
    return invitation.useCount === 1 ? '1 canje' : `${String(invitation.useCount)} canjes`;
  }

  /** Cancelar tampoco tiene vuelta atrás desde la interfaz: los mismos dos toques. */
  protected confirmCancel(invitation: InvitationSummary): void {
    if (this.confirmingCancelId() === invitation.id) {
      this.confirmingCancelId.set(null);
      void this.store.cancel(this.eventId(), invitation);
      return;
    }

    this.confirmingCancelId.set(invitation.id);
  }

  /**
   * El borrado tampoco tiene vuelta atrás desde la interfaz (§12), así que se confirma en dos toques.
   * Al borrar se recarga el recurso compartido de artículos: `Capturados` y el contador ya no pueden
   * seguir leyendo la fila que el borde retiró.
   */
  protected confirmDelete(item: ItemSummary): void {
    if (this.confirmingDeleteId() === item.id) {
      this.confirmingDeleteId.set(null);
      void this.remove(item);
      return;
    }

    this.confirmingDeleteId.set(item.id);
  }

  private async remove(item: ItemSummary): Promise<void> {
    if (await this.store.remove(this.eventId(), item)) {
      this.items.reload();
    }
  }

  /** Recarga de las solicitudes; la dispara el foco de la ventana (`host`). */
  protected reloadRequests(): void {
    this.requests.reload();
  }

  /** `pendiente`, `atendida` o `cancelada`: el estado es el que el borde escribió, no uno deducido. */
  protected requestState(request: CartRequestSummary): string {
    if (request.cancelledAt !== null) {
      return 'cancelada';
    }

    return request.dismissedAt === null ? 'pendiente' : 'atendida';
  }

  protected requestStateClasses(request: CartRequestSummary): string {
    if (request.cancelledAt !== null) {
      return 'bg-slate-200 text-slate-700';
    }

    return request.dismissedAt === null
      ? 'bg-amber-100 text-amber-900'
      : 'bg-emerald-100 text-emerald-900';
  }

  /** Quién pidió, cuántos artículos y cuándo: el renglón del aviso del vendedor. */
  protected requestDetail(request: CartRequestSummary): string {
    const items = request.itemCount === 1 ? '1 artículo' : `${String(request.itemCount)} artículos`;
    return `${request.buyerName} · ${items} · ${this.day(request.requestedAt)}`;
  }

  /** La instantánea del pedido, con la moneda del evento (decisión §35). */
  protected requestItemsLabel(request: CartRequestSummary): string {
    const currency = this.event()?.currency ?? 'MXN';
    return request.items
      .map((item) => `${item.title} — ${formatPriceCents(item.priceCents, currency)}`)
      .join(' · ');
  }

  /**
   * El importe congelado que la solicitud guardó al pedir (ciclo B1).
   *
   * Durante un despliegue no atómico el borde anterior a B1 todavía no publica `totalCents`. En vez
   * de pintar `NaN`, la suma se deriva de la misma instantánea con `cartTotal`, la regla única del
   * cálculo; cuando el borde nuevo responde, manda el valor publicado.
   */
  protected requestTotalLabel(request: CartRequestSummary): string {
    const currency = this.event()?.currency ?? 'MXN';
    const published: unknown = request.totalCents;
    const total =
      typeof published === 'number' && Number.isFinite(published)
        ? published
        : cartTotal(request.items);

    return `Total ${formatPriceCents(total, currency)}`;
  }

  /** Descartar es el acto del vendedor y se confirma en dos toques, como los demás del panel. */
  protected confirmDismiss(request: CartRequestSummary): void {
    if (this.confirmingDismissId() === request.id) {
      this.confirmingDismissId.set(null);
      void this.requests.dismiss(request);
      return;
    }

    this.confirmingDismissId.set(request.id);
  }
}
