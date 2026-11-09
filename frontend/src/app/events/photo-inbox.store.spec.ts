import { TestBed } from '@angular/core/testing';

import { PhotoInboxStore } from './photo-inbox.store';

describe('PhotoInboxStore', () => {
  function inbox(): PhotoInboxStore {
    return TestBed.inject(PhotoInboxStore);
  }

  it('delivers the staged photo only once', () => {
    const store = inbox();
    const file = new File(['foto'], 'foto.png', { type: 'image/png' });

    store.stage(file);

    expect(store.take()).toBe(file);
    expect(store.take()).toBeNull();
  });

  it('keeps the most recent photo in a single slot', () => {
    const store = inbox();
    const first = new File(['uno'], 'uno.png', { type: 'image/png' });
    const second = new File(['dos'], 'dos.png', { type: 'image/png' });

    store.stage(first);
    store.stage(second);

    expect(store.take()).toBe(second);
  });

  it('clears the slot without delivering when the session ends', () => {
    const store = inbox();
    store.stage(new File(['foto'], 'foto.png', { type: 'image/png' }));

    store.clear();

    expect(store.take()).toBeNull();
  });
});
