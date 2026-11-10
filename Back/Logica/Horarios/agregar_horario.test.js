const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

// Pruebas de «Agregar cancha» y «Agregar horario» con una base temporal.
const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-horarios-"));
process.env.CANCHAYA_DB_PATH = path.join(directorioTemporal, "prueba.sqlite");

const app = require("../Pantalla_principal");
const db = require("../../Datos/Reservas/conexion");
const { AgregarHorario } = require("./agregar_horario");

const foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Xa8AAAAASUVORK5CYII=";
let server;
let baseUrl;

/** Hace una solicitud a la API y devuelve el código y el JSON. */
async function api(ruta, { metodo = "GET", token, datos } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (datos) headers["Content-Type"] = "application/json";
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method: metodo, headers, body: datos && JSON.stringify(datos) });
  return { status: respuesta.status, json: await respuesta.json().catch(() => ({})) };
}

function fechaMas(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

/** Registra un complejo, el administrador lo aprueba y devuelve el token del complejo. */
async function complejoAprobado(correo, rif, deportes) {
  assert.equal((await api("/api/complejos/registro", {
    metodo: "POST",
    datos: {
      nombre: "Dueño", cedula: "V-1234567", telefono: "0412-1234567", correo, password: "clave12345",
      nombreComplejo: `Complejo ${rif}`, rif, direccion: "Calle 1, Chacao", zona: "Chacao", deportes
    }
  })).status, 201);
  const admin = (await api("/api/auth/login", { metodo: "POST", datos: { correo: "admin@canchaya.com", password: "admin12345" } })).json.token;
  const id = (await api("/api/admin/solicitudes", { token: admin })).json.solicitudes.find((item) => item.correo === correo).id;
  await api(`/api/admin/solicitudes/${id}/decision`, { metodo: "POST", token: admin, datos: { estado: "Aprobado" } });
  return (await api("/api/auth/login", { metodo: "POST", datos: { correo, password: "clave12345" } })).json.token;
}

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
  db.close();
  fs.rmSync(directorioTemporal, { recursive: true, force: true });
});

test("regla de superposición: chocan si cada uno empieza antes de que termine el otro", () => {
  const agregarHorario = new AgregarHorario();
  const existente = { horaInicio: "18:00", horaFin: "20:00" };
  assert.equal(agregarHorario.seSuperponen({ horaInicio: "19:00", horaFin: "21:00" }, existente), true);
  assert.equal(agregarHorario.seSuperponen({ horaInicio: "17:00", horaFin: "19:00" }, existente), true);
  assert.equal(agregarHorario.seSuperponen({ horaInicio: "18:00", horaFin: "20:00" }, existente), true);
  assert.equal(agregarHorario.seSuperponen({ horaInicio: "20:00", horaFin: "21:00" }, existente), false);
  assert.equal(agregarHorario.seSuperponen({ horaInicio: "16:00", horaFin: "18:00" }, existente), false);
});

test("Agregar cancha y Agregar horario siguen sus reglas", async () => {
  const token = await complejoAprobado("canchas@example.com", "J-11111111-1", ["futbol", "padel"]);
  const otro = await complejoAprobado("otro@example.com", "J-22222222-2", ["tenis"]);

  // Sin canchas: la lista de canchas viene vacía (el navegador muestra «Primero debe agregar una cancha»).
  assert.deepEqual((await api("/api/complejo/horarios", { token })).json.canchas, []);

  // Agregar cancha: deporte que el complejo no ofrece, nombre repetido y cancha válida.
  const cancha = { deporteId: "futbol", nombre: "Cancha 1", ubicacion: "Chacao", capacidad: 12, precioPorHora: 40, foto };
  const noOfrece = await api("/api/complejo/canchas", { metodo: "POST", token, datos: { ...cancha, deporteId: "tenis" } });
  assert.equal(noOfrece.status, 400);
  assert.match(noOfrece.json.error, /no ofrece ese deporte/);
  const creada = await api("/api/complejo/canchas", { metodo: "POST", token, datos: cancha });
  assert.equal(creada.status, 201);
  const canchaId = creada.json.cancha.id;
  assert.equal((await api("/api/complejo/canchas", { metodo: "POST", token, datos: { ...cancha, nombre: "cancha 1" } })).status, 409);
  const canchaOtro = (await api("/api/complejo/canchas", { metodo: "POST", token: otro, datos: { ...cancha, deporteId: "tenis" } })).json.cancha;

  // Paso 2: validar. Vacío, fecha pasada, fin menor que inicio, horas que no son en punto y cancha ajena.
  const vacio = await api("/api/complejo/horarios", { metodo: "POST", token, datos: {} });
  assert.equal(vacio.status, 400);
  assert.deepEqual(Object.keys(vacio.json.errores).sort(), ["canchaId", "fecha", "horaFin", "horaInicio"]);
  const invalido = await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId, fecha: fechaMas(-1), horaInicio: "18:00", horaFin: "17:00" }
  });
  assert.equal(invalido.json.errores.fecha, "La fecha no puede ser anterior a hoy.");
  assert.equal(invalido.json.errores.horaFin, "La hora de fin debe ser mayor que la hora de inicio.");
  const mediaHora = await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId, fecha: fechaMas(2), horaInicio: "18:30", horaFin: "23:00" }
  });
  assert.ok(mediaHora.json.errores.horaInicio && mediaHora.json.errores.horaFin);
  const ajena = await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId: canchaOtro.id, fecha: fechaMas(2), horaInicio: "18:00", horaFin: "20:00" }
  });
  assert.equal(ajena.json.errores.canchaId, "Selecciona una de las canchas de tu complejo.");

  // Paso 4: registrar.
  const fecha = fechaMas(2);
  const registrado = await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId, fecha, horaInicio: "18:00", horaFin: "20:00" }
  });
  assert.equal(registrado.status, 201);
  assert.equal(registrado.json.mensaje, "Horario registrado con éxito");

  // Paso 3: superposición (19 a 21 choca con 18 a 20), pero 20 a 22 no choca.
  const choca = await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId, fecha, horaInicio: "19:00", horaFin: "21:00" }
  });
  assert.equal(choca.status, 409);
  assert.equal(choca.json.superpuesto.horaInicio, "18:00");
  assert.equal(choca.json.superpuesto.horaFin, "20:00");
  assert.equal((await api("/api/complejo/horarios", {
    metodo: "POST", token, datos: { canchaId, fecha, horaInicio: "20:00", horaFin: "22:00" }
  })).status, 201);

  // El jugador ve esas horas en «Ver horarios disponibles», en bloques de una hora.
  const disponibilidad = await api(`/api/canchas/${canchaId}/disponibilidad?fecha=${fecha}`);
  assert.deepEqual(disponibilidad.json.horarios.map((hora) => hora.inicio), ["18:00", "19:00", "20:00", "21:00"]);
  const panel = await api("/api/complejo/horarios", { token });
  assert.equal(panel.json.canchas.length, 1);
  assert.equal(panel.json.horarios.length, 2);

  // Un jugador no puede agregar horarios.
  const jugador = (await api("/api/auth/register", {
    metodo: "POST", datos: { nombre: "Ana Torres", correo: "ana@example.com", password: "clave12345", tipo: "jugador" }
  })).json.token;
  assert.equal((await api("/api/complejo/horarios", { metodo: "POST", token: jugador, datos: {} })).status, 403);
});
