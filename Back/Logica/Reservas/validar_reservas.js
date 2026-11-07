// Valida tipos y coherencia de los datos antes de cambiar la reserva a espera de pago.
function validarReserva(datos, cancha) {
  const errores = {};
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  const cedula = typeof datos.cedula === "string" ? datos.cedula.trim() : "";
  const correo = typeof datos.correo === "string" ? datos.correo.trim() : "";
  const telefono = typeof datos.telefono === "string" ? datos.telefono.trim() : "";
  const jugadores = Number(datos.jugadores);
  const capacidad = String(cancha.capacidad);
  const equipos = capacidad.match(/(\d+)\s*vs\.\s*(\d+)/i);
  // En deportes por equipos se suman ambos lados; en los demás se usa la capacidad indicada.
  const maximoJugadores = equipos
    ? Number(equipos[1]) + Number(equipos[2])
    : Math.max(1, ...(capacidad.match(/\d+/g) || ["1"]).map(Number));

  if (!/^[\p{L}][\p{L}\s'-]{1,79}$/u.test(nombre)) {
    errores.nombre = "Escribe un nombre válido, sin números (mínimo 2 letras).";
  }
  if (!/^\d{6,10}$/.test(cedula)) {
    errores.cedula = "La cédula debe tener entre 6 y 10 dígitos, sin letras.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
    errores.correo = "Escribe un correo electrónico válido.";
  }
  if (!/^\+?\d{10,15}$/.test(telefono.replace(/[\s()-]/g, ""))) {
    errores.telefono = "El teléfono debe contener entre 10 y 15 dígitos.";
  }
  if (!Number.isInteger(jugadores) || jugadores < 1 || jugadores > maximoJugadores) {
    errores.jugadores = `Indica un número entero entre 1 y ${maximoJugadores}.`;
  }

  return {
    valido: Object.keys(errores).length === 0,
    errores,
    datos: { nombre, cedula, correo, telefono, jugadores }
  };
}

module.exports = { validarReserva };