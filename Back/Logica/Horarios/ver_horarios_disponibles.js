const db = require("../../Datos/Reservas/conexion");
const { horariosBloqueados } = require("./bloquear_horario");

/**
 * Historia «Ver horarios disponibles» (épica Horarios).
 * El jugador elige una cancha y un día, y ve las horas libres: las que el
 * encargado registró con «Agregar horario», menos las ya confirmadas.
 * Las que otro jugador está reservando en ese momento salen como «En proceso».
 */
class VerHorariosDisponibles {
  constructor(database = db) {
    this.db = database;
  }

  /** Escribe una hora como "08:00". */
  formatoHora(hora) {
    return `${String(hora).padStart(2, "0")}:00`;
  }

  /**
   * Parte los horarios registrados de la cancha en bloques de una hora y deja
   * solo los que empiezan dentro de 2 horas o más. Ej.: 18:00-20:00 da 18:00 y 19:00.
   */
  horariosDisponibles(fecha, cancha) {
    const limite = Date.now() + 2 * 60 * 60 * 1000;
    const registrados = this.db.prepare(`
      SELECT hora_inicio, hora_fin FROM horarios WHERE cancha_id = ? AND fecha = ?
    `).all(cancha.id, fecha);

    const horas = new Set();
    for (const horario of registrados) {
      for (let hora = Number(horario.hora_inicio.slice(0, 2)); hora < Number(horario.hora_fin.slice(0, 2)); hora += 1) {
        horas.add(this.formatoHora(hora));
      }
    }
    return [...horas].sort()
      .filter((inicio) => new Date(`${fecha}T${inicio}:00`).getTime() >= limite)
      .map((inicio) => ({ inicio, fin: this.formatoHora(Number(inicio.slice(0, 2)) + 1) }));
  }

  /** Horas que ya tienen una reserva confirmada y no cancelada. */
  horasConfirmadas(canchaId, fecha) {
    return new Set(this.db.prepare(`
      SELECT hb.hora_inicio
      FROM horarios_bloqueados hb
      JOIN decisiones_reserva d ON d.reserva_id = hb.reserva_id
      WHERE hb.cancha_id = ? AND hb.fecha = ? AND d.estado = 'confirmada'
        AND NOT EXISTS (
          SELECT 1 FROM cancelaciones_reserva c WHERE c.reserva_id = hb.reserva_id
        )
    `).all(canchaId, fecha).map(({ hora_inicio }) => hora_inicio));
  }

  registrarRutas(servidor) {
    // Devuelve las horas libres; el bloqueo temporal se informa como estado, no se oculta.
    servidor.app.get("/api/canchas/:id/disponibilidad", (req, res) => {
      const cancha = servidor.buscarCancha(req.params.id);
      if (!cancha) {
        return res.status(404).json({ error: "No se encontró la cancha." });
      }

      const fecha = servidor.parsearFecha(req.query.fecha);
      if (!fecha) {
        return res.status(400).json({ error: "La fecha debe tener el formato AAAA-MM-DD." });
      }
      const diferenciaDias = servidor.diasDesdeHoy(fecha);
      if (diferenciaDias < 0 || diferenciaDias > 30) {
        return res.status(400).json({ error: "La fecha debe estar entre hoy y los próximos 30 días." });
      }

      const bloqueados = horariosBloqueados(cancha.id, req.query.fecha);
      const confirmados = this.horasConfirmadas(cancha.id, req.query.fecha);
      const horarios = this.horariosDisponibles(req.query.fecha, cancha)
        .filter((horario) => !confirmados.has(horario.inicio))
        .map((horario) => ({ ...horario, bloqueado: bloqueados.has(horario.inicio) }));
      res.json({ cancha, fecha: req.query.fecha, horarios });
    });
  }
}

module.exports = { VerHorariosDisponibles };
