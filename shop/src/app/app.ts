import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterOutlet } from '@angular/router';
import { brand } from '@mudanzapp/shared';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
})
export class App {
  protected readonly appName = brand.publicName;

  private readonly title = inject(Title);

  constructor() {
    // La marca vive en `shared/src/brand.json`; el título del documento se deriva de ahí.
    this.title.setTitle(brand.publicName);
  }
}
