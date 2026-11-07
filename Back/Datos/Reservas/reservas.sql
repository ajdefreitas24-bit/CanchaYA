-- Guarda cada intento de reserva y su estado durante el flujo formulario -> pago -> confirmación.
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  cancha_id TEXT NOT NULL,
  cancha_json TEXT NOT NULL,
  fecha TEXT NOT NULL,
  horarios_json TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('formulario', 'pago_pendiente', 'confirmacion_pendiente')),
  vence_en INTEGER,
  jugador_json TEXT,
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);