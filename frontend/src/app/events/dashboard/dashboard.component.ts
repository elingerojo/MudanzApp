import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { InvitationSummary, ItemSummary, SessionSummary } from '@mudanzapp/shared';

import { ItemPhotoComponent } from '../../items/item-photo.component';
import { itemStatusClasses, itemStatusLabel } from '../../items/item-status';
import { SessionStore } from '../../session/session.store';
import { SHOP_BASE_URL } from '../../shop-base-url.token';
import { uiButtonClasses } from '../../ui/ui-button/ui-button';
import { UiCardComponent } from '../../ui/ui-card/ui-card';
import { EventItemsStore } from '../event-items.store';
import { eventPublicUrl } from '../event-public-url';
import { DashboardStore } from './dashboard.store';

/**
 * Pestaña `Dashboard` del marco del evento (ciclos 4c-2 y 4c-3, decisión §37).
 *
 * Muestra el hecho que el borde autorizó: quién administra, el enlace público, el contador de capturas,
 * los co-dispositivos con su acceso y los enlaces que el evento emitió. Los contadores **no** se piden
 * aquí: salen del mismo recurso de artículos que pinta `Capturados`, así que publicar recarga una sola
 * vez y las dos pestañas ven el mismo número.
 *
 * Desde 4c-4 la sección `Capturas` ofrece `Eliminar` con confirmación en dos toques. Un artículo vendido
 * no se borra: el borde responde `item_sold` y la pantalla lo explica, porque la venta es la evidencia
 * (§40).
 *
 * Lo que esta pantalla no hace también declara el corte: no edita el evento y no reemite un enlace
 * cancelado.
 */
@Component({
  selector: 'app-dashboard',
  imports: [ItemPhotoComponent, UiCardComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);

  protected readonly store = inject(DashboardStore);

  /** El recurso de artículos lo posee el marco del evento: de ahí sale el contador. */
  protected readonly items = inject(EventItemsStore);

  private readonly eventId = this.items.eventId;

  protected readonly dangerClasses = uiButtonClasses('danger');

  protected readonly event = computed(() => this.session.eventById(this.eventId));

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
      void this.store.revoke(this.eventId, device);
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
      void this.store.cancel(this.eventId, invitation);
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
    if (await this.store.remove(this.eventId, item)) {
      this.items.reload();
    }
  }
}
