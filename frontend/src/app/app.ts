import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { brand } from '@mudanzapp/shared';
import { filter, map } from 'rxjs';

import { SessionStore } from './session/session.store';

/** Una entrada de la navegación principal. */
interface Destination {
  readonly id: 'captura' | 'capturados' | 'cuenta';
  readonly path: string;
  readonly label: string;
  readonly testId: string;
  /** Glifo decorativo: la etiqueta es el nombre visible y accesible. */
  readonly icon: string;
}

/**
 * La barra es una lista **fija** de tres destinos raíz (corte D8). No se deriva de la sesión ni del
 * número de eventos: agregar una sección es agregar una entrada aquí y su ruta en `app.routes.ts`.
 */
const DESTINATIONS: readonly Destination[] = [
  {
    id: 'captura',
    path: '/captura',
    label: 'Captura',
    testId: 'shell-nav-capture',
    icon: '📷',
  },
  {
    id: 'capturados',
    path: '/capturados',
    label: 'Capturados',
    testId: 'shell-nav-captured',
    icon: '📦',
  },
  {
    id: 'cuenta',
    path: '/cuenta',
    label: 'Cuenta',
    testId: 'shell-nav-account',
    icon: '👤',
  },
];

/**
 * Qué destino de la barra corresponde a una URL. Las pantallas de detalle no son destinos, pero
 * conservan marcada la sección de la que salieron: `articulos/:itemId` es de Capturados y la
 * administración del evento —`/cuenta/evento`, desde D10— es de Cuenta, igual que el alias
 * `/dashboard`. El selector de mudanza (`/eventos`, corte D2) también es de Cuenta: elegir es un
 * acto de la cuenta, no un cuarto destino.
 */
function sectionOf(url: string): Destination['id'] | null {
  const path = url.split('?')[0]?.split('#')[0] ?? '';

  if (path === '/captura') {
    return 'captura';
  }

  if (path === '/capturados' || path.startsWith('/articulos')) {
    return 'capturados';
  }

  if (
    path === '/cuenta' ||
    path.startsWith('/cuenta/') ||
    path.startsWith('/dashboard') ||
    path === '/eventos'
  ) {
    return 'cuenta';
  }

  return null;
}

/**
 * Marco de la aplicación: cabecera persistente, barra inferior fija y contenedor del `router-outlet`.
 *
 * Vive en el componente raíz —siempre montado— y no en una pantalla, para que navegar no desmonte la
 * navegación ni el estado que refleja. La barra aparece con sesión y no en las pantallas públicas sin
 * credencial.
 */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly appName = brand.publicName;

  private readonly title = inject(Title);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly hasSession = this.session.hasSession;
  protected readonly destinations = DESTINATIONS;
  protected readonly showNavigation = this.hasSession;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activeSection = computed(() => sectionOf(this.currentUrl()));

  constructor() {
    // La marca vive en `shared/src/brand.json`; el título del documento se deriva de ahí.
    this.title.setTitle(brand.publicName);
  }
}
