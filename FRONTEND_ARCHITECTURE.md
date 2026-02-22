# 14FLY - Arquitectura Frontend (Angular 17+)

## 📋 Resumen Ejecutivo

**Aplicación:** Sistema de reservas de vuelos 14FLY  
**Framework:** Angular 17+ (Standalone Components)  
**Estilo:** Tailwind CSS + tema custom (amber-500, slate-900, degradados oscuros)  
**Estado:** JWT en LocalStorage, sin NgRx  
**Testing:** Jasmine/Karma (básico)  

---

## 🏗️ Estructura de Carpetas

```
web/src/app/
├── admin/                    # Componentes administrativos
│   ├── admin-report.component.ts/html      # Dashboard métricas admin
│   ├── admin-import-modal.component.ts/html # Modal carga masiva XML
│   └── seat-picker-modal.component.ts/html # Picker de asientos para admin
│
├── auth/                     # Autenticación y seguridad
│   ├── login/
│   │   ├── login.component.ts/html/scss
│   ├── register/
│   │   ├── register.component.ts/html/scss
│   ├── auth.service.ts       # Servicio autenticación (login/register/logout)
│   ├── auth.guard.ts         # Guard para rutas autenticadas
│   ├── admin.guard.ts        # Guard para rutas de admin
│   ├── guest.guard.ts        # Guard para rutas públicas (login/register)
│   ├── token.interceptor.ts  # HTTP interceptor para agregar JWT
│   ├── auth-error.interceptor.ts # Manejo de errores 401/403
│   └── index.ts              # Exports públicos
│
├── reservas/                 # Módulo de reservas (core del sistema)
│   ├── crear/
│   │   ├── crear.component.ts/html/scss    # Creación de reservas (mapa asientos)
│   ├── mis-reservas/
│   │   ├── mis-reservas.component.ts/html/scss # Gestión de reservas del usuario
│   ├── edit-modal/
│   │   ├── edit-reserva-modal.component.ts/html # Modal inline para editar reserva
│   ├── historial-auditoria.component.ts/html/scss # Vista de historial y auditoría
│   ├── reservas.service.ts   # API service para reservas
│   └── audit.service.ts      # API service para auditoría
│
├── me/                       # Perfil de usuario
│   ├── me.component.ts/html  # Página "Mi Perfil" con info VIP
│
├── shared/                   # Utilidades compartidas
│   ├── validators.ts         # Validadores (CUI, nombre, email, password)
│   └── pipes/
│       └── as-local-date.pipe.ts # Pipe para formatear fechas
│
├── ui/                       # Componentes de interfaz
│   └── toast/
│       ├── toast.service.ts        # Servicio reactive para notificaciones
│       └── toast-container.component.ts/html/scss # Contenedor de toasts
│
├── app.component.ts/html/scss # Root component (navbar + footer + router-outlet)
├── app.routes.ts             # Configuración de rutas
└── app.config.ts             # Providers globales (HTTP interceptors)
```

---

## 🛣️ Rutas de Navegación

| Ruta | Componente | Guards | Descripción |
|------|-----------|--------|-------------|
| `/` | Redirect → `/login` | - | Página inicial |
| `/login` | `LoginComponent` | `guestGuard` | Inicio de sesión |
| `/register` | `RegisterComponent` | `guestGuard` | Registro de usuario |
| `/reservas/crear` | `CrearComponent` | `authGuard` | Crear nuevas reservas (mapa de asientos) |
| `/reservas/mis-reservas` | `MisReservasComponent` | `authGuard` | Gestionar reservas activas (editar/cancelar) |
| `/reservas/historial` | `HistorialAuditoriaComponent` | `authGuard` | Historial de cancelaciones y auditoría |
| `/me` | `MeComponent` | `authGuard` | Perfil del usuario (VIP status) |
| `/admin/reportes` | `AdminReportComponent` | `authGuard` + `adminGuard` | Dashboard administrativo |
| `/**` | Redirect → `/login` | - | Fallback |

---

## 🎯 Componentes Principales

