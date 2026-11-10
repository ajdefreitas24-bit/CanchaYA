const path = require("node:path");
const db = require("../../Datos/Reservas/conexion");
const { paymentService } = require("./registrar_pago");

/**
 * Complemento de «Pagar adelanto» (épica Pagos; no es una historia del Sprint 1).
 * El complejo revisa la referencia que subió el jugador y confirma o deniega la
 * reserva. El jugador ve el resultado en la pantalla de espera y en sus notificaciones.
 * En este archivo, "solicitud" significa un pago que el complejo debe revisar.
 */
class VerificarPago {
  constructor(database = db) {
    this.db = database;
  }

  /** Lee una solicitud de pago pendiente y confirma que pertenece al complejo. */
  reservaPendienteDeComplejo(id, complejoId) {
    return this.db.prepare(`
      SELECT r.*, p.monto_bs, p.referencia_imagen, p.nombre_archivo, p.enviada_en,
        u.nombre AS jugador_nombre, u.correo AS jugador_correo, u.id AS jugador_cuenta_id
      FROM reservas r
      JOIN pagos p ON p.reserva_id = r.id
      JOIN usuarios u ON u.id = r.jugador_id
      LEFT JOIN decisiones_reserva d ON d.reserva_id = r.id
      WHERE r.id = ? AND r.complejo_id = ? AND r.estado = 'confirmacion_pendiente'
        AND d.reserva_id IS NULL
    `).get(id, complejoId);
  }

  /** Convierte una fila con cancha, horas y jugador en el objeto que usa el navegador. */
  aObjeto(fila, extra = {}) {
    return {
      id: fila.id,
      cancha: JSON.parse(fila.cancha_json),
      fecha: fila.fecha,
      horarios: JSON.parse(fila.horarios_json),
      jugador: fila.jugador_json ? JSON.parse(fila.jugador_json) : null,
      cuentaJugador: { nombre: fila.jugador_nombre, correo: fila.jugador_correo },
      ...extra
    };
  }

