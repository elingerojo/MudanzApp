import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  cartRequestAvailableTotal,
  cartRequestHasChanges,
  cartRequestItemAmount,
  formatPriceCents,
  type CartRequestItem,
  type CartRequestItemState,
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

  /** La moneda del evento, con la misma regla de formato que el precio por artículo (§35). */
  private currency(): string {
    return this.event()?.currency ?? 'MXN';
  }

  /**
   * El importe congelado que la solicitud guardó al pedir (ciclo B1).
   *
   * Un borde anterior a B1 no publica `totalCents`. La pantalla no deriva el importe en silencio: si
   * el campo no llega como número finito, dice «Total no disponible» y no pinta `NaN`; cuando el borde
   * nuevo responde, manda el valor publicado. Desde B10 el registro publica aparte el importe
   * **vigente**: son dos hechos distintos y cada uno conserva su nombre.
   */
  protected requestTotalLabel(request: CartRequestSummary): string {
    const published: unknown = request.totalCents;
    if (typeof published !== 'number' || !Number.isFinite(published)) {
      return 'Total no disponible';
    }

    return `Total ${formatPriceCents(published, this.currency())}`;
  }

  /**
   * B10: los renglones que el registro puede leer, o `null` cuando el borde es anterior a B8 y algún
   * artículo no publica `state`. Un estado ausente no es `current`: sin estados conocidos la pantalla
   * conserva el renglón de 4e y no pinta importes en cero.
   */
  protected recordItems(request: CartRequestSummary): readonly CartRequestItem[] | null {
    const published: unknown = request.items;
    if (!Array.isArray(published)) {
      return null;
    }

    const items = published as readonly CartRequestItem[];
    return items.every((item) => this.isKnownState(item.state)) ? items : null;
  }

  private isKnownState(state: unknown): state is CartRequestItemState {
    return (
      state === 'current' ||
      state === 'unpublished' ||
      state === 'sold' ||
      state === 'deleted' ||
      state === 'price_changed'
    );
  }

  /** El conteo de renglones del registro, con el mismo texto que la lista del comprador. */
  protected requestRecordCountLabel(request: CartRequestSummary): string {
    const count = this.recordItems(request)?.length ?? 0;
    return count === 1 ? '1 artículo' : `${String(count)} artículos`;
  }

  /** El importe vigente del registro: la derivación de B9, nunca una suma escrita a mano aquí. */
  protected requestAvailableTotalLabel(request: CartRequestSummary): string {
    const items = this.recordItems(request);
    return formatPriceCents(items === null ? 0 : cartRequestAvailableTotal(items), this.currency());
  }

  /** El importe vigente de un renglón: `0` si ya no está disponible, el de hoy si cambió. */
  protected requestItemAmountLabel(item: CartRequestItem): string {
    return formatPriceCents(cartRequestItemAmount(item), this.currency());
  }

  /** El precio que se pidió: la instantánea, que no se reescribe. */
  protected requestItemSnapshotLabel(item: CartRequestItem): string {
    return formatPriceCents(item.priceCents, this.currency());
  }

  /** Un precio cambiado y vacío no se puede comprar; el renglón lo dice en vez de pintar `NaN`. */
  protected requestItemPriceNote(item: CartRequestItem): string | null {
    return item.state === 'price_changed' && item.currentPriceCents === null
      ? 'Sin precio actualmente'
      : null;
  }

  /**
   * B10: la nota de precio se enciende solo con `price_changed`, no con cualquier cambio. Un borde
   * anterior a B8 no la enciende por accidente.
   */
  protected requestHasPriceChange(request: CartRequestSummary): boolean {
    return this.recordItems(request)?.some((item) => item.state === 'price_changed') ?? false;
  }

  /** La pastilla del registro: el texto nombra el estado; el color solo acompaña. */
  protected requestItemStateLabel(item: CartRequestItem): string {
    switch (item.state) {
      case 'unpublished':
        return 'Despublicado';
      case 'sold':
        return 'Vendido';
      case 'deleted':
        return 'Eliminado';
      case 'price_changed':
        return 'Precio cambiado';
      default:
        return 'Vigente';
    }
  }

  protected requestItemStateClasses(item: CartRequestItem): string {
    if (item.state === 'current') {
      return 'bg-emerald-100 text-emerald-900';
    }

    return item.state === 'price_changed'
      ? 'bg-amber-100 text-amber-900'
      : 'bg-slate-200 text-slate-700';
  }

  /**
   * B8: un estado conocido distinto de `current` es el único que marca el aviso de la solicitud. Un
   * borde anterior a B8 no publica `state` ni `hasChanges`, y `undefined` **no** es un cambio.
   */
  private isChangedState(state: unknown): boolean {
    return this.isKnownState(state) && state !== 'current';
  }

  /** Hay aviso si el borde lo publica o si los renglones conocidos lo confirman (B8/B10). */
  protected requestHasChanges(request: CartRequestSummary): boolean {
    if (request.hasChanges === true) {
      return true;
    }

    const items = this.recordItems(request);
    return items === null ? false : cartRequestHasChanges(items);
  }

  /** Los artículos de la instantánea que ya no coinciden con el catálogo, con su causa. */
  protected changedRequestItems(
    request: CartRequestSummary,
  ): readonly { readonly title: string; readonly label: string }[] {
    return request.items
      .filter((item) => this.isChangedState(item.state))
      .map((item) => ({ title: item.title, label: this.requestChangedItemLabel(item) }));
  }

  /** La causa de un artículo cambiado; `price_changed` publica el precio de hoy, no el congelado. */
  protected requestChangedItemLabel(item: CartRequestItem): string {
    switch (item.state) {
      case 'unpublished':
        return 'Despublicado después de la solicitud';
      case 'sold':
        return 'Vendido después de la solicitud';
      case 'deleted':
        return 'Eliminado después de la solicitud';
      case 'price_changed': {
        const current = item.currentPriceCents;
        return typeof current === 'number' && Number.isFinite(current)
          ? `Precio actual: ${formatPriceCents(current, this.currency())}`
          : 'Sin precio actualmente';
      }
      default:
        return '';
    }
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