### 1. **AppComponent** (Root)
**Archivo:** `app.component.ts/html/scss`  
**Funcionalidad:**
- Navbar translúcida sticky con logo 14FLY
- Links contextuales según autenticación:
  - **No autenticado:** Login, Registrarse
  - **Autenticado:** Nueva reserva, Mis reservas, Historial, Mi perfil, Cerrar sesión
  - **Admin:** Menú desplegable (Descargar XML, Cargar XML, Reportes)
- Footer con copyright
- Contiene `<router-outlet>` para vistas
- Integra `<app-toast-container>` global
- Modal de admin para carga masiva de reservas XML
- Lógica de upload/download XML

**Estado:**
- `auth.isLoggedIn()`: Boolean
- `auth.isAdmin()`: Boolean
- `showAdminImport`: Boolean para modal
- `importSummary`: Resultado de carga XML

---

### 2. **LoginComponent**
**Archivo:** `auth/login/login.component.ts/html/scss`  
**Funcionalidad:**
- Formulario email + password
- Validación básica de formato email
- Llama `auth.login(credentials)` → guarda token → redirige a `/reservas/mis-reservas`
- Muestra toast de error si credenciales incorrectas

**Dependencias:**
- `AuthService`
- `ToastService`
- `Router`

---

### 3. **RegisterComponent**
**Archivo:** `auth/register/register.component.ts/html/scss`  
**Funcionalidad:**
- Formulario: nombre completo, email, password, CUI
- Validaciones:
  - Nombre: 3+ chars, solo letras y espacios
  - Email: formato válido + dominio permitido
  - Password: 8+ chars, mayúscula, minúscula, número, símbolo
  - CUI: 13 dígitos
- Llama `auth.register(payload)` → auto-login → redirige
- Muestra mensajes de error específicos por campo

**Dependencias:**
- `AuthService`
- `ToastService`
- `validators.ts`

---

### 4. **CrearComponent** (Reservar Asientos)
**Archivo:** `reservas/crear/crear.component.ts/html/scss`  
**Funcionalidad:**
#### Vista principal:
- Toggle entre **Business** (2 columnas) y **Económica** (5 columnas)
- Selector de cantidad (1 a N disponibles)
- **Mapa de asientos interactivo:**
  - Grid visual con filas (A-I) y columnas (1-7)
  - Colores: Verde (disponible), Gris oscuro (ocupado), Amber (seleccionado)
  - Click para seleccionar/deseleccionar
- **Modo aleatorio:** Modal para pedir cantidad → selecciona asientos random
- **Formulario de pasajeros:** Por cada asiento seleccionado → nombre completo, CUI, equipaje (checkbox)
- Navegación entre pasajeros con flechas (◀️ ▶️)
- Validación en tiempo real (campos obligatorios)
- Botón **Reservar:** Envía payload con array de seats + batch_id → backend

#### Flujo paso a paso (opcional):
- Puede reservar 1 a 1 con confirmación intermedia
- Genera batch_id único para agrupar reservas

#### Modal de confirmación:
- Muestra lista de reservas creadas con precio, descuento VIP, asiento
- Opción de editar in-line cada reserva
- Link a "Ver mis reservas"

**Estado:**
- `tipo`: 'business' | 'economy'
- `cantidad`: Número
- `seleccionados`: Array de { code, full_name, cui, has_bag }
- `mapa`: Datos de asientos desde `/api/seats/map`
- `loading`: Boolean
- Destacar asientos importados desde query param `?highlight=A1,B2`

**Dependencias:**
- `ReservasService` (getSeats, createReservation, getAllSeats)
- `ToastService`
- `Router`, `ActivatedRoute`

---

### 5. **MisReservasComponent** (Gestión de Reservas)
**Archivo:** `reservas/mis-reservas/mis-reservas.component.ts/html/scss`  
**Funcionalidad:**
#### Vista agrupada:
- Muestra reservas agrupadas por `batch_id`
- Cada grupo muestra:
  - Fecha de creación
  - Cantidad de asientos
  - Clases (Business/Económica)
  - Suma de precios base y totales
  - Lista expandible de reservas individuales
- Botones por reserva individual:
  - **Editar:** Abre modal para cambiar asiento, equipaje, datos pasajero
  - **Cancelar:** Modal de confirmación (input CUI) → soft delete
  - **Copiar:** Copia batch_id o CUI al portapapeles
- Botón por conjunto:
  - **Cancelar conjunto:** Modal (input "CANCELAR") → cancela batch completo

