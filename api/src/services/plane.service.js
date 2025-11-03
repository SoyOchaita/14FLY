// Plane seat generation and seeding utilities

export function generatePlaneSeats() {
  const business = {
    columns: [1, 2],
    rows: ["I", "G", "F", "D", "C", "A"],
    seats: [],
  };

  const economy = {
    columns: [3, 4, 5, 6, 7],
    rows: ["I", "H", "G", "F", "E", "D", "C", "B", "A"],
    seats: [],
  };

  for (const row of business.rows) {
    for (const col of business.columns) {
      business.seats.push({ code: `${row}${col}`, class: "business", available: true });
    }
  }

  for (const row of economy.rows) {
    for (const col of economy.columns) {
      economy.seats.push({ code: `${row}${col}`, class: "economy", available: true });
    }
  }

  return { plane: { business, economy } };
}
// Utilidades para generación de asientos del avión y para el seeding en la base de datos
// (traducción de los comentarios originales al español)

// Genera los registros compatibles con el esquema de la BD a partir de la representación interna de asientos.
// Nota: seat_class se convierte a 'Negocios' o 'Económica' según corresponda.

// Si no hay asientos todavía, seedSeatsIfNeeded inserta todos en bloque usando ON CONFLICT DO NOTHING.

// overlayAvailabilityFromDb: superpone la disponibilidad según la BD (available = !is_occupied)
// Convierte los asientos generados a registros compatibles con el esquema de la BD
// El esquema de la BD usa: seat_number (varchar), seat_class (enum 'Negocios' | 'Económica'), is_occupied (boolean)
export function generateDbSeatRecords() {
  const { plane } = generatePlaneSeats();
  const toDb = (s) => ({
    seat_number: s.code,
    seat_class: s.class === "business" ? "Negocios" : "Económica",
    is_occupied: false,
  });
  return [...plane.business.seats.map(toDb), ...plane.economy.seats.map(toDb)];
}

export async function seedSeatsIfNeeded(pool) {
  // If no seats yet, bulk insert all with ON CONFLICT DO NOTHING
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM seats");
  if (rows[0]?.count > 0) return false;

  const records = generateDbSeatRecords();
  if (records.length === 0) return false;

  const values = [];
  const params = [];
  let idx = 1;
  for (const r of records) {
    values.push(`($${idx++}, $${idx++}, $${idx++})`);
    params.push(r.seat_number, r.seat_class, r.is_occupied);
  }
  const sql = `
    INSERT INTO seats (seat_number, seat_class, is_occupied)
    VALUES ${values.join(",\n")}
    ON CONFLICT (seat_number) DO NOTHING
  `;
  await pool.query(sql, params);
  return true;
}

export function overlayAvailabilityFromDb(plane, dbRows) {
  const byCode = new Map(dbRows.map((r) => [r.seat_number, !r.is_occupied])); // available = !is_occupied

  for (const s of plane.plane.business.seats) {
    if (byCode.has(s.code)) s.available = byCode.get(s.code);
  }
  for (const s of plane.plane.economy.seats) {
    if (byCode.has(s.code)) s.available = byCode.get(s.code);
  }
  return plane;
}
