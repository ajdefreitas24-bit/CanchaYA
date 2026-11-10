-- Registro principal del flujo formulario -> pago -> revisión del complejo.
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY, -- UUID enviado entre pantallas durante el flujo.
  cancha_id TEXT NOT NULL, -- Identificador original de la cancha.
  cancha_json TEXT NOT NULL, -- Copia de los datos de cancha al reservar, para conservar el detalle histórico.
  fecha TEXT NOT NULL, -- Día reservado en formato AAAA-MM-DD.
  horarios_json TEXT NOT NULL, -- Horas seleccionadas, serializadas como JSON.
  estado TEXT NOT NULL CHECK (estado IN ('formulario', 'pago_pendiente', 'confirmacion_pendiente')), -- Etapa activa.
  vence_en INTEGER, -- Expiración del bloqueo temporal; NULL cuando ya se envió el formulario.
  jugador_json TEXT, -- Datos de contacto que el jugador entrega para esta reserva.
  jugador_id TEXT REFERENCES usuarios(id), -- Cuenta propietaria que puede operar la reserva.
  complejo_id TEXT REFERENCES usuarios(id), -- Complejo al que se envía la solicitud.
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Fecha de creación del intento.
);