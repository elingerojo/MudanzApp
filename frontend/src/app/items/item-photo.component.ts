import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Miniatura de la foto de un artículo.
 *
 * La foto se pide con la sesión del dispositivo, porque en este corte no existe URL pública
 * (`decisiones` §26). Por eso se guarda como `blob` y se pinta desde un object URL que se revoca al
 * destruir: el token no se convierte en un `src`, que acabaría en el historial y en los registros del
 * proxy.
 *
 * `NgOptimizedImage` no aplica aquí: optimiza rutas estáticas conocidas en build, no blobs
 * autenticados. La excepción se retira en `publish`, cuando la foto tenga URL pública.
 */
@Component({
  selector: 'app-item-photo',
  templateUrl: './item-photo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemPhotoComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  readonly photoId = input.required<string>();

  protected readonly source = signal<string | null>(null);

  private objectUrl: string | null = null;

  constructor() {
    effect(() => {
      const photoId = this.photoId();
      void this.load(photoId);
    });
  }

  ngOnDestroy(): void {
    this.replace(null);
  }

  private async load(photoId: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.apiBaseUrl}/photos/${photoId}`, { responseType: 'blob' }),
      );
      this.replace(URL.createObjectURL(blob));
    } catch {
      // Una foto ilegible no rompe la lista: la fila conserva su texto y muestra el hueco.
      this.replace(null);
    }
  }

  private replace(url: string | null): void {
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = url;
    this.source.set(url);
  }
}
