import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { ITEM_PHOTO_CONTENT_TYPES, brand } from '@mudanzapp/shared';
import { filter, map } from 'rxjs';

import { PhotoInboxStore } from './events/photo-inbox.store';
import { SessionStore } from './session/session.store';

/** Los destinos enlazables de la barra; solo ellos llevan `aria-current`. */
type SectionId = 'captura' | 'capturados' | 'cuenta';

/** Una posición de la barra. `Foto` y `Ayuda` no son destinos: no tienen `path` ni `section`. */
interface NavItem {
  readonly section: SectionId | null;
  readonly path: string | null;
  readonly label: string;
  readonly testId: string;
  /** Glifo decorativo: la etiqueta es el nombre visible y accesible. */
  readonly icon: string | null;
  /** La posición central: abre la cámara, no navega. */
  readonly photo?: boolean;
  /** El hueco inerte: sostiene la simetría y no es enlace ni funcionalidad. */
  readonly help?: boolean;
}

/**
 * La barra es una lista **fija** de cinco posiciones (cortes D8 y D12): `Captura`, `Capturados`,
 * `Foto`, `Ayuda` y `Cuenta`. No se deriva de la sesión ni del número de eventos: agregar una
 * sección es agregar una entrada aquí y su ruta en `app.routes.ts`.
 *
 * `Foto` no es un destino ni una ruta: es el acto de abrir la cámara desde cualquier pantalla
 * privada. `Ayuda` solo insinúa una ayuda futura.
 */
const NAV_ITEMS: readonly NavItem[] = [
  {
    section: 'captura',
    path: '/captura',
    label: 'Captura',
    testId: 'shell-nav-capture',
    icon: '📷',
  },
  {
    section: 'capturados',
    path: '/capturados',
    label: 'Capturados',
    testId: 'shell-nav-captured',
    icon: '📦',
  },
  {
    section: null,
    path: null,
    label: 'Foto',
    testId: 'shell-nav-photo',
    icon: '📸',
    photo: true,
  },
  {
    section: null,
    path: null,
    label: 'Ayuda',
    testId: 'shell-nav-help',
    icon: null,
    help: true,
  },
  {
    section: 'cuenta',
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
 * acto de la cuenta, no un cuarto destino. `Foto` y `Ayuda` nunca se marcan.
 */
function sectionOf(url: string): SectionId | null {
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
 * credencial. Desde D12 la shell también tiene el input de cámara: vive aquí, una sola vez, y entrega
 * la foto al panel de captura por `PhotoInboxStore`.
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
  private readonly inbox = inject(PhotoInboxStore);

  protected readonly hasSession = this.session.hasSession;
  protected readonly items = NAV_ITEMS;
  protected readonly showNavigation = this.hasSession;
  protected readonly cameraAccept = ITEM_PHOTO_CONTENT_TYPES.join(',');

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

    // Una foto no sobrevive a un cambio de cuenta: al cerrar la sesión la barra desaparece y el
    // buzón se vacía sin entregar nada.
    effect(() => {
      if (!this.hasSession()) {
        this.inbox.clear();
      }
    });
  }

  /** `Foto` no navega por sí solo: dispara el input de cámara oculto de la shell. */
  protected openCamera(input: HTMLInputElement): void {
    input.value = '';
    input.click();
  }

  /**
   * Cancelar la cámara no dispara `change`, así que no navega. Con archivo, la foto queda en el
   * buzón y se abre el panel de captura; el buzón la entrega aunque la guarda de D2 desvíe a
   * `/eventos` y el panel se monte más tarde.
   */
  protected onCameraFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    input.value = '';

    if (file === undefined) {
      return;
    }

    this.inbox.stage(file);
    void this.router.navigateByUrl('/captura');
  }
}
