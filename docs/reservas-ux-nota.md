# Nota de UX/Producto: Flujo de reservas, validaciones y edición

Esta nota documenta decisiones de experiencia de usuario y contrato API/Front para mejorar la robustez del flujo de reservas. Sirve también de base para el futuro servicio de correo.

## 1) Validar CUI antes de reservar (no destructivo)

- El CUI debe validarse en el cliente (validación visual básica) y en el API (validación completa) ANTES de intentar persistir.
- Si el API rechaza una reserva por CUI inválido:
  - No borrar los datos del pasajero ni deseleccionar el asiento.
  - Dejar los campos tal cual y mostrar un mensaje claro con la causa (formato, depto/muni, dígito verificador) y cómo corregir.
  - Permitir reintento inmediato tras la corrección, sin recomenzar el flujo.

Aceptación:
- Tras un error 400 de validación, el botón vuelve de "Procesando…" a habilitado, los campos siguen poblados y el asiento continúa seleccionado.

## 2) Reservas en conjunto: confirmación agrupada

- Cuando el usuario reserva N asientos, mostrar un resumen en conjunto:
  - Lista de asientos confirmados (código) y su fecha/hora.
  - Contador y estado de los que faltan.
  - Botones: "Ver mis reservas", "Modificar" (por elemento) y "Cerrar".
- Si se usa un flujo paso a paso (uno por uno):
  - Después de cada confirmación mostrar el asiento recién reservado y preguntar si desea continuar.
  - Si el usuario detiene, mostrar de todos modos el resumen de lo ya reservado.

Aceptación:
- Siempre existe un modal final con la lista completa de asientos confirmados en ese lote.

## 3) Edición más intuitiva (después de reservar)

- En Mis Reservas, el modal de edición debe:
  - Mostrar asiento actual y campos editables (nuevo asiento, maleta, y opcionalmente nombre/CUI si procede según reglas).
  - Cargar asientos disponibles (incluyendo el actual) con indicación visual de clase/ocupación.
  - Mostrar mensajes de error específicos del backend y mantener el formulario intacto al fallar para permitir corregir.
- Opcional (futuro): permitir cambiar el asiento usando el mismo mapa visual de la creación.

Aceptación:
- Ante error (p. ej., asiento tomado durante la edición), el modal no se cierra, conserva la selección y permite elegir otro sin perder datos.

## 4) Preparación para emails transaccionales

- El backend debe agrupar y devolver metadatos suficientes para armar un correo de resumen:
  - Lista de (reservation_id, seat_code, created_at, pasajero, maleta, totales/descuentos si aplica).
  - Identificador del lote (batch id) si se desea correlacionar reservas múltiples en un solo envío.
- El frontend debe mantener la confirmación agrupada visible (modal) para que coincida con el correo a enviar.

Aceptación:
- La respuesta de creación de reservas ya incluye `reservation_id`, `seat_code`, `created_at`. Extender con totales y datos del pasajero para el email.

## 5) Comportamientos no destructivos

- Nunca borrar datos del formulario ante errores de validación.
- Nunca deseleccionar asientos automáticamente por un error de formulario.
- Mantener estado coherente entre mapa, cantidad y selecciones.

Aceptación:
- Al producirse errores, el usuario siempre puede corregir sin re-hacer pasos previos.

## 6) API vs Front (resumen de responsabilidades)

- API: validación completa de CUI, disponibilidad y asignación de asientos, totales/precios/fees/descuentos, agrupación de resultados, mensajes de error claros.
- Front: validación básica y mensajes de ayuda en UI, preservación de datos, flujos modales (paso a paso y resumen), navegación a edición.

---

Checklist rápido (para implementación):
- [ ] Front: no limpiar `seleccionados` ni campos al error 400/409; reintento sin perder estado.
- [ ] API: devolver mensajes específicos de validación de CUI (formato, depto/muni, dígito verificador) y totales (futuro).
- [ ] Front: modal final agrupado garantizado; modal paso a paso opcional.
- [ ] Front: modal de edición persistente, mantiene datos ante errores.
- [ ] API: opción de `batch_id` en creación múltiple (futuro correo).