#### Modal de edición:
- Mapa de asientos disponibles (solo de la misma clase)
- Toggle equipaje
- Previsualización de precio con descuento VIP y fee 10%
- Desglose: base, fee acumulado, fee nuevo, descuento VIP, total
- Guardar → actualiza backend → refresca listado

#### Modal de cancelación individual:
- Valida CUI antes de confirmar
- Llama `deleteReservation(id)` → soft delete → refresca listado

#### Modal de cancelación batch:
- Requiere escribir "CANCELAR" exactamente
- Llama `cancelBatch({ batch_id })` → marca todas como eliminadas
- **Idempotencia:** Si ya fue cancelado, muestra mensaje sin error 404
- Siempre refresca listado tras confirm

**Estado:**
- `reservas`: Array de reservas activas
- `grupos`: Array de batches calculados
- `showEditModal`, `showCancelModal`, `showCancelBatchModal`: Booleans
- `editQuote`: Preview de precio al editar
- `isCancelling`: Loading state

**Dependencias:**
- `ReservasService` (getMyReservations, updateReservation, deleteReservation, cancelBatch, getAllSeats, quoteReservation)
- `ToastService`

**Mejoras recientes:**
- Cancelación idempotente (no lanza 404 si batch ya cancelado)
- Refresh automático tras cancelar
- Validación de grupos vacíos

---

### 6. **HistorialAuditoriaComponent**
**Archivo:** `reservas/historial-auditoria.component.ts/html/scss`  
**Funcionalidad:**
- **3 pestañas:**
  1. **Activas:** Lista de reservas no eliminadas (desde `getMyReservations`)
  2. **Canceladas:** Historial de cancelaciones con paginación (desde `audit.getCancellationHistory`)
  3. **Estadísticas:** Métricas agregadas (total cancelaciones, por tipo, etc.)
- Paginación manual (10 items/página)
- Botón para cancelar desde la vista de activas

**Estado:**
- `activeTab`: 'activas' | 'canceladas' | 'estadisticas'
- `reservasActivas`, `cancelaciones`, `stats`
- `currentPage`, `itemsPerPage`, `totalItems`

**Dependencias:**
- `AuditService` (getCancellationHistory, getCancellationStats)
- `ReservasService` (getMyReservations, deleteReservation)
- `AuthService`

---

### 7. **MeComponent** (Mi Perfil)
**Archivo:** `me/me.component.ts/html`  
**Funcionalidad:**
- Muestra datos del usuario:
  - Nombre completo, email, CUI, user_id
  - Estado VIP (badge si tiene 5+ reservas)
  - Cantidad de reservas activas
- Actividad extendida:
  - Total reservas, modificadas, canceladas
  - Método de selección (manual vs aleatorio)
- Link a "Ver mis reservas"

**Endpoints:**
- `GET /api/users/me` → perfil completo
- `GET /api/users/me/vip` → status VIP
- `GET /api/users/me/activity` → estadísticas de actividad

**Dependencias:**
- `AuthService`, `HttpClient`

---

### 8. **AdminReportComponent**
**Archivo:** `admin/admin-report.component.ts/html`  
**Funcionalidad:**
- **Solo para admins** (protegido por `adminGuard`)
- Métricas generales:
  - Total usuarios, total reservas
  - Asientos ocupados/libres por clase (Business/Económica)
  - Métodos de selección (manual vs aleatorio)
  - Reservas modificadas/canceladas
- Tabla por usuario:
  - Nombre, email, total reservas, modificadas, canceladas, método
- **Mapas de asientos Business y Económica:**
  - Grid visual con ocupación en tiempo real
  - Verde (libre), Gris oscuro (ocupado)

**Endpoint:**
- `GET /api/reports/admin-dashboard` → métricas
- `GET /api/seats` → estado de asientos

**Dependencias:**
- `AuthService`, `HttpClient`

---

## 🔧 Servicios