  registrarRutas(servidor) {
    const { app } = servidor;

    // Devuelve solicitudes de pago sin resolver y notificaciones de cancelación.
    app.get("/api/complejo/solicitudes", servidor.requerirComplejo, (req, res) => {
      const solicitudes = this.db.prepare(`
        SELECT r.id, r.cancha_json, r.fecha, r.horarios_json, r.jugador_json, r.creada_en,
          p.monto_bs, p.nombre_archivo, p.enviada_en,
          u.nombre AS jugador_nombre, u.correo AS jugador_correo
        FROM reservas r
        JOIN pagos p ON p.reserva_id = r.id
        JOIN usuarios u ON u.id = r.jugador_id
        LEFT JOIN decisiones_reserva d ON d.reserva_id = r.id
        WHERE r.complejo_id = ? AND r.estado = 'confirmacion_pendiente' AND d.reserva_id IS NULL
        ORDER BY p.enviada_en DESC
      `).all(req.usuario.id).map((fila) => this.aObjeto(fila, {
        montoBs: fila.monto_bs,
        nombreArchivo: fila.nombre_archivo,
        enviadaEn: fila.enviada_en
      }));
      const cancelaciones = this.db.prepare(`
        SELECT c.reserva_id AS id, c.cancelada_en, r.cancha_json, r.fecha, r.horarios_json,
          r.jugador_json, u.nombre AS jugador_nombre, u.correo AS jugador_correo
        FROM cancelaciones_reserva c
        JOIN reservas r ON r.id = c.reserva_id
        JOIN usuarios u ON u.id = c.jugador_id
        WHERE c.complejo_id = ?
        ORDER BY c.cancelada_en DESC
      `).all(req.usuario.id).map((fila) => this.aObjeto(fila, { canceladaEn: fila.cancelada_en }));
      res.json({ solicitudes, cancelaciones });
    });

    // Proporciona datos del jugador y metadatos de la referencia para una solicitud.
    app.get("/api/complejo/solicitudes/:id", servidor.requerirComplejo, (req, res) => {
      const solicitud = this.reservaPendienteDeComplejo(req.params.id, req.usuario.id);
      if (!solicitud) {
        return res.status(404).json({ error: "La solicitud ya fue atendida o no pertenece a este complejo." });
      }
      res.json(this.aObjeto(solicitud, {
        montoBs: solicitud.monto_bs,
        nombreArchivo: solicitud.nombre_archivo,
        enviadaEn: solicitud.enviada_en,
        referenciaUrl: `/api/complejo/solicitudes/${encodeURIComponent(solicitud.id)}/referencia`
      }));
    });

    // Entrega la imagen de la referencia solo si la solicitud pertenece a este complejo.
    app.get("/api/complejo/solicitudes/:id/referencia", servidor.requerirComplejo, (req, res, next) => {
      const solicitud = this.reservaPendienteDeComplejo(req.params.id, req.usuario.id);
      if (!solicitud) {
        return res.status(404).json({ error: "No se encontró la referencia de esta solicitud." });
      }
      const nombreImagen = path.basename(solicitud.referencia_imagen);
      if (!/^[\da-f-]+\.(png|jpg|webp)$/i.test(nombreImagen)) {
        return res.status(500).json({ error: "La ruta de la referencia no es válida." });
      }
      res.sendFile(path.join(paymentService.directorioReferencias(), nombreImagen), (error) => {
        if (error && !res.headersSent) next(error);
      });
    });

    // Lista reservas confirmadas del complejo y marca las que luego se cancelaron.
    app.get("/api/complejo/reservaciones", servidor.requerirComplejo, (req, res) => {
      const reservaciones = this.db.prepare(`
        SELECT r.id, r.cancha_json, r.fecha, r.horarios_json, r.jugador_json,
          d.decidida_en, c.reserva_id AS cancelada,
          u.nombre AS jugador_nombre, u.correo AS jugador_correo
        FROM reservas r
        JOIN decisiones_reserva d ON d.reserva_id = r.id AND d.estado = 'confirmada'
        JOIN usuarios u ON u.id = r.jugador_id
        LEFT JOIN cancelaciones_reserva c ON c.reserva_id = r.id
        WHERE r.complejo_id = ? AND d.complejo_id = ?
        ORDER BY r.fecha DESC, r.id
      `).all(req.usuario.id, req.usuario.id).map((fila) => this.aObjeto(fila, {
        estado: fila.cancelada ? "cancelada" : "confirmada",
        confirmadaEn: fila.decidida_en
      }));
      res.json({ reservaciones });
    });

    // Confirma o deniega una solicitud dentro de una transacción para evitar doble decisión.
    app.post("/api/complejo/solicitudes/:id/decision", servidor.requerirComplejo, (req, res) => {
      const decision = req.body?.decision;
      if (decision !== "confirmada" && decision !== "denegada") {
        return res.status(400).json({ error: "Selecciona confirmar o denegar la reserva." });
      }
      const motivoDenegacion = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
      if (decision === "denegada" && (motivoDenegacion.length < 3 || motivoDenegacion.length > 500)) {
        return res.status(400).json({ error: "Escribe un motivo de rechazo de entre 3 y 500 caracteres." });
      }

      this.db.exec("BEGIN IMMEDIATE");
      try {
        const solicitud = this.reservaPendienteDeComplejo(req.params.id, req.usuario.id);
        if (!solicitud) {
          this.db.exec("ROLLBACK");
          return res.status(409).json({ error: "La solicitud ya fue atendida o no pertenece a este complejo." });
        }

        this.db.prepare(`
          INSERT INTO decisiones_reserva (reserva_id, complejo_id, jugador_id, estado, motivo_denegacion)
          VALUES (?, ?, ?, ?, ?)
        `).run(solicitud.id, req.usuario.id, solicitud.jugador_id, decision,
          decision === "denegada" ? motivoDenegacion : null);
        if (decision === "denegada") {
          // Al denegar se libera la disponibilidad; al confirmar se conserva el bloqueo.
          this.db.prepare("DELETE FROM horarios_bloqueados WHERE reserva_id = ?").run(solicitud.id);
        }
        this.db.exec("COMMIT");
        res.json({
          estado: decision,
          mensaje: decision === "confirmada"
            ? "La reserva fue confirmada y el jugador recibirá una notificación."
            : "La reserva fue denegada, el horario quedó disponible y el jugador recibirá una notificación."
        });
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    });

    // Consulta usada por la pantalla de espera para detectar la decisión del complejo.
    app.get("/api/jugador/reservas/:id/estado", servidor.requerirJugador, (req, res) => {
      const reserva = this.db.prepare(`
        SELECT r.estado AS estado_reserva, d.estado AS decision
        FROM reservas r
        LEFT JOIN decisiones_reserva d ON d.reserva_id = r.id
        WHERE r.id = ? AND r.jugador_id = ?
      `).get(req.params.id, req.usuario.id);
      if (!reserva) {
        return res.status(404).json({ error: "No se encontró esta reserva para tu cuenta." });
      }
      res.json({ estado: reserva.decision || reserva.estado_reserva });
    });

    // Devuelve decisiones y cancelaciones con el motivo de rechazo cuando aplica.
    app.get("/api/jugador/notificaciones", servidor.requerirJugador, (req, res) => {
      const notificaciones = this.db.prepare(`
        SELECT r.id, r.cancha_json, r.fecha, r.horarios_json,
          CASE WHEN c.reserva_id IS NOT NULL THEN 'cancelada' ELSE d.estado END AS estado,
          COALESCE(c.cancelada_en, d.decidida_en) AS decidida_en,
          d.motivo_denegacion
        FROM decisiones_reserva d
        JOIN reservas r ON r.id = d.reserva_id
        LEFT JOIN cancelaciones_reserva c ON c.reserva_id = r.id
        WHERE d.jugador_id = ?
        ORDER BY d.decidida_en DESC
      `).all(req.usuario.id).map((fila) => ({
        id: fila.id,
        estado: fila.estado,
        motivo: fila.motivo_denegacion,
        cancha: JSON.parse(fila.cancha_json),
        fecha: fila.fecha,
        horarios: JSON.parse(fila.horarios_json),
        decididaEn: fila.decidida_en
      }));
      res.json({ notificaciones });
    });
  }
}

module.exports = { VerificarPago };
