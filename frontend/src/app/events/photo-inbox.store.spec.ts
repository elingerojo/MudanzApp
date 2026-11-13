import { TestBed } from '@angular/core/testing';
import { CAPTURE_LIMITS } from '@mudanzapp/shared';

import { PhotoInboxStore } from './photo-inbox.store';

function photo(name: string): File {
  return new File([name], name, { type: 'image/png' });
}

describe('PhotoInboxStore', () => {
  function inbox(): PhotoInboxStore {
    return TestBed.inject(PhotoInboxStore);
  }

  it('starts without a capture session', () => {
    expect(inbox().hasPhoto()).toBe(false);
    expect(inbox().peek()).toEqual([]);
  });

  it('keeps the photos in capture order until the capture is cleared', () => {
    const store = inbox();
    const first = photo('uno.png');
    const second = photo('dos.png');

    store.addFiles([first, second]);

    expect(store.count()).toBe(2);
    expect(store.hasPhoto()).toBe(true);
    expect(store.cover()).toBe(first);
    // Leer no consume: volver al panel reutiliza la misma tira.
    expect(store.peek()).toEqual([first, second]);
    expect(store.peek()).toEqual([first, second]);

    store.clear();

    expect(store.hasPhoto()).toBe(false);
    expect(store.peek()).toEqual([]);
  });

  it('moves a photo one position and stops at the ends', () => {
    const store = inbox();
    const first = photo('uno.png');
    const second = photo('dos.png');
    const third = photo('tres.png');

    store.addFiles([first, second, third]);

    store.move(0, 1);
    expect(store.peek()).toEqual([second, first, third]);

    store.move(0, -1);
    expect(store.peek()).toEqual([second, first, third]);

    store.move(2, 1);
    expect(store.peek()).toEqual([second, first, third]);

    store.move(2, -1);
    expect(store.peek()).toEqual([second, third, first]);
    expect(store.cover()).toBe(second);
  });

  it('caps the gallery at the application limit', () => {
    const store = inbox();
    const files = Array.from({ length: CAPTURE_LIMITS.photos + 2 }, (_, index) =>
      photo(`foto-${String(index)}.png`),
    );

    store.addFiles(files);

    expect(store.count()).toBe(CAPTURE_LIMITS.photos);
    expect(store.full()).toBe(true);
  });

  it('removes a rejected photo without touching the rest of the strip', () => {
    const store = inbox();
    const first = photo('uno.png');
    const rejected = photo('anim.gif');
    const third = photo('tres.png');

    store.addFiles([first, rejected, third]);
    store.remove(rejected);

    expect(store.peek()).toEqual([first, third]);
  });
});
