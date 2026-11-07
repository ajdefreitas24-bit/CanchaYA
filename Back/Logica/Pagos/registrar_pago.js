const db = require("../../Datos/Reservas/conexion");
const { tasaBolivaresPorDolar } = require("../../Datos/Pagos/configuracion");

// Calcula el anticipo para mostrarlo en la pantalla de pago junto con la información de la reserva.
function obtenerPago(id) {
  const reserva = db.prepare("SELECT * FROM reservas WHERE id = ?").get(id);
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

function guardarReferencia(id, referenciaImagen, nombreArchivo, montoBs) {
  // Cambiar el estado y guardar la referencia en la misma transacción mantiene el bloqueo hasta revisión.
  db.exec("BEGIN IMMEDIATE");
  try {
    const resultado = db.prepare(`
      UPDATE reservas
      SET estado = 'confirmacion_pendiente'
      WHERE id = ? AND estado = 'pago_pendiente'
    `).run(id);

    if (Number(resultado.changes) !== 1) {
      db.exec("ROLLBACK");
      return false;
    }

    db.prepare(`
      INSERT INTO pagos (reserva_id, monto_bs, referencia_imagen, nombre_archivo, estado)
      VALUES (?, ?, ?, ?, 'confirmacion_pendiente')
    `).run(id, montoBs, referenciaImagen, nombreArchivo);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { guardarReferencia, obtenerPago };
