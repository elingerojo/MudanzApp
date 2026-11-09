import { TestBed } from '@angular/core/testing';

import { PhotoInboxStore } from './photo-inbox.store';

describe('PhotoInboxStore', () => {
  function inbox(): PhotoInboxStore {
    return TestBed.inject(PhotoInboxStore);
  }

  it('starts without a capture session', () => {
    expect(inbox().hasPhoto()).toBe(false);
    expect(inbox().peek()).toBeNull();
  });

  it('keeps the photo until the capture is cleared', () => {
    const store = inbox();
    const file = new File(['foto'], 'foto.png', { type: 'image/png' });

    store.stage(file);

    expect(store.hasPhoto()).toBe(true);
    // Leer no consume: volver al panel reutiliza la misma foto.
    expect(store.peek()).toBe(file);
    expect(store.peek()).toBe(file);

    store.clear();

    expect(store.hasPhoto()).toBe(false);
    expect(store.peek()).toBeNull();
  });

  it('replaces the photo when the capture is retaken', () => {
    const store = inbox();
    const first = new File(['uno'], 'uno.png', { type: 'image/png' });
    const second = new File(['dos'], 'dos.png', { type: 'image/png' });

    store.stage(first);
    store.stage(second);

    expect(store.peek()).toBe(second);
    expect(store.hasPhoto()).toBe(true);
  });
});
