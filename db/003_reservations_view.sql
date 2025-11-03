-- 003_reservations_view.sql (idempotente)
-- Expone una vista simplificada de reservas conforme al contrato del módulo
-- Columns: reservation_id, user_id, seat_code, full_name, cui, has_bag, created_at

CREATE OR REPLACE VIEW reservations_simple AS
SELECT
  r.reservation_id,
  r.user_id,
  s.seat_number AS seat_code,
  p.full_name,
  p.cui,
  r.has_luggage AS has_bag,
  r.reservation_date AS created_at
FROM reservations r
JOIN seats s ON s.seat_id = r.seat_id
JOIN passengers p ON p.passenger_id = r.passenger_id;