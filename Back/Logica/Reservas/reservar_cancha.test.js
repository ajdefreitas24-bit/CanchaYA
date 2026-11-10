const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, test } = require("node:test");

// Toda la integración corre contra archivos temporales para no alterar la base real.
const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-test-"));
process.env.CANCHAYA_DB_PATH = path.join(directorioTemporal, "reservas.sqlite");
process.env.CANCHAYA_PAYMENT_REFERENCES_PATH = path.join(directorioTemporal, "referencias");

const app = require("../Pantalla_principal");
const db = require("../../Datos/Reservas/conexion");

let server;
let baseUrl;
let cookieJugador;
const firmaPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Xa8AAAAASUVORK5CYII=";
const fotoCancha = `data:image/png;base64,${firmaPng}`;

/** Registra un complejo con su solicitud, lo aprueba el administrador y devuelve su token. */
async function registrarComplejoAprobado({ nombreComplejo, correo, rif, zona, deportes }) {
  const solicitud = await fetch(`${baseUrl}/api/complejos/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Dueño de Prueba", cedula: "V-12345678", telefono: "0412-1234567",
      correo, password: "partido-seguro", nombreComplejo, rif,
      direccion: "Avenida principal, local 1", zona, deportes
    })
  });
  assert.equal(solicitud.status, 201, await solicitud.clone().text());
  // Mientras está pendiente no puede iniciar sesión.
  assert.equal((await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, password: "partido-seguro" })
  })).status, 403);
  const admin = await (await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo: "admin@canchaya.com", password: "admin12345" })
  })).json();
  const { solicitudes } = await (await fetch(`${baseUrl}/api/admin/solicitudes`, {
    headers: { Authorization: `Bearer ${admin.token}` }
  })).json();
  const id = solicitudes.find((item) => item.correo === correo).id;
  assert.equal((await fetch(`${baseUrl}/api/admin/solicitudes/${id}/decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "Aprobado" })
  })).status, 200);
  const inicio = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, password: "partido-seguro" })
  });
  assert.equal(inicio.status, 200);
  return (await inicio.json()).token;
}

after(async () => {
  // Cierra conexiones antes de eliminar el directorio aislado de esta prueba.
  if (server) {
    server.close();
    await once(server, "close");
  }
  db.close();
  fs.rmSync(directorioTemporal, { recursive: true, force: true });
});

