const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

// Pruebas de «Ver solicitudes» y «Modificar solicitudes» con una base temporal (no toca la base real).
const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-solicitudes-"));
process.env.CANCHAYA_DB_PATH = path.join(directorioTemporal, "prueba.sqlite");

const app = require("../Pantalla_principal");
const db = require("../../Datos/Reservas/conexion");

let server;
let baseUrl;

async function api(ruta, { metodo = "GET", token, datos } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (datos) headers["Content-Type"] = "application/json";
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method: metodo, headers, body: datos && JSON.stringify(datos) });
  return { status: respuesta.status, json: await respuesta.json().catch(() => ({})) };
}

const login = (correo, password = "clave12345") => api("/api/auth/login", { metodo: "POST", datos: { correo, password } });

const solicitudValida = {
  nombre: "Carlos Pérez", cedula: "V-12345678", telefono: "0412-1234567", correo: "carlos@correo.com",
  password: "clave12345", nombreComplejo: "Complejo Los Palos Grandes", rif: "J-12345678-9",
  direccion: "3ra Av. Los Palos Grandes", zona: "Chacao", deportes: ["futbol", "padel"]
};

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

test("Ver y Modificar solicitudes: solo el administrador, y el rechazo necesita motivo", async () => {
  // Dos complejos envían su solicitud (historia Registrar complejo).
  await api("/api/complejos/registro", { metodo: "POST", datos: solicitudValida });
  await api("/api/complejos/registro", {
    metodo: "POST", datos: { ...solicitudValida, correo: "rechazo@correo.com", rif: "J-87654321-0", nombreComplejo: "Complejo Rechazado" }
  });
  const jugador = (await api("/api/auth/register", {
    metodo: "POST", datos: { nombre: "Ana Torres", correo: "ana@correo.com", password: "clave12345", tipo: "jugador" }
  })).json.token;
  assert.equal((await api("/api/admin/solicitudes")).status, 401);
  assert.equal((await api("/api/admin/solicitudes", { token: jugador })).status, 403);

  const admin = (await login("admin@canchaya.com", "admin12345")).json;
  assert.equal(admin.usuario.tipo, "administrador");
  const lista = (await api("/api/admin/solicitudes", { token: admin.token })).json;
  assert.equal(lista.pendientes, 2);
  const aprobar = lista.solicitudes.find((item) => item.correo === "carlos@correo.com");
  const rechazar = lista.solicitudes.find((item) => item.correo === "rechazo@correo.com");
  const detalle = (await api(`/api/admin/solicitudes/${aprobar.id}`, { token: admin.token })).json;
  assert.equal(detalle.rif, "J-12345678-9");
  assert.deepEqual(detalle.deportes, ["Fútbol", "Pádel"]);
  assert.equal((await api("/api/admin/solicitudes/no-existe", { token: admin.token })).status, 404);

  // Rechazar sin motivo no se permite; con motivo sí, y el dueño lo ve al intentar entrar.
  const decision = (id, datos) => api(`/api/admin/solicitudes/${id}/decision`, { metodo: "POST", token: admin.token, datos });
  assert.equal((await decision(rechazar.id, { estado: "Rechazado" })).status, 400);
  assert.equal((await decision(rechazar.id, { estado: "Otro" })).status, 400);
  assert.equal((await decision(rechazar.id, { estado: "Rechazado", motivo: "El RIF no coincide." })).status, 200);
  assert.equal((await decision(rechazar.id, { estado: "Aprobado" })).status, 409);
  const rechazado = await login("rechazo@correo.com");
  assert.equal(rechazado.status, 403);
  assert.match(rechazado.json.error, /El RIF no coincide/);

  // Aprobar: el dueño ya puede entrar con la cuenta del complejo.
  assert.equal((await decision(aprobar.id, { estado: "Aprobado" })).status, 200);
  const aprobado = await login("carlos@correo.com");
  assert.equal(aprobado.status, 200);
  assert.equal(aprobado.json.usuario.tipo, "complejo");
  assert.equal((await api("/api/admin/solicitudes", { token: admin.token })).json.pendientes, 0);
});
