import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { LoginComponent } from './login/login.component';
import { MainPageComponent } from './main-page/main-page.component';
import { DatePipe } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule} from '@angular/material/form-field';
import { MatExpansionModule} from '@angular/material/expansion';
import { MatInputModule} from '@angular/material/input';
import { MatCheckboxModule} from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table'  
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatBadgeModule} from '@angular/material/badge';

import { TableVirtualScrollModule } from 'ng-table-virtual-scroll';
import { ResizeColumnDirective } from './directives/resize-column.directive';
import { YesnoDialogComponent } from './yesno-dialog/yesno-dialog.component';

@NgModule({
  schemas: [ CUSTOM_ELEMENTS_SCHEMA ],
  declarations: [
    AppComponent,
    LoginComponent,
    MainPageComponent,
    ResizeColumnDirective,
    YesnoDialogComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatButtonModule,
    MatBadgeModule,
    MatDialogModule,
    MatFormFieldModule,
    MatExpansionModule,
    MatInputModule,
    MatCheckboxModule,
    MatTableModule,
    ScrollingModule,
    TableVirtualScrollModule,
    MatToolbarModule
  ],
  providers: [
    DatePipe
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
