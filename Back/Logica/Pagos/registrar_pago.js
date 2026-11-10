const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");
const { datosAdministrador, tasaBolivaresPorDolar } = require("../../Datos/Pagos/configuracion");

/**
 * Historia «Pagar adelanto» (épica Pagos).
 * Calcula el adelanto (25 % del total, en bolívares) y registra la imagen de la
 * referencia de pago que envía el jugador. CanchaYA no cobra en línea.
 */
class PaymentService {
  /** Acepta una base de datos reemplazable para aislar las pruebas. */
  constructor(database = db) {
    this.db = database;
  }

  /** Calcula total y anticipo si la reserva sigue en una etapa que permite pagar. */
  obtenerPago(id) {
    const reserva = this.db.prepare("SELECT * FROM reservas WHERE id = ?").get(id);
    if (!reserva || !["pago_pendiente", "confirmacion_pendiente"].includes(reserva.estado)) {
      return null;
    }

    const cancha = JSON.parse(reserva.cancha_json);
    const horarios = JSON.parse(reserva.horarios_json);
    return {
      reserva,
      pago: {
        precioTotalUsd: cancha.precioPorHora * horarios.length,
        anticipoBs: Math.round(cancha.precioPorHora * horarios.length * 0.25 * tasaBolivaresPorDolar * 100) / 100,
        tasaBolivaresPorDolar
      }
    };
  }

  /**
   * Cambia a confirmación pendiente e inserta el pago atómicamente; si no se
   * puede avanzar desde pago pendiente, revierte y comunica que no hubo cambio.
   */
  guardarReferencia(id, referenciaImagen, nombreArchivo, montoBs) {
    // Cambiar el estado y guardar la referencia en la misma transacción mantiene el bloqueo hasta revisión.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const resultado = this.db.prepare(`
        UPDATE reservas
        SET estado = 'confirmacion_pendiente'
        WHERE id = ? AND estado = 'pago_pendiente'
      `).run(id);

      if (Number(resultado.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return false;
      }

      this.db.prepare(`
        INSERT INTO pagos (reserva_id, monto_bs, referencia_imagen, nombre_archivo, estado)
        VALUES (?, ?, ?, ?, 'confirmacion_pendiente')
      `).run(id, montoBs, referenciaImagen, nombreArchivo);
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Carpeta donde se guardan las imágenes de las referencias (excluida de Git). */
  directorioReferencias() {
    return process.env.CANCHAYA_PAYMENT_REFERENCES_PATH
      ? path.resolve(process.env.CANCHAYA_PAYMENT_REFERENCES_PATH)
      : path.resolve(__dirname, "../../Datos/Pagos/Referencias");
  }

  /** Rutas de la historia: consultar el adelanto y enviar la referencia. */
  registrarRutas(servidor) {
    const { app } = servidor;

    // Devuelve monto, datos de transferencia y cancha para el dueño de la reserva.
    app.get("/api/pagos/:id", servidor.requerirJugador, (req, res) => {
      const resultado = this.obtenerPago(req.params.id);
      if (!resultado || resultado.reserva.jugador_id !== req.usuario.id) {
        return res.status(404).json({ error: "No hay un pago pendiente asociado a esta reserva." });
      }
      if (resultado.reserva.estado === "confirmacion_pendiente") {
        return res.status(409).json({ error: "Ya recibimos la referencia de pago de esta reserva." });
      }

      res.json({
        reservaId: resultado.reserva.id,
        pago: resultado.pago,
        administrador: datosAdministrador,
        cancha: JSON.parse(resultado.reserva.cancha_json),
        fecha: resultado.reserva.fecha,
        horarios: JSON.parse(resultado.reserva.horarios_json)
      });
    });

    // Verifica la imagen, guarda archivo y estado pendiente y compensa si falla una etapa.
    app.post("/api/pagos/:id/referencia", servidor.requerirJugador, async (req, res, next) => {
      const resultado = this.obtenerPago(req.params.id);
      if (!resultado || resultado.reserva.jugador_id !== req.usuario.id || resultado.reserva.estado !== "pago_pendiente") {
        return res.status(409).json({ error: "No se puede adjuntar una referencia a esta reserva." });
      }

      const imagen = servidor.obtenerExtensionImagen(req.body?.imagen);
      if (!imagen) {
        return res.status(400).json({ error: "Adjunta una imagen PNG, JPG o WEBP de máximo 5 MB." });
      }

      const nombreOriginal = typeof req.body.nombreArchivo === "string"
        ? path.basename(req.body.nombreArchivo).slice(0, 120)
        : "";
      const nombreArchivo = nombreOriginal || `referencia.${imagen.extension}`;
      const directorio = this.directorioReferencias();
      const rutaImagen = path.join(directorio, `${crypto.randomUUID()}.${imagen.extension}`);
      const rutaRelativa = path.relative(path.resolve(__dirname, "../../Datos/Pagos"), rutaImagen);
      await fs.mkdir(directorio, { recursive: true });

      try {
        await fs.writeFile(rutaImagen, imagen.contenido, { flag: "wx" });
        const guardado = this.guardarReferencia(req.params.id, rutaRelativa, nombreArchivo, resultado.pago.anticipoBs);
        if (!guardado) {
          await fs.unlink(rutaImagen);
          return res.status(409).json({ error: "La reserva ya no está esperando el pago." });
        }
        res.status(201).json({ estado: "confirmacion_pendiente" });
      } catch (error) {
        try {
          await fs.unlink(rutaImagen);
        } catch (limpiezaError) {
          if (limpiezaError.code !== "ENOENT") throw limpiezaError;
        }
        next(error);
      }
    });
  }
}

const paymentService = new PaymentService();

// Wrappers compatibles con las rutas HTTP existentes.
module.exports = {
  PaymentService,
  paymentService,
  guardarReferencia: paymentService.guardarReferencia.bind(paymentService),
  obtenerPago: paymentService.obtenerPago.bind(paymentService)
};
