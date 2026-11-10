const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");

/**
 * Historia «Agregar horario» (épica Horarios). Sigue su diagrama de actividades:
 *   1. Buscar si el complejo tiene canchas registradas  -> objeto «Lista de canchas».
 *   2. Validar los datos ingresados (cancha, fecha, hora de inicio y hora de fin).
 *   3. Verificar si el horario se superpone con otro de la misma cancha.
 *   4. Registrar el horario                             -> objeto «Horario».
 * El encargado entra con la cuenta del complejo, desde el panel de su complejo.
 */
class AgregarHorario {
  /** Las horas van en punto, entre las 07:00 y las 22:00. */
  static HORA_MINIMA = 7;
  static HORA_MAXIMA = 22;

  constructor(database = db) {
    this.db = database;
  }

  /** Paso 1 del diagrama: la «Lista de canchas» del complejo. */
  buscarCanchasDelComplejo(complejoId) {
    return this.db.prepare(`
      SELECT id, nombre FROM canchas WHERE complejo_id = ? ORDER BY nombre
    `).all(complejoId).map((fila) => ({ id: fila.id, nombre: fila.nombre }));
  }

  /** Convierte "18:00" en 18; devuelve null si no es una hora en punto permitida. */
  leerHora(valor) {
    if (typeof valor !== "string" || !/^\d{2}:00$/.test(valor)) return null;
    const hora = Number(valor.slice(0, 2));
    return hora >= AgregarHorario.HORA_MINIMA && hora <= AgregarHorario.HORA_MAXIMA ? hora : null;
  }

  /**
   * Paso 2 del diagrama: validar los datos ingresados. Revisa que no falte
   * nada, que la cancha sea del complejo, que la fecha no haya pasado y que la
   * hora de fin sea mayor que la de inicio. Devuelve un error por campo.
   */
  validarDatos(datos, canchas, servidor) {
    const errores = {};
    const canchaId = typeof datos.canchaId === "string" ? datos.canchaId : "";
    const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
    const horaInicio = typeof datos.horaInicio === "string" ? datos.horaInicio : "";
    const horaFin = typeof datos.horaFin === "string" ? datos.horaFin : "";

    if (!canchaId) {
      errores.canchaId = "Selecciona la cancha.";
    } else if (!canchas.some((cancha) => cancha.id === canchaId)) {
      errores.canchaId = "Selecciona una de las canchas de tu complejo.";
    }

    const fechaValida = servidor.parsearFecha(fecha);
    if (!fecha) {
      errores.fecha = "Ingresa la fecha.";
    } else if (!fechaValida) {
      errores.fecha = "La fecha no es válida.";
    } else if (servidor.diasDesdeHoy(fechaValida) < 0) {
      errores.fecha = "La fecha no puede ser anterior a hoy.";
    }

    const inicio = this.leerHora(horaInicio);
    const fin = this.leerHora(horaFin);
    if (!horaInicio) {
      errores.horaInicio = "Ingresa la hora de inicio.";
    } else if (inicio === null) {
      errores.horaInicio = "La hora de inicio debe ser en punto, entre 07:00 y 22:00.";
    }
    if (!horaFin) {
      errores.horaFin = "Ingresa la hora de fin.";
    } else if (fin === null) {
      errores.horaFin = "La hora de fin debe ser en punto, entre 07:00 y 22:00.";
    } else if (inicio !== null && fin <= inicio) {
      errores.horaFin = "La hora de fin debe ser mayor que la hora de inicio.";
    }

    return {
      valido: Object.keys(errores).length === 0,
      errores,
      horario: { canchaId, fecha, horaInicio, horaFin }
    };
  }

  /**
   * Regla de negocio: los horarios de una misma cancha no pueden superponerse.
   * Dos horarios del mismo día chocan si cada uno empieza antes de que termine el otro.
   * Ejemplo: 18:00-20:00 choca con 19:00-21:00, pero no con 20:00-21:00.
   */
  seSuperponen(a, b) {
    return a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
  }

  /** Paso 3 del diagrama: devuelve el horario con el que choca, o null. */
  buscarSuperposicion(horario) {
    const delMismoDia = this.db.prepare(`
      SELECT id, fecha, hora_inicio AS horaInicio, hora_fin AS horaFin
      FROM horarios
      WHERE cancha_id = ? AND fecha = ?
      ORDER BY hora_inicio
    `).all(horario.canchaId, horario.fecha);
    return delMismoDia.find((existente) => this.seSuperponen(horario, existente)) || null;
  }

  /** Paso 4 del diagrama: registra el «Horario». */
  registrar(horario) {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO horarios (id, cancha_id, fecha, hora_inicio, hora_fin)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, horario.canchaId, horario.fecha, horario.horaInicio, horario.horaFin);
    return { id, ...horario };
  }

  /** Horarios de hoy en adelante de todas las canchas del complejo (para su panel). */
  listarHorarios(complejoId, desde) {
    return this.db.prepare(`
      SELECT h.id, h.fecha, h.hora_inicio AS horaInicio, h.hora_fin AS horaFin,
        c.id AS canchaId, c.nombre AS cancha
      FROM horarios h
      JOIN canchas c ON c.id = h.cancha_id
      WHERE c.complejo_id = ? AND h.fecha >= ?
      ORDER BY h.fecha, h.hora_inicio, c.nombre
    `).all(complejoId, desde).map((fila) => ({ ...fila }));
  }

  registrarRutas(servidor) {
    const { app } = servidor;

    // Paso 1: el navegador pregunta si hay canchas antes de mostrar el formulario.
    app.get("/api/complejo/horarios", servidor.requerirComplejo, (req, res) => {
      res.json({
        canchas: this.buscarCanchasDelComplejo(req.usuario.id),
        horarios: this.listarHorarios(req.usuario.id, servidor.fechaLocal())
      });
    });

    // El encargado presiona «Guardar».
    app.post("/api/complejo/horarios", servidor.requerirComplejo, (req, res) => {
      const canchas = this.buscarCanchasDelComplejo(req.usuario.id);

      // Paso 2: validar. [Datos inválidos] -> mostrar los datos faltantes o inválidos.
      const validacion = this.validarDatos(req.body || {}, canchas, servidor);
      if (!validacion.valido) {
        return res.status(400).json({
          error: "Revisa los datos faltantes o inválidos.",
          errores: validacion.errores
        });
      }

      // Paso 3: verificar superposición. [Se superpone] -> mostrar el horario con el que choca.
      const superpuesto = this.buscarSuperposicion(validacion.horario);
      if (superpuesto) {
        return res.status(409).json({
          error: `El horario se superpone con el de ${superpuesto.horaInicio} a ${superpuesto.horaFin} del ${superpuesto.fecha} en esa cancha.`,
          superpuesto
        });
      }

      // Paso 4: registrar y responder el mensaje de éxito.
      const horario = this.registrar(validacion.horario);
      res.status(201).json({ mensaje: "Horario registrado con éxito", horario });
    });
  }
}

module.exports = { AgregarHorario };
