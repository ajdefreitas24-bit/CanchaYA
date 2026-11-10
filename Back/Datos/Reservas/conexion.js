const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// CANCHAYA_DB_PATH permite probar sin tocar los datos reales; sin esa variable,
// la aplicación usa el archivo SQLite persistente ubicado junto a este módulo.
const datosPath = __dirname;
const databasePath = process.env.CANCHAYA_DB_PATH
  || path.join(datosPath, "canchaya.sqlite");

if (databasePath !== ":memory:") {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const db = new DatabaseSync(databasePath);
// SQLite no aplica las relaciones REFERENCES si esta opción está desactivada.
db.exec("PRAGMA foreign_keys = ON");

// Cada área aporta su esquema. IF NOT EXISTS permite arrancar repetidamente sin
// recrear tablas ni borrar registros ya persistidos.
for (const [directorio, archivo] of [
  ["Reservas", "reservas.sql"],
  ["Horarios", "horarios.sql"],
  ["Pagos", "pagos.sql"],
  ["Usuarios", "usuarios.sql"],
  ["Solicitudes", "solicitudes.sql"],
  ["Canchas", "canchas.sql"],
  ["Complejos", "complejos.sql"]
]) {
  db.exec(fs.readFileSync(path.resolve(datosPath, "..", directorio, archivo), "utf8"));
}

// Migraciones aditivas: instalan campos nuevos en bases antiguas sin reemplazar
// la base ni eliminar información de usuarios, reservas o complejos.
const columnasReserva = new Set(db.prepare("PRAGMA table_info(reservas)").all().map((columna) => columna.name));
if (!columnasReserva.has("jugador_id")) {
  db.exec("ALTER TABLE reservas ADD COLUMN jugador_id TEXT REFERENCES usuarios(id)");
}
if (!columnasReserva.has("complejo_id")) {
  db.exec("ALTER TABLE reservas ADD COLUMN complejo_id TEXT REFERENCES usuarios(id)");
}

const columnasCancha = new Set(db.prepare("PRAGMA table_info(canchas)").all().map((columna) => columna.name));
if (!columnasCancha.has("foto_data")) {
  db.exec("ALTER TABLE canchas ADD COLUMN foto_data TEXT");
}

// Una base creada con la versión anterior (días y horas dentro de la cancha, sin
// administrador) no sirve para esta versión: se avisa en vez de fallar más adelante.
const tablaUsuarios = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
if (columnasCancha.has("dias_json") || !tablaUsuarios.sql.includes("administrador")) {
  throw new Error(
    `La base de datos ${databasePath} es de una versión anterior de CanchaYA. `
    + "Bórrala y vuelve a ejecutar npm start para crear una nueva."
  );
}

const columnasDecision = new Set(db.prepare("PRAGMA table_info(decisiones_reserva)").all().map((columna) => columna.name));
if (!columnasDecision.has("motivo_denegacion")) {
  db.exec("ALTER TABLE decisiones_reserva ADD COLUMN motivo_denegacion TEXT");
}

module.exports = db;