### **AuthService**
**Archivo:** `auth/auth.service.ts`  
**Métodos:**
- `login(credentials)`: POST /api/users/login → guarda token + user en localStorage
- `register(payload)`: POST /api/users/register → auto-login opcional
- `logout()`: Limpia localStorage → redirige a /login
- `getToken()`: Retorna JWT desde localStorage
- `isLoggedIn()`: Boolean si existe token
- `getUser<T>()`: Parsea y retorna user desde localStorage
- `displayName()`: Retorna nombre para mostrar en navbar
- `isAdmin()`: Chequea field `is_admin` del user
- `refreshProfile()`: GET /api/users/me → actualiza localStorage
- `getAllowedDomains()`: Retorna dominios permitidos (hardcoded: gmail.com, outlook.com)

**Estado:**
- LocalStorage: `token`, `user` (JSON del perfil)

---

### **ReservasService**
**Archivo:** `reservas/reservas.service.ts`  
**Endpoints:**
- `getSeats()`: GET /api/seats/map → mapa de asientos para mapa visual
- `getAllSeats()`: GET /api/seats → lista completa con IDs para edición
- `getRandomSeat(seatClass)`: GET /api/seats/random/:seatClass → obtiene asiento aleatorio
- `createReservation(payload)`: POST /api/reservations → crea reserva(s)
- `getMyReservations()`: GET /api/reservations/me → lista de reservas activas del usuario
- `updateReservation(id, payload)`: PUT /api/reservations/:id → edita reserva
- `deleteReservation(id, reason?)`: DELETE /api/reservations/:id → soft delete individual
- `quoteReservation(id, params)`: GET /api/reservations/:id/quote → previsualización de precio
- `lookupReservationByCuiAndSeat(payload)`: POST /api/reservations/lookup → busca reserva por CUI + asiento
- `cancelByCuiAndSeat(payload)`: POST /api/reservations/cancel-by-cui-seat → cancela por CUI + asiento
- `cancelBatch(payload)`: POST /api/reservations/cancel-batch → cancela conjunto (idempotente)

**Payloads clave:**
```typescript
// Crear reserva
{
  seats: [{ code: string, full_name: string, cui: string, has_bag: boolean }],
  selectionMode: 'manual' | 'random',
  batch_id: string
}

// Editar reserva
{
  seat_id?: number,
  has_luggage?: boolean,
  full_name?: string,
  cui?: string
}

// Cancelar batch
{ batch_id: string, reason?: string }
```

---

### **AuditService**
**Archivo:** `reservas/audit.service.ts`  
**Endpoints:**
- `getCancellationHistory(limit, offset)`: GET /api/audit/cancellations → historial paginado
- `getCancellationStats()`: GET /api/audit/cancellations/stats → métricas
- `getReservationAuditTrail(reservationId)`: GET /api/audit/reservations/:id/trail → trazabilidad de una reserva
- `getDetailedCancellationReport(limit, offset)`: GET /api/audit/cancellations/report/detailed → reporte detallado

**Uso:**
- Componente `HistorialAuditoriaComponent` para mostrar auditoría de cancelaciones
- Tracking de cambios en reservas con JSONB en tabla `reservation_audit`

---

### **ToastService**
**Archivo:** `ui/toast/toast.service.ts`  
**Métodos:**
- `success(message, duration?)`: Muestra toast verde
- `error(message, duration?)`: Muestra toast rojo
- `info(message, duration?)`: Muestra toast azul
- `warning(message, duration?)`: Muestra toast amarillo
- `dismiss(id)`: Cierra toast específico
- `clear()`: Cierra todos los toasts

**Implementación:**
- BehaviorSubject con array de Toasts
- Autodismiss con setTimeout
- Toast types: 'success' | 'error' | 'info' | 'warning'

**Componente asociado:**
- `ToastContainerComponent`: Overlay fijo en top-right, renderiza toasts con animaciones

---

## 🛡️ Guards e Interceptores

### **Guards**

#### 1. `authGuard`
**Archivo:** `auth/auth.guard.ts`  
**Propósito:** Protege rutas que requieren autenticación  
**Lógica:**
```typescript
if (auth.isLoggedIn()) return true;
router.navigate(['/login']);
return false;
```

#### 2. `adminGuard`
**Archivo:** `auth/admin.guard.ts`  
**Propósito:** Protege rutas solo para admins  
**Lógica:**
```typescript
if (auth.isLoggedIn() && auth.isAdmin()) return true;
router.navigate(['/login']);
return false;
```

