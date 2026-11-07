-- Un registro por cancha, fecha y hora evita que dos reservas bloqueen el mismo horario a la vez.
CREATE TABLE IF NOT EXISTS horarios_bloqueados (
  cancha_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  reserva_id TEXT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  Bloqueado INTEGER NOT NULL DEFAULT 1 CHECK (Bloqueado IN (0, 1)),
  PRIMARY KEY (cancha_id, fecha, hora_inicio)
);
