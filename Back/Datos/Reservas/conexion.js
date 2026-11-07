const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Permite usar un archivo de prueba aislado en tests y una base persistente durante la ejecución normal.
const datosPath = __dirname;
const databasePath = process.env.CANCHAYA_DB_PATH
  || path.join(datosPath, "canchaya.sqlite");

if (databasePath !== ":memory:") {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");

// Cada área aporta su esquema desde su propia carpeta de Datos.
for (const [directorio, archivo] of [
  ["Reservas", "reservas.sql"],
  ["Horarios", "horarios.sql"],
  ["Pagos", "pagos.sql"]
]) {
  db.exec(fs.readFileSync(path.resolve(datosPath, "..", directorio, archivo), "utf8"));
}

module.exports = db;
