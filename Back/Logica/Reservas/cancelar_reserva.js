const db = require("../../Datos/Reservas/conexion");

/**
 * Historia «Cancelar reserva» (épica Reservas).
 * El jugador ve sus reservas confirmadas y puede cancelar una. No hay reembolso;
 * las horas vuelven a quedar libres y el complejo recibe el aviso.
 */
class CancelarReserva {
  constructor(database = db) {
    this.db = database;
  }

  /** Reservas confirmadas y no canceladas del jugador. */
  listarReservaciones(jugadorId) {
    return this.db.prepare(`
      SELECT r.id, r.cancha_json, r.fecha, r.horarios_json, r.creada_en, d.decidida_en
      FROM reservas r
      JOIN decisiones_reserva d ON d.reserva_id = r.id
      WHERE r.jugador_id = ? AND d.estado = 'confirmada'
        AND NOT EXISTS (
          SELECT 1 FROM cancelaciones_reserva c WHERE c.reserva_id = r.id
        )
      ORDER BY r.fecha DESC
    `).all(jugadorId).map((reserva) => ({
      id: reserva.id,
      cancha: JSON.parse(reserva.cancha_json),
      fecha: reserva.fecha,
      horarios: JSON.parse(reserva.horarios_json),
      decididaEn: reserva.decidida_en
    }));
  }

  /**
   * Cancela dentro de una transacción: registra la cancelación y libera las horas.
   * Devuelve el error que corresponda o null si todo salió bien.
   */
  cancelar(reservaId, jugadorId) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reserva = this.db.prepare(`
        SELECT r.id, r.complejo_id, d.estado
        FROM reservas r
        JOIN decisiones_reserva d ON d.reserva_id = r.id
        WHERE r.id = ? AND r.jugador_id = ?
      `).get(reservaId, jugadorId);
      if (!reserva || reserva.estado !== "confirmada") {
        this.db.exec("ROLLBACK");
        return "Solo puedes cancelar una reservación confirmada de tu cuenta.";
      }
      if (this.db.prepare("SELECT 1 FROM cancelaciones_reserva WHERE reserva_id = ?").get(reserva.id)) {
        this.db.exec("ROLLBACK");
        return "Esta reservación ya fue cancelada.";
      }

      this.db.prepare(`
        INSERT INTO cancelaciones_reserva (reserva_id, complejo_id, jugador_id)
        VALUES (?, ?, ?)
      `).run(reserva.id, reserva.complejo_id, jugadorId);
      this.db.prepare("DELETE FROM horarios_bloqueados WHERE reserva_id = ?").run(reserva.id);
      this.db.exec("COMMIT");
      return null;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  registrarRutas(servidor) {
    const { app } = servidor;

    // Devuelve las reservas confirmadas no canceladas del jugador actual.
    app.get("/api/jugador/reservaciones", servidor.requerirJugador, (req, res) => {
      res.json({ reservaciones: this.listarReservaciones(req.usuario.id) });
    });

    // Cancela una reserva propia confirmada, libera sus horas y avisa al complejo.
    app.post("/api/jugador/reservaciones/:id/cancelar", servidor.requerirJugador, (req, res) => {
      const error = this.cancelar(req.params.id, req.usuario.id);
      if (error) {
        return res.status(409).json({ error });
      }
      res.json({
        estado: "cancelada",
        mensaje: "La reservación fue cancelada. El horario ya está disponible nuevamente; no se realizan reembolsos."
      });
    });
  }
}

module.exports = { CancelarReserva };