#### 3. `guestGuard`
**Archivo:** `auth/guest.guard.ts`  
**Propósito:** Evita acceso a login/register si ya está autenticado  
**Lógica:**
```typescript
if (!auth.isLoggedIn()) return true;
router.navigate(['/reservas/mis-reservas']);
return false;
```

---

### **Interceptores**

#### 1. `tokenInterceptor`
**Archivo:** `auth/token.interceptor.ts`  
**Propósito:** Agrega header `Authorization: Bearer <token>` a todas las peticiones HTTP  
**Implementación:**
```typescript
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
```

#### 2. `authErrorInterceptor`
**Archivo:** `auth/auth-error.interceptor.ts`  
**Propósito:** Maneja errores 401/403 → auto-logout y redirige a /login  
**Implementación:**
- Intercepta respuestas HTTP
- Si status === 401 || 403 → `auth.logout()`

---

## 🧩 Utilidades y Pipes

### **Validators** (`shared/validators.ts`)
```typescript
validateFullName(name: string): string | null
  // Mínimo 3 chars, solo letras y espacios, acentos permitidos

validateEmailFormat(email: string): boolean
  // Regex email básico

validatePasswordComplex(pwd: string): boolean
  // 8+ chars, mayúscula, minúscula, número, símbolo especial

normalizeCui(raw: string): string
  // Elimina todo excepto dígitos
```

### **AsLocalDatePipe** (`shared/pipes/as-local-date.pipe.ts`)
```typescript
transform(value: any, format?: string): string
  // Convierte ISO timestamps a formato local legible
  // Default: "dd/MM/yyyy HH:mm"
```

---

## 🎨 Estilo y Diseño

### **Paleta de Colores (Tailwind Custom)**
```scss
--dark: #0f172a (slate-900)       // Fondo principal
--graphite: #1e293b (slate-800)   // Fondo secundario
--softblue: #cbd5e1 (slate-300)   // Texto claro
--accent: #f9b17a (amber-500)     // Acentos (links activos, botones)
--neo-shadow: múltiples capas     // Sombras neomórficas
```

### **Clases CSS Custom**
```css
.neo-card              // Cards con efecto neomórfico
.input-neo             // Inputs con borde sutil y fondo oscuro
.brand-logo            // Logo con filtro drop-shadow
.seat-button           // Asientos en mapa (estados: disponible, ocupado, seleccionado)
```

### **Responsive**
- Mobile-first approach
- Breakpoints: `sm:`, `md:`, `lg:`
- Navbar adapta links en pantallas pequeñas (oculta "Hola, Usuario")

---

## 🔄 Flujo de Usuario Completo

### **1. Registro y Login**
```
Usuario → /register
  → Llena formulario (validaciones en vivo)
  → Submit → POST /api/users/register
  → Auto-login → guarda token + user en localStorage
  → Redirige a /reservas/mis-reservas
```

### **2. Crear Reserva**
```
Usuario autenticado → /reservas/crear
  → Selecciona clase (Business/Económica)
  → Define cantidad de asientos
  → Opción 1: Click manual en mapa de asientos
  → Opción 2: Botón "Aleatorio" → modal → genera selección random
  → Por cada asiento: llena nombre, CUI, equipaje
  → Validación en tiempo real (campos requeridos)
  → Botón "Reservar" → POST /api/reservations con batch_id
  → Backend crea N reservas, calcula precios, aplica VIP
  → Modal de confirmación con lista de reservas creadas
  → Usuario puede editar inline o ir a "Mis reservas"
```

### **3. Gestionar Reservas**
```
Usuario → /reservas/mis-reservas
  → Lista agrupada por batch_id
  → Expandir grupo → ver asientos individuales
  → Clic "Editar" → modal con mapa de asientos disponibles
    → Cambia asiento, equipaje, datos pasajero
    → Previsualización de precio en tiempo real
    → Guardar → PUT /api/reservations/:id → refresca lista
  → Clic "Cancelar" individual → modal CUI validation
    → Confirma → DELETE /api/reservations/:id (soft delete)
    → Registra en auditoría → envía email confirmación
  → Clic "Cancelar conjunto" → modal escribir "CANCELAR"
    → Confirma → POST /api/reservations/cancel-batch
    → Backend: marca todas como deleted_at = NOW()
    → Idempotencia: si ya fue cancelado, retorna 200 con count:0
    → Siempre refresca listado → grupo desaparece si fue cancelado
```

