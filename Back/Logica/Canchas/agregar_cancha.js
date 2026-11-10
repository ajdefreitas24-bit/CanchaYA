const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");
const deportes = require("../../Datos/Canchas/catalogo");
const ubicacionesCaracas = require("../../Datos/Canchas/ubicaciones");

/**
 * Historia «Agregar cancha» (épica Canchas).
 * El complejo aprobado registra una cancha con su deporte, nombre, sector,
 * capacidad, precio por hora y foto. Los horarios de la cancha se agregan
 * después con la historia «Agregar horario».
 */
class AgregarCancha {
  /** Recibe la conexión SQLite; en las pruebas se puede usar otra. */
  constructor(database = db) {
    this.db = database;
  }

  /** Busca el complejo de la cuenta: su estado, su zona y los deportes que ofrece. */
  buscarComplejo(usuarioId) {
    const fila = this.db.prepare("SELECT estado, zona, deportes_json FROM complejos WHERE usuario_id = ?").get(usuarioId);
    return fila ? { estado: fila.estado, zona: fila.zona, deportes: JSON.parse(fila.deportes_json) } : null;
  }

  /** Revisa los campos del formulario y devuelve los valores limpios o el primer error. */
  validarDatosCancha(datos, complejo) {
    const { deporteId, nombre, ubicacion, capacidad, precioPorHora } = datos;
    const nombreNormalizado = typeof nombre === "string" ? nombre.trim() : "";
    const capacidadNumero = Number(capacidad);
    const precioNumero = Number(precioPorHora);

    if (!deportes.some((deporte) => deporte.id === deporteId)) {
      return { error: "Selecciona uno de los deportes disponibles." };
    }
    if (complejo && !complejo.deportes.includes(deporteId)) {
      return { error: "Tu complejo no ofrece ese deporte. Elige uno de los que registraste." };
    }
    if (nombreNormalizado.length < 2 || nombreNormalizado.length > 80) {
      return { error: "El nombre de la cancha debe tener entre 2 y 80 caracteres." };
    }
    if (typeof ubicacion !== "string" || !ubicacionesCaracas.includes(ubicacion)) {
      return { error: "Selecciona una ubicación válida de Caracas, Venezuela." };
    }
    if (!Number.isInteger(capacidadNumero) || capacidadNumero < 1 || capacidadNumero > 300) {
      return { error: "La capacidad debe ser un número entero entre 1 y 300 personas." };
    }
    if (!Number.isFinite(precioNumero) || precioNumero < 0.01 || precioNumero > 1000000) {
      return { error: "Indica un precio por hora válido en USD (mayor que 0)." };
    }
    return {
      datos: {
        deporteId,
        nombre: nombreNormalizado,
        ubicacion: `${ubicacion}, Caracas, Venezuela`,
        capacidad: capacidadNumero,
        precioPorHora: precioNumero
      }
    };
  }

  /** Indica si el complejo ya tiene otra cancha con ese nombre (sin importar mayúsculas). */
  existeNombre(complejoId, nombre, idExcluido = "") {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM canchas WHERE complejo_id = ? AND nombre = ? COLLATE NOCASE AND id <> ?
    `).get(complejoId, nombre, idExcluido));
  }

  /** Rutas de la historia: listar, crear y editar las canchas del complejo. */
  registrarRutas(servidor) {
    const { app } = servidor;

    // Lista las canchas del complejo, junto con su zona y los deportes que ofrece.
    app.get("/api/complejo/canchas", servidor.requerirComplejo, (req, res) => {
      const complejo = this.buscarComplejo(req.usuario.id);
      const canchas = this.db.prepare(`
        SELECT id FROM canchas WHERE complejo_id = ? ORDER BY creada_en DESC
      `).all(req.usuario.id).map(({ id }) => servidor.buscarCancha(id));
      res.json({
        canchas,
        zona: complejo?.zona || null,
        deportes: complejo ? complejo.deportes : deportes.map((deporte) => deporte.id)
      });
    });

    // Crea una cancha vinculada al complejo y exige una foto válida.
    app.post("/api/complejo/canchas", servidor.requerirComplejo, (req, res) => {
      const complejo = this.buscarComplejo(req.usuario.id);
      if (complejo && complejo.estado !== "Aprobado") {
        return res.status(403).json({ error: "Tu complejo todavía no está aprobado." });
      }
      const validacion = this.validarDatosCancha(req.body || {}, complejo);
      if (validacion.error) return res.status(400).json({ error: validacion.error });
      const { deporteId, nombre, ubicacion, capacidad, precioPorHora } = validacion.datos;
      const foto = servidor.obtenerExtensionImagen(req.body?.foto);
      if (!foto) {
        return res.status(400).json({ error: "Adjunta una foto PNG, JPG o WEBP de la cancha (máximo 5 MB)." });
      }
      if (this.existeNombre(req.usuario.id, nombre)) {
        return res.status(409).json({ error: "Ya tienes una cancha con ese nombre." });
      }

      const id = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO canchas (id, complejo_id, deporte_id, nombre, ubicacion, capacidad, precio_por_hora, foto_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.usuario.id, deporteId, nombre, ubicacion, capacidad, precioPorHora, req.body.foto);
      res.status(201).json({ cancha: servidor.buscarCancha(id) });
    });

    // Edita una cancha propia; conserva la foto si no se envía una nueva.
    app.patch("/api/complejo/canchas/:id", servidor.requerirComplejo, (req, res) => {
      const complejo = this.buscarComplejo(req.usuario.id);
      const validacion = this.validarDatosCancha(req.body || {}, complejo);
      if (validacion.error) return res.status(400).json({ error: validacion.error });
      const existente = this.db.prepare("SELECT foto_data FROM canchas WHERE id = ? AND complejo_id = ?")
        .get(req.params.id, req.usuario.id);
      if (!existente) {
        return res.status(404).json({ error: "No se encontró una cancha de este complejo con ese identificador." });
      }
      const { deporteId, nombre, ubicacion, capacidad, precioPorHora } = validacion.datos;
      const foto = req.body.foto === undefined ? null : servidor.obtenerExtensionImagen(req.body.foto);
      if (req.body.foto !== undefined && !foto) {
        return res.status(400).json({ error: "La foto debe ser PNG, JPG o WEBP y no superar 5 MB." });
      }
      if (this.existeNombre(req.usuario.id, nombre, req.params.id)) {
        return res.status(409).json({ error: "Ya tienes una cancha con ese nombre." });
      }

      this.db.prepare(`
        UPDATE canchas
        SET deporte_id = ?, nombre = ?, ubicacion = ?, capacidad = ?, precio_por_hora = ?, foto_data = ?
        WHERE id = ? AND complejo_id = ?
      `).run(
        deporteId,
        nombre,
        ubicacion,
        capacidad,
        precioPorHora,
        foto ? req.body.foto : existente.foto_data,
        req.params.id,
        req.usuario.id
      );
      res.json({ cancha: servidor.buscarCancha(req.params.id) });
    });
  }
}

module.exports = { AgregarCancha };
