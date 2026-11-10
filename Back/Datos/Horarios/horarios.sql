-- Horarios que el encargado registra para cada cancha (historia Agregar horario).
-- Un horario es un rango de horas en punto de un día, por ejemplo 18:00 a 20:00.
-- La regla de negocio "los horarios de una misma cancha no pueden superponerse"
-- se revisa en Back/Logica/Horarios/agregar_horario.js antes de insertar.
CREATE TABLE IF NOT EXISTS horarios (
  id TEXT PRIMARY KEY, -- Identificador único del horario.
  cancha_id TEXT NOT NULL REFERENCES canchas(id) ON DELETE CASCADE, -- Cancha a la que pertenece.
  fecha TEXT NOT NULL, -- Día del horario en formato AAAA-MM-DD.
  hora_inicio TEXT NOT NULL, -- Hora de inicio, en punto (HH:00).
  hora_fin TEXT NOT NULL, -- Hora de fin, en punto y mayor que la de inicio.
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Momento en que se registró.
);

-- Acelera la búsqueda de horarios de una cancha en una fecha.
CREATE INDEX IF NOT EXISTS horarios_cancha_fecha_idx ON horarios (cancha_id, fecha);

-- Tabla de ocupación por bloque horario. La clave compuesta impide reservar dos
-- veces la misma cancha, fecha y hora, incluso ante solicitudes concurrentes.
CREATE TABLE IF NOT EXISTS horarios_bloqueados (
  cancha_id TEXT NOT NULL, -- Cancha a la que pertenece la hora.
  fecha TEXT NOT NULL, -- Fecha específica de ocupación.
  hora_inicio TEXT NOT NULL, -- Inicio del bloque de una hora.
  reserva_id TEXT NOT NULL REFERENCES reservas(id) ON DELETE CASCADE, -- Dueño del bloqueo.
  Bloqueado INTEGER NOT NULL DEFAULT 1 CHECK (Bloqueado IN (0, 1)), -- Estado reservado para marca de bloqueo.
  PRIMARY KEY (cancha_id, fecha, hora_inicio)
);
