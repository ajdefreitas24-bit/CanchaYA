const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, test } = require("node:test");

const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-test-"));
process.env.CANCHAYA_DB_PATH = path.join(directorioTemporal, "reservas.sqlite");
process.env.CANCHAYA_PAYMENT_REFERENCES_PATH = path.join(directorioTemporal, "referencias");

const app = require("../Pantalla_principal");
const db = require("../../Datos/Reservas/conexion");

let server;
let baseUrl;

after(async () => {
  if (server) {
    server.close();
    await once(server, "close");
  }
  db.close();
  fs.rmSync(directorioTemporal, { recursive: true, force: true });
});

test("bloquea varios horarios, valida la reserva, conserva el pago pendiente y libera al cancelar", async () => {
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const catalogo = await (await fetch(`${baseUrl}/api/deportes`)).json();
  assert.equal(catalogo.deportes.length, 6);

  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  const fechaReserva = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  const disponibilidad = await (await fetch(
    `${baseUrl}/api/canchas/futbol-1/disponibilidad?fecha=${fechaReserva}`
  )).json();
  const horarios = disponibilidad.horarios.slice(0, 2).map((horario) => horario.inicio);
  assert.equal(horarios.length, 2);

  const solicitarBloqueo = () => fetch(`${baseUrl}/api/reservas/bloquear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canchaId: "futbol-1", fecha: fechaReserva, horarios })
  });
  const primeraRespuesta = await solicitarBloqueo();
  assert.equal(primeraRespuesta.status, 201);
  const primeraReserva = await primeraRespuesta.json();
  const conflicto = await solicitarBloqueo();
  assert.equal(conflicto.status, 409);
  assert.match((await conflicto.json()).error, /este horario está siendo reservado/);

  let horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/futbol-1/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && slot.bloqueado)));

  await fetch(`${baseUrl}/api/reservas/${primeraReserva.reservaId}/liberar`, { method: "POST" });
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/futbol-1/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && !slot.bloqueado)));

  const reservaRespuesta = await solicitarBloqueo();
  const reserva = await reservaRespuesta.json();
  const validacionInvalida = await fetch(`${baseUrl}/api/reservas/${reserva.reservaId}/validar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  assert.equal((await fetch(`${baseUrl}/api/reservas/${reserva.reservaId}`)).status, 404);
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/futbol-1/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && !slot.bloqueado)));

  const reservaPagoResponse = await solicitarBloqueo();
  const reservaPago = await reservaPagoResponse.json();
  const datosValidos = await fetch(`${baseUrl}/api/reservas/${reservaPago.reservaId}/validar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  assert.equal(datosConfirmados.pago.anticipoBs, 11250);

  const pago = await (await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}`)).json();
  assert.equal(pago.administrador.cuenta, "01020000000000000000");
  const imagenTruncada = await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}/referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imagen: `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64")}`,
      nombreArchivo: "referencia.png"
    })
  });
  assert.equal(imagenTruncada.status, 400);
  const firmaPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Xa8AAAAASUVORK5CYII=";
  const referencia = await fetch(`${baseUrl}/api/pagos/${reservaPago.reservaId}/referencia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imagen: `data:image/png;base64,${firmaPng}`,
      nombreArchivo: "comprobante.png"
    })
  });
  assert.equal(referencia.status, 201);
  assert.equal(db.prepare("SELECT estado FROM reservas WHERE id = ?").get(reservaPago.reservaId).estado, "confirmacion_pendiente");

  await fetch(`${baseUrl}/api/reservas/${reservaPago.reservaId}/liberar`, { method: "POST" });
  horariosActuales = (await (await fetch(
    `${baseUrl}/api/canchas/futbol-1/disponibilidad?fecha=${fechaReserva}`
  )).json()).horarios;
  assert.ok(horarios.every((hora) => horariosActuales.some((slot) => slot.inicio === hora && slot.bloqueado)));
  assert.equal((await fetch(`${baseUrl}/HTML/Pagos/espera.html`)).status, 200);
});
