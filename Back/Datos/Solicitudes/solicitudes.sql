-- Decisión única tomada por el complejo para cada solicitud de pago.
CREATE TABLE IF NOT EXISTS decisiones_reserva (
  reserva_id TEXT PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE, -- Evita decisiones duplicadas.
  complejo_id TEXT NOT NULL REFERENCES usuarios(id), -- Complejo que respondió.
  jugador_id TEXT NOT NULL REFERENCES usuarios(id), -- Jugador que debe recibir la notificación.
  estado TEXT NOT NULL CHECK (estado IN ('confirmada', 'denegada')), -- Resultado de la revisión.
  motivo_denegacion TEXT, -- Obligatorio para rechazo y visible en las notificaciones del jugador.
  decidida_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Fecha usada para ordenar decisiones.
);

-- Permite obtener el historial de notificaciones del jugador por fecha.
CREATE INDEX IF NOT EXISTS decisiones_reserva_jugador_idx
  ON decisiones_reserva (jugador_id, decidida_en);

-- La cancelación se registra aparte de la decisión original para conservar el
-- historial de aprobación y permitir notificar al complejo que se liberó la hora.
CREATE TABLE IF NOT EXISTS cancelaciones_reserva (
  reserva_id TEXT PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE, -- Una cancelación por reserva.
  complejo_id TEXT NOT NULL REFERENCES usuarios(id), -- Destinatario de la notificación.
  jugador_id TEXT NOT NULL REFERENCES usuarios(id), -- Cuenta que solicitó cancelar.
  cancelada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Fecha que aparece en historial.
);

-- Acelera el panel de notificaciones del complejo.
CREATE INDEX IF NOT EXISTS cancelaciones_reserva_complejo_idx
  ON cancelaciones_reserva (complejo_id, cancelada_en);
