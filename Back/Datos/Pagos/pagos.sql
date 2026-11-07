-- La referencia de imagen queda guardada mientras el pago espera revisión del administrador.
CREATE TABLE IF NOT EXISTS pagos (
  reserva_id TEXT PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE,
  monto_bs REAL NOT NULL,
  referencia_imagen TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('confirmacion_pendiente')),
  enviada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