### **4. Ver Historial de Auditoría**
```
Usuario → /reservas/historial
  → Pestaña "Activas": lista de reservas vigentes
  → Pestaña "Canceladas": historial paginado de cancelaciones
    → Muestra fecha, asiento, motivo, IP, user-agent
  → Pestaña "Estadísticas": métricas agregadas
    → Total cancelaciones, por tipo, promedio por usuario
```

### **5. Perfil VIP**
```
Usuario → /me
  → Backend chequea cantidad de reservas activas
  → Si ≥ 5 reservas → status VIP (badge dorado)
  → VIP obtiene 10% descuento en nuevas reservas
  → Muestra actividad: total reservas, modificadas, canceladas
```

### **6. Admin - Reportes**
```
Admin → /admin/reportes
  → Dashboard con métricas globales
  → Asientos ocupados/libres por clase
  → Tabla por usuario con actividad
  → Mapas visuales de asientos Business y Económica
```

### **7. Admin - Carga Masiva XML**
```
Admin → Navbar → Admin ▾ → "Cargar reservas (XML)"
  → Modal de upload → selecciona archivo XML
  → Drag & drop o click para subir
  → POST /api/reports/reservations.xml/upload
  → Backend parsea XML, valida, inserta en DB
  → Modal muestra resumen: total, ok, errors
  → Link "Ver asientos resaltados" → /reservas/crear?highlight=A1,B2,C3
  → Mapa resalta asientos importados con borde amarillo
```

---

## ⚙️ Configuración Global

### **app.config.ts**
```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([tokenInterceptor, authErrorInterceptor])
    ),
    provideAnimationsAsync()
  ]
};
```

**Providers:**
- `provideRouter`: Enrutamiento con lazy loading potencial
- `provideHttpClient`: Con interceptores de token y errores
- Servicios singleton: AuthService, ToastService, ReservasService, AuditService

---

## 📦 Dependencias Clave

```json
{
  "@angular/core": "^17.x",
  "@angular/common": "^17.x",
  "@angular/router": "^17.x",
  "@angular/forms": "^17.x",
  "tailwindcss": "^3.x",
  "rxjs": "^7.x"
}
```

**Sin:**
- NgRx (estado en localStorage + servicios)
- Material/Bootstrap (Tailwind custom)
- Chart.js (estadísticas con HTML/CSS puro)

---

## 🐛 Debugging y Logs

### **Console Logs Estratégicos**
- `[CANCEL]` en backend para cancelación individual
- `[CANCEL-BATCH]` en backend para cancelación batch
- Frontend: `console.log('[CANCEL-BATCH] Listado actualizado:', this.grupos.length)`

### **Chrome DevTools**
- Network tab: validar endpoints, status codes, payloads
- Application → LocalStorage: revisar `token`, `user`
- Console: errores de validación, respuestas deAPI

---

## 🔐 Seguridad

### **Frontend**
- Guards previenen acceso no autorizado
- Token en Authorization header (HTTPOnly no disponible en SPA, se usa localStorage)
- Validaciones de input lado cliente (duplicadas en backend)

### **Backend (fuera de alcance, pero relacionado)**
- JWT con expiración
- Bcrypt para passwords
- Validaciones Joi en controladores
- CORS configurado
- Soft delete para auditoría (no DELETE físico)

---

## 📊 Métricas de Rendimiento

- **Tiempo de carga inicial:** ~2-3s (primera carga con assets)
- **Navegación entre rutas:** Instantáneo (SPA)
- **Carga de mapa de asientos:** ~200-500ms (depende de DB)
- **Creación de reserva:** ~300-800ms (con email async)
- **Cancelación batch:** ~400-1000ms (múltiples UPDATEs + audit logs)

---

## 🚀 Mejoras Recientes (2025)

### **Cancelación Idempotente**
- Backend: No lanza 404 si batch ya fue cancelado
- Retorna `200 OK` con `{ count: 0, already_cancelled: true }`
- Frontend: Diferencia mensaje ("ya cancelado" vs "cancelado exitosamente")
- Siempre refresca listado para sincronizar estado

