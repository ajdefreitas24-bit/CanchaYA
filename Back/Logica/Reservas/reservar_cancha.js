const db = require("../../Datos/Reservas/conexion");
const {
  bloquearHorarios,
  liberarBloqueo,
  limpiarBloqueosVencidos,
  renovarBloqueo
} = require("../Horarios/bloquear_horario");
const { validarReserva } = require("./validar_reservas");
const { datosAdministrador, tasaBolivaresPorDolar } = require("../../Datos/Pagos/configuracion");

/**
 * Historia «Reservar cancha» (épica Reservas).
 * Coordina validación, lectura y cambios de estado del flujo de reserva:
 * apartar las horas, mantener el apartado, liberarlo y validar los datos del jugador.
 */
class ReservationService {
  /** Recibe una conexión SQLite, permitiendo sustituirla durante pruebas. */
  constructor(database = db) {
    this.db = database;
  }

  /** Lee una reserva y reconstruye los campos JSON guardados en SQLite. */
  obtenerReserva(id) {
    limpiarBloqueosVencidos();
    const fila = this.db.prepare("SELECT * FROM reservas WHERE id = ?").get(id);
    if (!fila) return null;
    return {
      ...fila,
      cancha: JSON.parse(fila.cancha_json),
      horarios: JSON.parse(fila.horarios_json),
      jugador: fila.jugador_json ? JSON.parse(fila.jugador_json) : null
    };
  }

  /**
   * Valida los datos del jugador y avanza solo una reserva temporal vigente a
   * pago pendiente. También calcula el total y el anticipo para presentar el pago.
   */
  validarDatosReserva(id, datos) {
    const reserva = this.obtenerReserva(id);
    if (!reserva || reserva.estado !== "formulario") {
      return { encontrada: false };
    }

    const resultado = validarReserva(datos, reserva.cancha);
    if (!resultado.valido) {
      return { encontrada: true, valido: false, errores: resultado.errores };
    }

    const jugadorJson = JSON.stringify(resultado.datos);
    // Una reserva válida sale del estado temporal: desde aquí el horario queda pendiente del pago.
    const actualizado = this.db.prepare(`
      UPDATE reservas SET estado = 'pago_pendiente', vence_en = NULL, jugador_json = ?
      WHERE id = ? AND estado = 'formulario' AND vence_en > ?
    `).run(jugadorJson, id, Date.now());
    if (Number(actualizado.changes) !== 1) {
      liberarBloqueo(id);
      return { encontrada: false };
    }

    const precioTotalUsd = reserva.cancha.precioPorHora * reserva.horarios.length;
    const anticipoBs = Math.round(precioTotalUsd * 0.25 * tasaBolivaresPorDolar * 100) / 100;
    return {
      encontrada: true,
      valido: true,
      reserva: this.obtenerReserva(id),
      pago: {
        precioTotalUsd,
        anticipoBs,
        tasaBolivaresPorDolar,
        datosAdministrador
      }
    };
  }

  /** Libera un bloqueo de formulario cuando el jugador abandona el flujo. */
  liberarReserva(id) {
    return liberarBloqueo(id);
  }

  /** Renueva la vigencia del bloqueo mientras el formulario continúa abierto. */
  extenderReserva(id) {
    return renovarBloqueo(id);
  }

  /** Comprueba que una reserva temporal está asociada al jugador autenticado. */
  perteneceAJugador(id, jugadorId) {
    return Boolean(this.db.prepare("SELECT 1 FROM reservas WHERE id = ? AND jugador_id = ?").get(id, jugadorId));
  }

