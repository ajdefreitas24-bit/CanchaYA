const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");

const DURACION_BLOQUEO_MS = 90 * 1000;

/**
 * Administra bloqueos provisionales en SQLite. El candado de escritura y las
 * restricciones únicas del esquema impiden que dos jugadores obtengan la misma hora.
 */
class ScheduleLockService {
  /** Acepta una conexión SQLite inyectable y la usa para todas las operaciones. */
  constructor(database = db) {
    this.db = database;
  }

  // La transacción serializa la comprobación y el alta para impedir que dos solicitudes tomen la misma hora.
  /** Ejecuta una operación completa bajo BEGIN IMMEDIATE y revierte si falla. */
  transaccion(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const resultado = callback();
      this.db.exec("COMMIT");
      return resultado;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Borra reservas de formulario vencidas; al borrarlas se eliminan sus horarios asociados. */
  limpiarBloqueosVencidos() {
    return this.transaccion(() => {
      const resultado = this.db.prepare(`
        DELETE FROM reservas
        WHERE estado = 'formulario' AND vence_en <= ?
      `).run(Date.now());
      return Number(resultado.changes);
    });
  }

  // Los bloqueos son temporales y solo marcan el horario como "en proceso"; no lo eliminan del calendario.
  /** Devuelve las horas temporalmente bloqueadas para mostrar el estado «En proceso». */
  horariosBloqueados(canchaId, fecha) {
    this.limpiarBloqueosVencidos();
    return new Set(this.db.prepare(`
      SELECT hora_inicio
      FROM horarios_bloqueados
      WHERE cancha_id = ? AND fecha = ? AND Bloqueado = 1
    `).all(canchaId, fecha).map((fila) => fila.hora_inicio));
  }

  /**
   * Comprueba que ninguna hora elegida esté ocupada y crea la reserva temporal
   * junto con todos sus bloqueos dentro de una única transacción.
   */
  bloquearHorarios({ cancha, fecha, horarios, jugadorId, complejoId }) {
    return this.transaccion(() => {
      this.db.prepare(`
        DELETE FROM reservas
        WHERE estado = 'formulario' AND vence_en <= ?
      `).run(Date.now());

      const existentes = this.db.prepare(`
        SELECT hora_inicio
        FROM horarios_bloqueados
        WHERE cancha_id = ? AND fecha = ? AND Bloqueado = 1
          AND hora_inicio IN (${horarios.map(() => "?").join(",")})
      `).all(cancha.id, fecha, ...horarios);

      if (existentes.length > 0) {
        return { bloqueado: true };
      }

      const id = crypto.randomUUID();
      const venceEn = Date.now() + DURACION_BLOQUEO_MS;
      this.db.prepare(`
        INSERT INTO reservas (
          id, cancha_id, cancha_json, fecha, horarios_json, estado, vence_en, jugador_id, complejo_id
        )
        VALUES (?, ?, ?, ?, ?, 'formulario', ?, ?, ?)
      `).run(id, cancha.id, JSON.stringify(cancha), fecha, JSON.stringify(horarios), venceEn, jugadorId, complejoId);

      const insertarHorario = this.db.prepare(`
        INSERT INTO horarios_bloqueados (cancha_id, fecha, hora_inicio, reserva_id, Bloqueado)
        VALUES (?, ?, ?, ?, 1)
      `);
      for (const horario of horarios) {
        insertarHorario.run(cancha.id, fecha, horario, id);
      }

      return { bloqueado: false, id, venceEn };
    });
  }

  // El formulario renueva su bloqueo periódicamente mientras el jugador sigue en esa pantalla.
  /** Extiende por otros 90 segundos un bloqueo vigente del formulario. */
  renovarBloqueo(id) {
    this.limpiarBloqueosVencidos();
    const venceEn = Date.now() + DURACION_BLOQUEO_MS;
    const resultado = this.db.prepare(`
      UPDATE reservas SET vence_en = ?
      WHERE id = ? AND estado = 'formulario' AND vence_en > ?
    `).run(venceEn, id, Date.now());
    return Number(resultado.changes) === 1 ? venceEn : null;
  }

  /** Elimina únicamente bloqueos cuyo flujo aún está en estado de formulario. */
  liberarBloqueo(id) {
    const resultado = this.db.prepare(`
      DELETE FROM reservas WHERE id = ? AND estado = 'formulario'
    `).run(id);
    return Number(resultado.changes) === 1;
  }
}

const scheduleLockService = new ScheduleLockService();

// Los wrappers ligados conservan la API funcional utilizada por el servidor.
module.exports = {
  ScheduleLockService,
  bloquearHorarios: scheduleLockService.bloquearHorarios.bind(scheduleLockService),
  horariosBloqueados: scheduleLockService.horariosBloqueados.bind(scheduleLockService),
  liberarBloqueo: scheduleLockService.liberarBloqueo.bind(scheduleLockService),
  limpiarBloqueosVencidos: scheduleLockService.limpiarBloqueosVencidos.bind(scheduleLockService),
  renovarBloqueo: scheduleLockService.renovarBloqueo.bind(scheduleLockService)
};
