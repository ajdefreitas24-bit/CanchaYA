const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

// Pruebas de «Registrar complejo» con una base temporal (no toca la base real).
const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-complejos-"));
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

test("Registrar complejo sigue su diagrama", async () => {
  // Paso 1: zonas de Caracas y los 5 deportes permitidos.
  const formulario = await api("/api/complejos/formulario");
  assert.deepEqual(formulario.json.deportes.map((deporte) => deporte.id), ["futbol", "basket", "padel", "beisbol", "tenis"]);
  assert.ok(formulario.json.zonas.includes("Chacao"));

  // Paso 2: datos vacíos o con formato inválido.
  const vacio = await api("/api/complejos/registro", { metodo: "POST", datos: {} });
  assert.equal(vacio.status, 400);
  assert.equal(Object.keys(vacio.json.errores).length, 10);
  const formatos = await api("/api/complejos/registro", {
    metodo: "POST", datos: { ...solicitudValida, cedula: "12345678", telefono: "04121234567", correo: "carlos@", rif: "J123" }
  });
  assert.deepEqual(Object.keys(formatos.json.errores).sort(), ["cedula", "correo", "rif", "telefono"]);
  assert.equal((await api("/api/complejos/registro", { metodo: "POST", datos: { ...solicitudValida, deportes: ["voleibol"] } })).json.errores.deportes,
    "Selecciona al menos un deporte de la lista.");

  // Pasos 4 y 5: se crea la cuenta y la solicitud queda pendiente.
  const registro = await api("/api/complejos/registro", { metodo: "POST", datos: solicitudValida });
  assert.equal(registro.status, 201);
  assert.equal(registro.json.mensaje, "Solicitud enviada, pendiente de aprobación");
  const guardado = db.prepare(`
    SELECT c.estado, u.tipo, u.password_hash FROM complejos c JOIN usuarios u ON u.id = c.usuario_id WHERE c.rif = ?
  `).get("J-12345678-9");
  assert.equal(guardado.estado, "Pendiente de aprobación");
  assert.equal(guardado.tipo, "complejo");
  assert.notEqual(guardado.password_hash, "clave12345");

  // Paso 3: correo y RIF ya registrados (se indica cuál de los dos).
  const repetido = await api("/api/complejos/registro", { metodo: "POST", datos: { ...solicitudValida, correo: "CARLOS@correo.com" } });
  assert.equal(repetido.status, 409);
  assert.deepEqual(Object.keys(repetido.json.errores).sort(), ["correo", "rif"]);
  const soloRif = await api("/api/complejos/registro", { metodo: "POST", datos: { ...solicitudValida, correo: "nuevo@correo.com" } });
  assert.deepEqual(Object.keys(soloRif.json.errores), ["rif"]);

  // Pendiente de aprobación: no puede entrar y por eso no publica canchas que salgan en las búsquedas.
  const pendiente = await login("carlos@correo.com");
  assert.equal(pendiente.status, 403);
  assert.match(pendiente.json.error, /pendiente de aprobación/);
  assert.deepEqual((await api("/api/canchas/zona/Chacao")).json, []);
});
