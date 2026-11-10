const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { after, before, test } = require("node:test");

// Dos pruebas por cada deporte permitido (fútbol, basket, pádel, béisbol y tenis), con una base temporal:
//   1) un complejo que ofrece ese deporte se registra, el administrador lo aprueba y agrega su cancha;
//   2) un jugador busca esa cancha por deporte y por zona, ve sus horas y las aparta.
const directorioTemporal = fs.mkdtempSync(path.join(os.tmpdir(), "canchaya-deportes-"));
process.env.CANCHAYA_DB_PATH = path.join(directorioTemporal, "prueba.sqlite");

const app = require("./index");
const db = require("../../Datos/Reservas/conexion");
const deportes = require("../../Datos/Canchas/catalogo");

const foto = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Xa8AAAAASUVORK5CYII=";
let server;
let baseUrl;
let tokenJugador;
// Lo que crea la prueba 1 de cada deporte y usa la prueba 2.
const creado = new Map();

/** Hace una solicitud a la API y devuelve el código y el JSON. */
async function api(ruta, { metodo = "GET", token, datos } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (datos) headers["Content-Type"] = "application/json";
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method: metodo, headers, body: datos && JSON.stringify(datos) });
  return { status: respuesta.status, json: await respuesta.json().catch(() => ({})) };
}

function fechaDeManana() {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

/** Registra un complejo que ofrece un solo deporte, el administrador lo aprueba y devuelve su token. */
async function complejoAprobado(numero, deporteId) {
  const correo = `complejo${numero}@example.com`;
  const registro = await api("/api/complejos/registro", {
    metodo: "POST",
    datos: {
      nombre: "Dueño de Prueba", cedula: "V-1234567", telefono: "0412-1234567", correo, password: "clave12345",
      nombreComplejo: `Complejo de ${deporteId}`, rif: `J-1000000${numero}-1`,
      direccion: "Calle 1, Chacao", zona: "Chacao", deportes: [deporteId]
    }
  });
  assert.equal(registro.status, 201, JSON.stringify(registro.json));
  const admin = (await api("/api/auth/login", { metodo: "POST", datos: { correo: "admin@canchaya.com", password: "admin12345" } })).json.token;
  const solicitud = (await api("/api/admin/solicitudes", { token: admin })).json.solicitudes.find((item) => item.correo === correo);
  await api(`/api/admin/solicitudes/${solicitud.id}/decision`, { metodo: "POST", token: admin, datos: { estado: "Aprobado" } });
  const inicio = await api("/api/auth/login", { metodo: "POST", datos: { correo, password: "clave12345" } });
  assert.equal(inicio.status, 200);
  return inicio.json.token;
}

before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jugador = await api("/api/auth/register", {
    metodo: "POST", datos: { nombre: "Ana Torres", correo: "ana.deportes@example.com", password: "clave12345", tipo: "jugador" }
  });
  tokenJugador = jugador.json.token;
});

after(async () => {
  server.close();
  await once(server, "close");
  db.close();
  fs.rmSync(directorioTemporal, { recursive: true, force: true });
});

test("el catálogo trae exactamente los cinco deportes permitidos", () => {
  assert.deepEqual(deportes.map((deporte) => deporte.id), ["futbol", "basket", "padel", "beisbol", "tenis"]);
});

deportes.forEach((deporte, indice) => {
  const numero = indice + 1;

  test(`${deporte.nombre} (1 de 2): el complejo se registra, se aprueba y agrega su cancha`, async () => {
    const token = await complejoAprobado(numero, deporte.id);
    const otroDeporte = deportes.find((item) => item.id !== deporte.id).id;

    // Un deporte que el complejo no ofrece se rechaza.
    const noOfrece = await api("/api/complejo/canchas", {
      metodo: "POST", token,
      datos: { deporteId: otroDeporte, nombre: "Cancha ajena al complejo", ubicacion: "Chacao", capacidad: 10, precioPorHora: 30, foto }
    });
    assert.equal(noOfrece.status, 400);
    assert.match(noOfrece.json.error, /no ofrece ese deporte/);

    // Su propio deporte sí se acepta.
    const respuesta = await api("/api/complejo/canchas", {
      metodo: "POST", token,
      datos: { deporteId: deporte.id, nombre: `Cancha de ${deporte.nombre}`, ubicacion: "Chacao", capacidad: 10, precioPorHora: 30, foto }
    });
    assert.equal(respuesta.status, 201, JSON.stringify(respuesta.json));
    assert.equal(respuesta.json.cancha.deporteId, deporte.id);

    // Agregar horario: mañana de 18:00 a 20:00.
    const fecha = fechaDeManana();
    const horario = await api("/api/complejo/horarios", {
      metodo: "POST", token, datos: { canchaId: respuesta.json.cancha.id, fecha, horaInicio: "18:00", horaFin: "20:00" }
    });
    assert.equal(horario.status, 201, JSON.stringify(horario.json));
    creado.set(deporte.id, { canchaId: respuesta.json.cancha.id, fecha });
  });

  test(`${deporte.nombre} (2 de 2): el jugador la busca, ve sus horas y las aparta`, async () => {
    const { canchaId, fecha } = creado.get(deporte.id);

    // Buscar por deporte: solo sale la cancha de ese deporte.
    const porDeporte = await api(`/api/canchas?deporte=${deporte.id}`);
    assert.deepEqual(porDeporte.json.map((cancha) => cancha.id), [canchaId]);
    assert.equal(porDeporte.json[0].deporteId, deporte.id);

    // Buscar por zona: la cancha aparece entre las de Chacao.
    const porZona = await api(`/api/canchas/zona/${encodeURIComponent("Chacao")}`);
    assert.ok(porZona.json.some((cancha) => cancha.id === canchaId));

    // Ver horarios disponibles: dos bloques de una hora.
    const disponibilidad = await api(`/api/canchas/${canchaId}/disponibilidad?fecha=${fecha}`);
    assert.deepEqual(disponibilidad.json.horarios.map((hora) => hora.inicio), ["18:00", "19:00"]);

    // Reservar cancha: las horas elegidas quedan apartadas.
    const bloqueo = await api("/api/reservas/bloquear", {
      metodo: "POST", token: tokenJugador, datos: { canchaId, fecha, horarios: ["18:00", "19:00"] }
    });
    assert.equal(bloqueo.status, 201, JSON.stringify(bloqueo.json));
    const despues = await api(`/api/canchas/${canchaId}/disponibilidad?fecha=${fecha}`);
    assert.ok(despues.json.horarios.every((hora) => hora.bloqueado));
  });
});
