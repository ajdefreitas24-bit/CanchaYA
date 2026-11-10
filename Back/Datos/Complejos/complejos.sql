-- Solicitud de cada complejo deportivo (historia Registrar complejo).
-- La cuenta con la que el complejo inicia sesión está en usuarios (tipo 'complejo');
-- su nombre es el nombre del complejo. Aquí se guardan los datos del dueño y del
-- complejo, y el estado que cambia el administrador (historia Modificar solicitudes).
CREATE TABLE IF NOT EXISTS complejos (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE, -- Cuenta del complejo.
  dueno_nombre TEXT NOT NULL, -- Nombre y apellido del dueño.
  dueno_cedula TEXT NOT NULL, -- Cédula del dueño, por ejemplo V-12345678.
  dueno_telefono TEXT NOT NULL, -- Teléfono del dueño, por ejemplo 0412-1234567.
  rif TEXT NOT NULL UNIQUE COLLATE NOCASE, -- RIF del complejo; no se puede repetir.
  direccion TEXT NOT NULL, -- Dirección del complejo.
  zona TEXT NOT NULL, -- Zona de Caracas elegida de la lista.
  deportes_json TEXT NOT NULL, -- Deportes que ofrece, como lista JSON.
  estado TEXT NOT NULL DEFAULT 'Pendiente de aprobación'
    CHECK (estado IN ('Pendiente de aprobación', 'Aprobado', 'Rechazado')), -- Lo cambia el administrador.
  motivo_rechazo TEXT, -- Obligatorio si el administrador rechaza la solicitud.
  solicitado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Fecha en que se envió la solicitud.
  revisado_en TEXT -- Fecha en que el administrador la aprobó o rechazó.
);

-- Acelera la lista de solicitudes por estado (historia Ver solicitudes).
CREATE INDEX IF NOT EXISTS complejos_estado_idx ON complejos (estado, solicitado_en);
