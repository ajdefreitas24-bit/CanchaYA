const db = require("../../Datos/Reservas/conexion");
const deportes = require("../../Datos/Canchas/catalogo");

/**
 * Historia «Ver solicitudes» (épica Complejos).
 * El administrador de CanchaYA ve las solicitudes de registro de complejos,
 * primero las pendientes, y puede abrir el detalle de cada una.
 */
class VerSolicitudes {
  constructor(database = db) {
    this.db = database;
  }

  /** Convierte una fila de complejos + usuarios en el objeto que usa el navegador. */
  aSolicitud(fila) {
    const idsDeportes = JSON.parse(fila.deportes_json);
    return {
      id: fila.usuario_id,
      nombreComplejo: fila.nombre_complejo,
      correo: fila.correo,
      rif: fila.rif,
      direccion: fila.direccion,
      zona: fila.zona,
      deportes: deportes.filter((deporte) => idsDeportes.includes(deporte.id)).map((deporte) => deporte.nombre),
      dueno: { nombre: fila.dueno_nombre, cedula: fila.dueno_cedula, telefono: fila.dueno_telefono },
      estado: fila.estado,
      motivoRechazo: fila.motivo_rechazo,
      solicitadoEn: fila.solicitado_en,
      revisadoEn: fila.revisado_en
    };
  }

  /** Todas las solicitudes: primero las pendientes y, dentro de cada grupo, las más viejas. */
  listar() {
    return this.db.prepare(`
      SELECT c.*, u.nombre AS nombre_complejo, u.correo
      FROM complejos c
      JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY c.estado <> 'Pendiente de aprobación', c.solicitado_en
    `).all().map((fila) => this.aSolicitud(fila));
  }

  /** Una solicitud por el id de la cuenta del complejo, o null. */
  buscar(id) {
    const fila = this.db.prepare(`
      SELECT c.*, u.nombre AS nombre_complejo, u.correo
      FROM complejos c
      JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.usuario_id = ?
    `).get(id);
    return fila ? this.aSolicitud(fila) : null;
  }

  registrarRutas(servidor) {
    const { app } = servidor;

    app.get("/api/admin/solicitudes", servidor.requerirAdministrador, (req, res) => {
      const solicitudes = this.listar();
      res.json({
        pendientes: solicitudes.filter((solicitud) => solicitud.estado === "Pendiente de aprobación").length,
        solicitudes
      });
    });

    app.get("/api/admin/solicitudes/:id", servidor.requerirAdministrador, (req, res) => {
      const solicitud = this.buscar(req.params.id);
      if (!solicitud) {
        return res.status(404).json({ error: "No se encontró esa solicitud." });
      }
      res.json(solicitud);
    });
  }
}

module.exports = { VerSolicitudes };
