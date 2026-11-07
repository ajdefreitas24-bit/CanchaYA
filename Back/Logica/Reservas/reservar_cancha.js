const db = require("../../Datos/Reservas/conexion");
const {
  liberarBloqueo,
  limpiarBloqueosVencidos,
  renovarBloqueo
} = require("../Horarios/bloquear_horario");
const { validarReserva } = require("./validar_reservas");
const { datosAdministrador, tasaBolivaresPorDolar } = require("../../Datos/Pagos/configuracion");

// Convierte la fila SQL en un objeto cómodo para las rutas HTTP y las pantallas.
function obtenerReserva(id) {
  limpiarBloqueosVencidos();
  const fila = db.prepare("SELECT * FROM reservas WHERE id = ?").get(id);
  if (!fila) return null;
  return {
    ...fila,
    cancha: JSON.parse(fila.cancha_json),
    horarios: JSON.parse(fila.horarios_json),
    jugador: fila.jugador_json ? JSON.parse(fila.jugador_json) : null
  };
}

function validarDatosReserva(id, datos) {
  const reserva = obtenerReserva(id);
  if (!reserva || reserva.estado !== "formulario") {
    return { encontrada: false };
  }

  const resultado = validarReserva(datos, reserva.cancha);
  if (!resultado.valido) {
    return { encontrada: true, valido: false, errores: resultado.errores };
  }

  const jugadorJson = JSON.stringify(resultado.datos);
  // Una reserva válida sale del estado temporal: desde aquí el horario queda pendiente del pago.
  const actualizado = db.prepare(`
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
    reserva: obtenerReserva(id),
    pago: {
      precioTotalUsd,
      anticipoBs,
      tasaBolivaresPorDolar,
      datosAdministrador
    }
  };
}

// Las rutas HTTP usan estas funciones para liberar o extender el bloqueo del formulario.
function liberarReserva(id) {
  return liberarBloqueo(id);
}

function extenderReserva(id) {
  return renovarBloqueo(id);
}

module.exports = { extenderReserva, liberarReserva, obtenerReserva, validarDatosReserva };