### **Auditoría Completa**
- Tabla `reservation_audit` con JSONB para detalles
- Tracking de IP address y user-agent
- Views SQL: `active_reservations`, `user_cancellation_history`
- Endpoints dedicados para historial y estadísticas

### **Soft Delete**
- Columna `deleted_at` en reservations
- Queries filtran con `WHERE deleted_at IS NULL`
- No se pierden datos para auditorías futuras
- FK constraints con ON DELETE CASCADE (no aplica en soft delete)

---

## 📝 Convenciones de Código

### **Componentes**
- Standalone components (Angular 17+)
- Imports explícitos de CommonModule, FormsModule
- Naming: `*.component.ts/html/scss`

### **Servicios**
- `@Injectable({ providedIn: 'root' })`
- Métodos retornan `Observable<any>`
- Error handling con `.subscribe({ next, error })`

### **Estilos**
- Tailwind utility-first
- Variables CSS para tema en `styles.scss`
- BEM para componentes con estilo específico

### **Estado**
- Props públicos para binding en templates
- Métodos privados con prefijo `_` (ej: `_fetchData()`)
- Reactive con RxJS (BehaviorSubject en servicios)

---

## 🎓 Guía para ChatGPT

### **Contexto para Prompts Futuros**

**Arquitectura:**
- Angular 17 standalone components
- Tailwind CSS con tema oscuro neomórfico
- JWT auth en localStorage
- Backend Express + PostgreSQL (fuera de scope del frontend)

**Componentes críticos para modificar:**
- `CrearComponent`: Mapa de asientos y creación de reservas
- `MisReservasComponent`: Gestión y cancelación de reservas
- `HistorialAuditoriaComponent`: Auditoría y tracking

**Servicios core:**
- `AuthService`: Todo relacionado con autenticación
- `ReservasService`: CRUD de reservas
- `AuditService`: Historial y estadísticas
- `ToastService`: Notificaciones UI

**Patrones comunes:**
```typescript
// Cargar datos
this.api.getData().subscribe({
  next: (res) => { this.data = res?.data || []; },
  error: (err) => { this.toast.error(err?.error?.message || 'Error'); }
});

// Validación antes de submit
if (!this.canSubmit) return this.toast.warning('Completa todos los campos');

// Idempotencia en endpoints
if (alreadyProcessed) {
  return ok(res, 'Ya fue procesado', { count: 0, already_done: true });
}
```

**Problemas típicos a resolver:**
1. Validaciones de formularios
2. Sincronización de estado tras operaciones CRUD
3. Manejo de errores 401/403/404
4. Performance en mapas de asientos con muchos elementos
5. Race conditions en cancelaciones múltiples

**Términos del dominio:**
- **Batch:** Grupo de reservas creadas juntas (batch_id)
- **Soft Delete:** Marca deleted_at en lugar de DELETE físico
- **VIP:** Usuario con 5+ reservas activas (10% descuento)
- **Audit Trail:** Historial completo de cambios en reservations
- **Idempotencia:** Operación repetida devuelve mismo resultado sin errores

---

## 📞 Endpoints API (Resumen)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/users/login` | Login |
| POST | `/api/users/register` | Registro |
| GET | `/api/users/me` | Perfil actual |
| GET | `/api/users/me/vip` | Status VIP |
| GET | `/api/seats/map` | Mapa de asientos |
| GET | `/api/seats` | Lista completa de asientos |
| POST | `/api/reservations` | Crear reserva(s) |
| GET | `/api/reservations/me` | Mis reservas activas |
| PUT | `/api/reservations/:id` | Editar reserva |
| DELETE | `/api/reservations/:id` | Cancelar individual (soft delete) |
| POST | `/api/reservations/cancel-batch` | Cancelar batch (idempotente) |
| GET | `/api/reservations/:id/quote` | Cotizar cambio |
| GET | `/api/audit/cancellations` | Historial de cancelaciones |
| GET | `/api/audit/cancellations/stats` | Estadísticas |
| GET | `/api/reports/admin-dashboard` | Métricas admin |
| GET | `/api/reports/reservations.xml` | Descargar XML |
| POST | `/api/reports/reservations.xml/upload` | Cargar XML |

---

**Última actualización:** Febrero 2026  
**Versión:** 2.1.0 (con auditoría + cancelación idempotente)