  /** Rutas de la historia: apartar, consultar, renovar, liberar y validar la reserva. */
  registrarRutas(servidor) {
    const { app } = servidor;

    // Aparta atómicamente todos los horarios seleccionados mientras se completa el formulario.
    app.post("/api/reservas/bloquear", servidor.requerirJugador, (req, res) => {
      const { canchaId, fecha, horarios } = req.body || {};
      const cancha = servidor.buscarCancha(canchaId);
      const fechaValida = servidor.parsearFecha(fecha);
      if (!cancha || !fechaValida || !Array.isArray(horarios) || horarios.length === 0
        || horarios.length > 15 || !horarios.every((hora) => typeof hora === "string")
        || new Set(horarios).size !== horarios.length) {
        return res.status(400).json({ error: "Selecciona una cancha, fecha y horarios válidos." });
      }

      const diferenciaDias = servidor.diasDesdeHoy(fechaValida);
      if (diferenciaDias < 0 || diferenciaDias > 30) {
        return res.status(400).json({ error: "La fecha debe estar entre hoy y los próximos 30 días." });
      }

      // Solo se pueden apartar horas que el encargado registró con «Agregar horario».
      const permitidos = new Set(servidor.verHorarios.horariosDisponibles(fecha, cancha).map((horario) => horario.inicio));
      if (!horarios.every((hora) => permitidos.has(hora))) {
        return res.status(400).json({ error: "La cancha no está disponible en uno o más horarios elegidos." });
      }

      const resultado = bloquearHorarios({
        cancha,
        fecha,
        horarios,
        jugadorId: req.usuario.id,
        complejoId: cancha.complejoId
      });
      if (resultado.bloqueado) {
        return res.status(409).json({
          codigo: "HORARIO_BLOQUEADO",
          error: "Error al reservar, este horario está siendo reservado por otro usuario"
        });
      }

      res.status(201).json({
        reservaId: resultado.id,
        venceEn: resultado.venceEn,
        cancha,
        fecha,
        horarios
      });
    });

    // Entrega los datos de una reserva temporal solo a su jugador propietario.
    app.get("/api/reservas/:id", servidor.requerirJugador, (req, res) => {
      const reserva = this.obtenerReserva(req.params.id);
      if (!reserva || reserva.jugador_id !== req.usuario.id || reserva.estado !== "formulario") {
        return res.status(404).json({ error: "El bloqueo de esta reserva venció o ya no está disponible." });
      }
      res.json({
        cancha: reserva.cancha,
        fecha: reserva.fecha,
        horarios: reserva.horarios
      });
    });

    // Renueva la expiración mientras el formulario de datos sigue abierto.
    app.post("/api/reservas/:id/latido", servidor.requerirJugador, (req, res) => {
      if (!this.perteneceAJugador(req.params.id, req.usuario.id)) {
        return res.status(404).json({ error: "No se encontró el bloqueo de esta reserva." });
      }
      const venceEn = this.extenderReserva(req.params.id);
      if (!venceEn) {
        return res.status(404).json({ error: "El bloqueo de esta reserva venció." });
      }
      res.json({ venceEn });
    });

    // Libera el bloqueo provisional al cancelar o abandonar el formulario.
    app.post("/api/reservas/:id/liberar", servidor.requerirJugador, (req, res) => {
      if (!this.perteneceAJugador(req.params.id, req.usuario.id)) {
        return res.status(404).json({ error: "No se encontró el bloqueo de esta reserva." });
      }
      this.liberarReserva(req.params.id);
      res.status(204).end();
    });

    // Valida los datos personales y transforma el bloqueo temporal en pago pendiente.
    app.post("/api/reservas/:id/validar", servidor.requerirJugador, (req, res) => {
      if (!this.perteneceAJugador(req.params.id, req.usuario.id)) {
        return res.status(404).json({ error: "No se encontró esta reserva." });
      }
      const resultado = this.validarDatosReserva(req.params.id, req.body || {});
      if (!resultado.encontrada) {
        return res.status(409).json({ error: "El bloqueo venció. Selecciona nuevamente tus horarios." });
      }
      if (!resultado.valido) {
        return res.status(422).json({
          error: "Revisa los campos indicados. El formulario se vació para que puedas corregirlos.",
          errores: resultado.errores
        });
      }

      res.json({
        reservaId: resultado.reserva.id,
        cancha: resultado.reserva.cancha,
        fecha: resultado.reserva.fecha,
        horarios: resultado.reserva.horarios,
        pago: resultado.pago
      });
    });
  }
}

const reservationService = new ReservationService();

// Wrappers ligados mantienen las funciones públicas utilizadas por las rutas.
module.exports = {
  ReservationService,
  reservationService,
  extenderReserva: reservationService.extenderReserva.bind(reservationService),
  liberarReserva: reservationService.liberarReserva.bind(reservationService),
  obtenerReserva: reservationService.obtenerReserva.bind(reservationService),
  validarDatosReserva: reservationService.validarDatosReserva.bind(reservationService)
};
