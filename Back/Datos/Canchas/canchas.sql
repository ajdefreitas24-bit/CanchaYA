-- Perfil de cada cancha registrado por un complejo (historia Agregar cancha).
-- Sus horarios se guardan aparte, en la tabla horarios (historia Agregar horario).
CREATE TABLE IF NOT EXISTS canchas (
  id TEXT PRIMARY KEY, -- Identificador único usado por API y reservas.
  complejo_id TEXT NOT NULL REFERENCES usuarios(id), -- Cuenta dueña de la cancha.
  deporte_id TEXT NOT NULL, -- Clave del catálogo de deportes.
  nombre TEXT NOT NULL, -- Nombre que verán los jugadores.
  ubicacion TEXT NOT NULL, -- Sector de Caracas seleccionado en el formulario.
  capacidad INTEGER NOT NULL CHECK (capacidad > 0), -- Capacidad máxima informada.
  precio_por_hora REAL NOT NULL CHECK (precio_por_hora > 0), -- Precio utilizado para cotizar.
  foto_data TEXT, -- Data URL de la foto opcionalmente conservada al editar.
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Ordena las canchas por fecha de alta.
);

-- Aceleran las dos consultas frecuentes: catálogo por deporte y panel por complejo.
CREATE INDEX IF NOT EXISTS canchas_deporte_idx ON canchas (deporte_id);
CREATE INDEX IF NOT EXISTS canchas_complejo_idx ON canchas (complejo_id);
