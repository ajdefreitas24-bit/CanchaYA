const db = require("../../Datos/Reservas/conexion");

/**
 * Historia «Modificar solicitudes» (épica Complejos).
 * El administrador aprueba o rechaza una solicitud pendiente. Al aprobarla,
 * la cuenta del dueño se activa y ya puede iniciar sesión y agregar canchas.
 * Para rechazarla debe escribir el motivo, que el dueño ve al intentar entrar.
 */
class ModificarSolicitudes {
  static ESTADOS = ["Aprobado", "Rechazado"];

  constructor(database = db) {
    this.db = database;
  }

  /** Revisa la decisión y el motivo; devuelve el error o null. */
  validar(estado, motivo) {
    if (!ModificarSolicitudes.ESTADOS.includes(estado)) {
      return "Selecciona aprobar o rechazar la solicitud.";
    }
    if (estado === "Rechazado" && (motivo.length < 3 || motivo.length > 500)) {
      return "Escribe el motivo del rechazo (entre 3 y 500 caracteres).";
    }
    return null;
  }

  /** Cambia el estado solo si la solicitud sigue pendiente. Devuelve true si cambió. */
  cambiarEstado(id, estado, motivo) {
    const resultado = this.db.prepare(`
      UPDATE complejos
      SET estado = ?, motivo_rechazo = ?, revisado_en = CURRENT_TIMESTAMP
      WHERE usuario_id = ? AND estado = 'Pendiente de aprobación'
    `).run(estado, estado === "Rechazado" ? motivo : null, id);
    return Number(resultado.changes) === 1;
  }

  registrarRutas(servidor) {
    servidor.app.post("/api/admin/solicitudes/:id/decision", servidor.requerirAdministrador, (req, res) => {
      const estado = req.body?.estado;
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
      const error = this.validar(estado, motivo);
      if (error) {
        return res.status(400).json({ error });
      }
      if (!this.cambiarEstado(req.params.id, estado, motivo)) {
        return res.status(409).json({ error: "Esa solicitud no existe o ya fue revisada." });
      }
      res.json({
        estado,
        mensaje: estado === "Aprobado"
          ? "Solicitud aprobada. El complejo ya puede iniciar sesión."
          : "Solicitud rechazada. El dueño verá el motivo al intentar entrar."
      });
    });
  }
}

module.exports = { ModificarSolicitudes };
