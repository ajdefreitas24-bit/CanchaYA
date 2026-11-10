-- Una referencia por reserva. El archivo de imagen se guarda en disco y aquí se
-- persiste su ruta relativa junto con los datos que muestra el panel del complejo.
CREATE TABLE IF NOT EXISTS pagos (
  reserva_id TEXT PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE, -- Vincula pago y reserva.
  monto_bs REAL NOT NULL, -- Anticipo informado al jugador.
  referencia_imagen TEXT NOT NULL, -- Ruta relativa dentro del almacenamiento de referencias.
  nombre_archivo TEXT NOT NULL, -- Nombre original saneado para mostrarlo.
  estado TEXT NOT NULL CHECK (estado IN ('confirmacion_pendiente')), -- Etapa de revisión.
  enviada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP -- Ordena las solicitudes más recientes primero.
);
