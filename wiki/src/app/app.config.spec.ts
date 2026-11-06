import { TestBed } from '@angular/core/testing';
import { PreloadAllModules, PreloadingStrategy } from '@angular/router';

import { appConfig } from './app.config';

describe('appConfig', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('preloads the built tiles with PreloadAllModules', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });

    expect(TestBed.inject(PreloadingStrategy)).toBeInstanceOf(PreloadAllModules);
  });
});