// Recorre el ciclo integrado de cuentas, permisos, alta de cancha, reserva,
// validación, carga del comprobante, decisión del complejo y cancelación.
test("bloquea varios horarios, valida la reserva, conserva el pago pendiente y libera al cancelar", async () => {
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registrarJugador = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "María Pérez",
      correo: "maria@example.com",
      password: "partido-seguro",
      tipo: "jugador"
    })
  });
  assert.equal(registrarJugador.status, 201);
  const usuarioJugador = await registrarJugador.json();
  assert.equal(usuarioJugador.usuario.tipo, "jugador");
  cookieJugador = usuarioJugador.token;
  const credencialesGuardadas = db.prepare(
    "SELECT password_hash, password_salt FROM usuarios WHERE correo = ?"
  ).get("maria@example.com");
  assert.notEqual(credencialesGuardadas.password_hash, "partido-seguro");
  assert.ok(credencialesGuardadas.password_salt);

  assert.equal((await fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  })).status, 401);

  const sesionJugador = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  assert.equal((await sesionJugador.json()).usuario.correo, "maria@example.com");
  assert.equal((await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Otra cuenta",
      correo: "MARIA@example.com",
      password: "partido-seguro",
      tipo: "jugador"
    })
  })).status, 409);
  // Las cuentas de complejo no se crean aquí: se crean con «Registrar mi complejo».
  assert.equal((await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Complejo directo",
      correo: "directo@example.com",
      password: "partido-seguro",
      tipo: "complejo"
    })
  })).status, 400);

  const cookieComplejo = await registrarComplejoAprobado({
    nombreComplejo: "Complejo Deportivo Montalbán",
    correo: "complejo@example.com",
    rif: "J-12345678-9",
    zona: "Montalbán",
    deportes: ["futbol", "basket"]
  });
  const cookieComplejoAjeno = await registrarComplejoAprobado({
    nombreComplejo: "Complejo de Otra Zona",
    correo: "otro-complejo@example.com",
    rif: "J-87654321-0",
    zona: "Chacao",
    deportes: ["futbol"]
  });
  assert.equal((await fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  })).status, 403);

  const inicioIncorrecto = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo: "maria@example.com", password: "incorrecta" })
  });
  assert.equal(inicioIncorrecto.status, 401);
  const inicioJugador = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo: "MARIA@example.com", password: "partido-seguro" })
  });
  assert.equal(inicioJugador.status, 200);
  cookieJugador = (await inicioJugador.json()).token;
  assert.equal((await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).usuario.tipo, "jugador");
  assert.equal((await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  })).json()).usuario.tipo, "complejo");

  const catalogo = await (await fetch(`${baseUrl}/api/deportes`)).json();
  assert.equal(catalogo.deportes.length, 5);
  assert.equal(catalogo.cantidadCanchas, 0);

  const ubicaciones = await (await fetch(`${baseUrl}/api/ubicaciones`)).json();
  assert.ok(ubicaciones.ubicaciones.includes("Montalbán"));
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  const fechaReserva = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  const canchaInvalida = await fetch(`${baseUrl}/api/complejo/canchas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deporteId: "futbol",
      nombre: "Cancha fuera de Caracas",
      ubicacion: "Maiquetía",
      capacidad: 20,
      precioPorHora: 45,
    })
  });
  assert.equal(canchaInvalida.status, 400);
  const nuevaCancha = await fetch(`${baseUrl}/api/complejo/canchas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deporteId: "futbol",
      nombre: "Cancha de Prueba",
      ubicacion: "Montalbán",
      capacidad: 22,
      precioPorHora: 45,
      foto: fotoCancha
    })
  });
  assert.equal(nuevaCancha.status, 201);
  const canchaCreada = (await nuevaCancha.json()).cancha;
  const canchaId = canchaCreada.id;
  assert.ok(canchaCreada.fotoUrl);
  assert.equal((await fetch(`${baseUrl}${canchaCreada.fotoUrl}`)).status, 200);
  assert.equal(canchaCreada.complejo, "Complejo Deportivo Montalbán");
  assert.equal(canchaCreada.ubicacion, "Montalbán, Caracas, Venezuela");
  assert.equal(canchaCreada.capacidadPersonas, 22);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/complejo/canchas`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  })).json()).canchas.map((cancha) => cancha.id), [canchaId]);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/complejo/canchas`, {
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}` }
  })).json()).canchas, []);
  const edicionCancha = await fetch(`${baseUrl}/api/complejo/canchas/${canchaId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deporteId: "futbol",
      nombre: "Cancha de Prueba Editada",
      ubicacion: "Montalbán",
      capacidad: 24,
      precioPorHora: 50,
    })
  });
  assert.equal(edicionCancha.status, 200);
  const canchaEditada = (await edicionCancha.json()).cancha;
  assert.equal(canchaEditada.nombre, "Cancha de Prueba Editada");
  assert.equal((await fetch(`${baseUrl}${canchaEditada.fotoUrl}`)).status, 200);
  const edicionAjena = await fetch(`${baseUrl}/api/complejo/canchas/${canchaId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deporteId: "futbol",
      nombre: "Cancha ajena",
      ubicacion: canchaCreada.ubicacionSector,
      capacidad: 22,
      precioPorHora: 45,
    })
  });
  assert.equal(edicionAjena.status, 404, await edicionAjena.text());
  assert.equal((await (await fetch(`${baseUrl}/api/deportes`)).json()).cantidadCanchas, 1);
  assert.equal((await (await fetch(`${baseUrl}/api/canchas?deporte=futbol`)).json()).length, 1);
  assert.equal((await (await fetch(`${baseUrl}/api/canchas/zona/${encodeURIComponent("Montalbán")}`)).json()).length, 1);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/canchas/zona/Chacao`)).json(), []);
  assert.equal((await fetch(`${baseUrl}/api/canchas/zona/FueraDeCaracas`)).status, 400);
  const canchaOtroDeporte = await fetch(`${baseUrl}/api/complejo/canchas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deporteId: "basket",
      nombre: "Cancha de Basket",
      ubicacion: "Montalbán",
      capacidad: 12,
      precioPorHora: 30,
      foto: fotoCancha
    })
  });
  assert.equal(canchaOtroDeporte.status, 201);
  assert.equal((await (await fetch(`${baseUrl}/api/canchas/zona/${encodeURIComponent("Montalbán")}`)).json()).length, 2);
  assert.equal((await (await fetch(`${baseUrl}/api/canchas?deporte=basket`)).json()).length, 1);

  // Sin horarios registrados, la cancha no tiene horas disponibles.
  assert.deepEqual((await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios, []);
  const agregarHorario = await fetch(`${baseUrl}/api/complejo/horarios`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ canchaId, fecha: fechaReserva, horaInicio: "08:00", horaFin: "13:00" })
  });
  assert.equal(agregarHorario.status, 201, await agregarHorario.clone().text());

  const disponibilidad = await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json();
  assert.deepEqual(disponibilidad.horarios.map((horario) => horario.inicio), ["08:00", "09:00", "10:00", "11:00", "12:00"]);
  const fechaNoDisponible = new Date(fecha);
  fechaNoDisponible.setDate(fechaNoDisponible.getDate() + 1);
  const fechaNoDisponibleTexto = `${fechaNoDisponible.getFullYear()}-${String(fechaNoDisponible.getMonth() + 1).padStart(2, "0")}-${String(fechaNoDisponible.getDate()).padStart(2, "0")}`;
  assert.deepEqual((await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaNoDisponibleTexto}`
  )).json()).horarios, []);
  const horarioNoPermitido = await fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({ canchaId, fecha: fechaReserva, horarios: ["13:00"] })
  });
  assert.equal(horarioNoPermitido.status, 400);
  const horarios = disponibilidad.horarios.slice(0, 2).map((horario) => horario.inicio);
  assert.equal(horarios.length, 2);

  const solicitarBloqueo = () => fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({ canchaId, fecha: fechaReserva, horarios })
  });
  const primeraRespuesta = await solicitarBloqueo();
  assert.equal(primeraRespuesta.status, 201);
  const primeraReserva = await primeraRespuesta.json();
  const conflicto = await solicitarBloqueo();
  assert.equal(conflicto.status, 409);
  assert.match((await conflicto.json()).error, /este horario está siendo reservado/);

  let horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && slot.bloqueado)));

  await fetch(`${baseUrl}/api/reservas/${primeraReserva.reservaId}/liberar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && !slot.bloqueado)));

  const reservaRespuesta = await solicitarBloqueo();
  const reserva = await reservaRespuesta.json();
  const validacionInvalida = await fetch(`${baseUrl}/api/reservas/${reserva.reservaId}/validar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      nombre: "Jugador 3",
      cedula: "abc",
      correo: "no-es-correo",
      telefono: "letras",
      jugadores: "999"
    })
  });
  assert.equal(validacionInvalida.status, 422);
  const errores = (await validacionInvalida.json()).errores;
  assert.ok(errores.nombre && errores.cedula && errores.correo && errores.telefono && errores.jugadores);
  db.prepare("UPDATE reservas SET vence_en = 0 WHERE id = ?").run(reserva.reservaId);
  assert.equal((await fetch(`${baseUrl}/api/reservas/${reserva.reservaId}`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).status, 404);
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && !slot.bloqueado)));

  const reservaPagoResponse = await solicitarBloqueo();
  const reservaPago = await reservaPagoResponse.json();
  const datosValidos = await fetch(`${baseUrl}/api/reservas/${reservaPago.reservaId}/validar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      nombre: "María Pérez",
      cedula: "12345678",
      correo: "maria@example.com",
      telefono: "04121234567",
      jugadores: "4"
    })
  });
  assert.equal(datosValidos.status, 200);
  const datosConfirmados = await datosValidos.json();
  assert.equal(datosConfirmados.horarios.length, 2);
  assert.equal(datosConfirmados.pago.anticipoBs, 12500);

  const pago = await (await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json();
  assert.equal(pago.administrador.cuenta, "01020000000000000000");
  const imagenTruncada = await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}/referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      imagen: `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")}`,
      nombreArchivo: "referencia.png"
    })
  });
  assert.equal(imagenTruncada.status, 400);
  const referencia = await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}/referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      imagen: `data:image/png;base64,${firmaPng}`,
      nombreArchivo: "comprobante.png"
    })
  });
  assert.equal(referencia.status, 201);
  assert.equal(db.prepare("SELECT estado FROM reservas WHERE id = ?").get(reservaPago.reservaId).estado, "confirmacion_pendiente");
  assert.equal((await fetch(`${baseUrl}/api/jugador/reservaciones/${reservaPago.reservaId}/cancelar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).status, 409);
  assert.equal((await (await fetch(`${baseUrl}/api/jugador/reservas/${reservaPago.reservaId}/estado`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).estado, "confirmacion_pendiente");

  const solicitudesAdmin = await fetch(`${baseUrl}/api/complejo/solicitudes`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  });
  assert.equal(solicitudesAdmin.status, 200);
  assert.equal((await solicitudesAdmin.json()).solicitudes.length, 1);
  const solicitudesAjenas = await fetch(`${baseUrl}/api/complejo/solicitudes`, {
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}` }
  });
  assert.deepEqual((await solicitudesAjenas.json()).solicitudes, []);
  assert.equal((await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaPago.reservaId}`, {
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}` }
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/complejo/solicitudes`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).status, 403);
  const detalleAdmin = await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaPago.reservaId}`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  });
  assert.equal(detalleAdmin.status, 200);
  const solicitudDetalle = await detalleAdmin.json();
  assert.equal(solicitudDetalle.jugador.nombre, "María Pérez");
  assert.equal(solicitudDetalle.cuentaJugador.correo, "maria@example.com");
  const imagenReferencia = await fetch(`${baseUrl}${solicitudDetalle.referenciaUrl}`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  });
  assert.equal(imagenReferencia.status, 200);
  assert.match(imagenReferencia.headers.get("content-type"), /^image\//);
  assert.ok((await imagenReferencia.arrayBuffer()).byteLength > 0);

  const confirmacion = await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaPago.reservaId}/decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "confirmada" })
  });
  assert.equal(confirmacion.status, 200);
  assert.equal((await (await fetch(`${baseUrl}/api/jugador/reservas/${reservaPago.reservaId}/estado`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).estado, "confirmada");
  assert.equal((await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaPago.reservaId}/decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "denegada", motivo: "Cambio de decisión no permitido." })
  })).status, 409);

  const notificaciones = await fetch(`${baseUrl}/api/jugador/notificaciones`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  assert.equal((await notificaciones.json()).notificaciones[0].estado, "confirmada");
  const reservasComplejo = await fetch(`${baseUrl}/api/complejo/reservaciones`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  });
  assert.equal(reservasComplejo.status, 200);
  assert.equal((await reservasComplejo.json()).reservaciones.length, 1);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/complejo/reservaciones`, {
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}` }
  })).json()).reservaciones, []);
  const misReservas = await fetch(`${baseUrl}/api/jugador/reservaciones`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  assert.equal((await misReservas.json()).reservaciones.length, 1);
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => !horariosActuales.some((slot) => slot.inicio === hora)));
  assert.equal((await fetch(`${baseUrl}/api/jugador/reservaciones/${reservaPago.reservaId}/cancelar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  })).status, 403);
  const cancelarReservacion = await fetch(`${baseUrl}/api/jugador/reservaciones/${reservaPago.reservaId}/cancelar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  assert.equal(cancelarReservacion.status, 200);
  assert.match((await cancelarReservacion.json()).mensaje, /no se realizan reembolsos/i);
  assert.equal((await fetch(`${baseUrl}/api/jugador/reservaciones/${reservaPago.reservaId}/cancelar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).status, 409);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/jugador/reservaciones`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).reservaciones, []);
  assert.equal((await (await fetch(`${baseUrl}/api/jugador/notificaciones`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).notificaciones[0].estado, "cancelada");
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && !slot.bloqueado)));
  assert.equal((await (await fetch(`${baseUrl}/api/complejo/reservaciones`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  })).json()).reservaciones[0].estado, "cancelada");
  const notificacionesComplejo = await fetch(`${baseUrl}/api/complejo/solicitudes`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  });
  const notificacionesComplejoJson = await notificacionesComplejo.json();
  assert.equal(notificacionesComplejoJson.cancelaciones.length, 1);
  assert.equal(notificacionesComplejoJson.cancelaciones[0].cuentaJugador.correo, "maria@example.com");
  assert.deepEqual((await (await fetch(`${baseUrl}/api/complejo/solicitudes`, {
    headers: { Authorization: `Bearer ${cookieComplejoAjeno}` }
  })).json()).cancelaciones, []);

  const segundaHora = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios[0].inicio;
  const solicitarRechazo = await fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      canchaId,
      fecha: fechaReserva,
      horarios: [segundaHora]
    })
  });
  assert.equal(solicitarRechazo.status, 201);
  const reservaRechazo = await solicitarRechazo.json();
  const validarRechazo = await fetch(`${baseUrl}/api/reservas/${reservaRechazo.reservaId}/validar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      nombre: "María Pérez",
      cedula: "12345678",
      correo: "maria@example.com",
      telefono: "04121234567",
      jugadores: "4"
    })
  });
  assert.equal(validarRechazo.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/pagos/${reservaRechazo.reservaId}/referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieJugador}` },
    body: JSON.stringify({
      imagen: `data:image/png;base64,${firmaPng}`,
      nombreArchivo: "comprobante-denegado.png"
    })
  })).status, 201);
  const rechazoSinMotivo = await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaRechazo.reservaId}/decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "denegada" })
  });
  assert.equal(rechazoSinMotivo.status, 400);
  const denegar = await fetch(`${baseUrl}/api/complejo/solicitudes/${reservaRechazo.reservaId}/decision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieComplejo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "denegada", motivo: "No se pudo validar la referencia." })
  });
  assert.equal(denegar.status, 200);
  assert.equal((await (await fetch(`${baseUrl}/api/jugador/reservas/${reservaRechazo.reservaId}/estado`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).estado, "denegada");
  const notificacionesActualizadas = await fetch(`${baseUrl}/api/jugador/notificaciones`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  });
  const notificacionesJugadorActualizadas = (await notificacionesActualizadas.json()).notificaciones;
  assert.deepEqual(notificacionesJugadorActualizadas.map((item) => item.estado).sort(), ["cancelada", "denegada"]);
  assert.equal(notificacionesJugadorActualizadas.find((item) => item.estado === "denegada").motivo, "No se pudo validar la referencia.");
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/${canchaId}/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horariosActuales.some((slot) => slot.inicio === segundaHora && !slot.bloqueado));
  assert.equal((await fetch(`${baseUrl}/HTML/Pagos/espera.html`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).status, 204);
  assert.equal((await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${cookieJugador}` }
  })).json()).usuario, null);
  assert.equal((await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${cookieComplejo}` }
  })).json()).usuario.tipo, "complejo");
});
