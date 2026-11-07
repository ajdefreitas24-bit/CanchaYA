const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");

const DURACION_BLOQUEO_MS = 90 * 1000;

// La transacción serializa la comprobación y el alta para impedir que dos solicitudes tomen la misma hora.
function transaccion(callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const resultado = callback();
    db.exec("COMMIT");
    return resultado;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function limpiarBloqueosVencidos() {
  return transaccion(() => {
    const resultado = db.prepare(`
      DELETE FROM reservas
      WHERE estado = 'formulario' AND vence_en <= ?
    `).run(Date.now());
    return Number(resultado.changes);
  });
}

// Los bloqueos son temporales y solo marcan el horario como "en proceso"; no lo eliminan del calendario.
function horariosBloqueados(canchaId, fecha) {
  limpiarBloqueosVencidos();
  return new Set(db.prepare(`
    SELECT hora_inicio
    FROM horarios_bloqueados
    WHERE cancha_id = ? AND fecha = ? AND Bloqueado = 1
  `).all(canchaId, fecha).map((fila) => fila.hora_inicio));
}

function bloquearHorarios({ cancha, fecha, horarios }) {
  return transaccion(() => {
    db.prepare(`
      DELETE FROM reservas
      WHERE estado = 'formulario' AND vence_en <= ?
    `).run(Date.now());

    const existentes = db.prepare(`
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
    db.prepare(`
      INSERT INTO reservas (id, cancha_id, cancha_json, fecha, horarios_json, estado, vence_en)
      VALUES (?, ?, ?, ?, ?, 'formulario', ?)
    `).run(id, cancha.id, JSON.stringify(cancha), fecha, JSON.stringify(horarios), venceEn);

    const insertarHorario = db.prepare(`
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
function renovarBloqueo(id) {
  limpiarBloqueosVencidos();
  const venceEn = Date.now() + DURACION_BLOQUEO_MS;
  const resultado = db.prepare(`
    UPDATE reservas SET vence_en = ?
    WHERE id = ? AND estado = 'formulario' AND vence_en > ?
  `).run(venceEn, id, Date.now());
  return Number(resultado.changes) === 1 ? venceEn : null;
}

function liberarBloqueo(id) {
  const resultado = db.prepare(`
    DELETE FROM reservas WHERE id = ? AND estado = 'formulario'
  `).run(id);
  return Number(resultado.changes) === 1;
}

module.exports = {
  bloquearHorarios,
  horariosBloqueados,
  liberarBloqueo,
  limpiarBloqueosVencidos,
  renovarBloqueo
};
