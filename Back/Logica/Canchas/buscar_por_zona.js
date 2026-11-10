const db = require("../../Datos/Reservas/conexion");
const ubicacionesCaracas = require("../../Datos/Canchas/ubicaciones");

/**
 * Historia «Buscar por zona» (épica Canchas).
 * El jugador elige una zona de Caracas y ve las canchas registradas en ella,
 * sin tener que elegir antes un deporte.
 */
class BuscarPorZona {
  constructor(database = db) {
    this.db = database;
  }

  /** Devuelve las canchas cuyo sector coincide con la zona elegida. */
  buscar(zona, servidor) {
    return this.db.prepare("SELECT id FROM canchas ORDER BY creada_en DESC")
      .all().map(({ id }) => servidor.buscarCancha(id))
      .filter((cancha) => cancha.ubicacionSector === zona);
  }

  registrarRutas(servidor) {
    // La zona debe estar en la lista de sectores de Caracas.
    servidor.app.get("/api/canchas/zona/:zona", (req, res) => {
      if (!ubicacionesCaracas.includes(req.params.zona)) {
        return res.status(400).json({ error: "Selecciona una zona válida de Caracas." });
      }
      res.json(this.buscar(req.params.zona, servidor));
    });
  }
}

module.exports = { BuscarPorZona };
