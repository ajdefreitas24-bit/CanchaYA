-- Cuentas de jugador, complejo y administrador; el correo no distingue mayúsculas/minúsculas.
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, -- UUID que relaciona la cuenta con sesiones, canchas y reservas.
  nombre TEXT NOT NULL, -- Nombre del jugador o nombre identificativo del complejo.
  correo TEXT NOT NULL UNIQUE COLLATE NOCASE, -- Identificador de acceso único.
  tipo TEXT NOT NULL CHECK (tipo IN ('jugador', 'complejo', 'administrador')), -- Rol autorizado por el servidor.
  password_hash TEXT NOT NULL, -- Hash derivado; nunca se almacena la contraseña en claro.
  password_salt TEXT NOT NULL, -- Salt aleatorio individual usado al verificar el hash.
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Momento de creación de la cuenta.
);

-- Solo se persiste el hash del token; al borrar el usuario se invalidan sus sesiones.
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY, -- SHA-256 del token enviado por el navegador.
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, -- Propietario de la sesión.
  vence_en INTEGER NOT NULL -- Expiración Unix en milisegundos.
);

-- Permite limpiar rápidamente sesiones expiradas al crear una sesión nueva.
CREATE INDEX IF NOT EXISTS sesiones_vence_en_idx ON sesiones(vence_en);
