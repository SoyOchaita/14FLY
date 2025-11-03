-- 002_add_cui_to_users.sql (idempotente)
DO $$
BEGIN
  -- Verifica existencia de tabla users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
  ) THEN
    RAISE NOTICE 'Tabla users no existe aún. Revisa el orden de los scripts.';
    RETURN;
  END IF;

  -- Añadir columna CUI si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cui'
  ) THEN
    ALTER TABLE users ADD COLUMN cui CHAR(13);
  END IF;

  -- Backfill para valores NULL (solo en desarrollo; TEMP + padding)
  UPDATE users
  SET cui = 'TEMP' || LPAD(user_id::text, 9, '0')
  WHERE cui IS NULL;

  -- Hacer NOT NULL si ya no quedan NULL
  IF NOT EXISTS (SELECT 1 FROM users WHERE cui IS NULL) THEN
    ALTER TABLE users ALTER COLUMN cui SET NOT NULL;
  END IF;

  -- Restricción única si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_cui_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_cui_unique UNIQUE (cui);
  END IF;
END$$;
