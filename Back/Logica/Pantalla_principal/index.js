const express = require("express");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const deportes = require("../../Datos/Canchas/catalogo");
const {
  bloquearHorarios,
  horariosBloqueados,
  limpiarBloqueosVencidos
} = require("../Horarios/bloquear_horario");
const {
  extenderReserva,
  liberarReserva,
  obtenerReserva,
  validarDatosReserva
} = require("../Reservas/reservar_cancha");
const { guardarReferencia, obtenerPago } = require("../Pagos/registrar_pago");
const { datosAdministrador } = require("../../Datos/Pagos/configuracion");

// Punto de entrada HTTP: publica las pantallas y conecta el navegador con los servicios de reservas y pagos.
const app = express();
const port = Number(process.env.PORT) || 3000;
const frontPath = path.resolve(__dirname, "../../../Front");

app.use(express.json({ limit: "8mb" }));
app.use(express.static(frontPath));

// Las fechas se manejan con la hora local del servidor para evitar cambios de día por zonas horarias.
function fechaLocal(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function parsearFecha(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return null;
  }

  const [anio, mes, dia] = valor.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getFullYear() === anio
    && fecha.getMonth() === mes - 1
    && fecha.getDate() === dia
    ? fecha
    : null;
}

// El catálogo es la fuente de datos temporal hasta integrar la administración y su persistencia.
function buscarCancha(id) {
  for (const deporte of deportes) {
    const cancha = deporte.canchas.find((elemento) => elemento.id === id);
    if (cancha) {
      return { ...cancha, deporte: deporte.nombre, deporteId: deporte.id };
    }
  }
  return null;
}

function horariosDisponibles(fecha) {
  const limite = Date.now() + 2 * 60 * 60 * 1000;
  const horarios = [];
  for (let hora = 7; hora < 22; hora += 1) {
    const inicio = new Date(`${fecha}T${String(hora).padStart(2, "0")}:00:00`);
    if (inicio.getTime() >= limite) {
      horarios.push({
        inicio: `${String(hora).padStart(2, "0")}:00`,
        fin: `${String(hora + 1).padStart(2, "0")}:00`
      });
    }
  }
  return horarios;
}

// Comprueba formato, tamaño y firma del archivo; no confía solo en el tipo MIME del navegador.
function obtenerExtensionImagen(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const coincidencia = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!coincidencia) return null;

  const contenido = Buffer.from(coincidencia[2], "base64");
  if (contenido.length === 0 || contenido.length > 5 * 1024 * 1024) return null;
  if (contenido.toString("base64") !== coincidencia[2]) return null;

  const formato = coincidencia[1];
  const valido = formato === "png"
    ? contenido.length >= 45
      && contenido.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      && contenido.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
    : formato === "jpeg"
      ? contenido.length > 4
        && contenido[0] === 0xff && contenido[1] === 0xd8 && contenido[2] === 0xff
        && contenido.at(-2) === 0xff && contenido.at(-1) === 0xd9
      : contenido.subarray(0, 4).toString() === "RIFF"
        && contenido.subarray(8, 12).toString() === "WEBP"
        && contenido.length >= 30
        && contenido.readUInt32LE(4) + 8 === contenido.length;
  return valido ? { extension: formato === "jpeg" ? "jpg" : formato, contenido } : null;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(frontPath, "HTML", "Pantalla_principal", "index.html"));
});

app.get("/api/deportes", (req, res) => {
  res.json({
    fechaActual: fechaLocal(),
    cantidadCanchas: deportes.reduce((total, deporte) => total + deporte.canchas.length, 0),
    deportes: deportes.map(({ canchas, ...deporte }) => deporte)
  });
});

app.get("/api/canchas", (req, res) => {
  const deporte = deportes.find((elemento) => elemento.id === req.query.deporte);
  if (!deporte) {
    return res.status(400).json({ error: "Selecciona un deporte válido." });
  }

  res.json(deporte.canchas.map((cancha) => ({
    ...cancha,
    deporte: deporte.nombre,
    deporteId: deporte.id
  })));
});

// Devuelve todos los horarios válidos; el bloqueo se informa como estado, no se oculta del calendario.
app.get("/api/canchas/:id/disponibilidad", (req, res) => {
  const cancha = buscarCancha(req.params.id);
  if (!cancha) {
    return res.status(404).json({ error: "No se encontró la cancha." });
  }

  const fecha = parsearFecha(req.query.fecha);
  if (!fecha) {
    return res.status(400).json({ error: "La fecha debe tener el formato AAAA-MM-DD." });
  }

  const hoy = parsearFecha(fechaLocal());
  const diferenciaDias = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
  if (diferenciaDias < 0 || diferenciaDias > 30) {
    return res.status(400).json({ error: "La fecha debe estar entre hoy y los próximos 30 días." });
  }

  const bloqueados = horariosBloqueados(cancha.id, req.query.fecha);
  const horarios = horariosDisponibles(req.query.fecha).map((horario) => ({
    ...horario,
    bloqueado: bloqueados.has(horario.inicio)
  }));
  res.json({ cancha, fecha: req.query.fecha, horarios });
});

app.get("/api/canchas/:id", (req, res) => {
  const cancha = buscarCancha(req.params.id);
  if (!cancha) {
    return res.status(404).json({ error: "No se encontró la cancha." });
  }
  res.json(cancha);
});

app.post("/api/reservas/bloquear", (req, res) => {
  const { canchaId, fecha, horarios } = req.body || {};
  const cancha = buscarCancha(canchaId);
  const fechaValida = parsearFecha(fecha);
  if (!cancha || !fechaValida || !Array.isArray(horarios) || horarios.length === 0
    || horarios.length > 15 || !horarios.every((hora) => typeof hora === "string")
    || new Set(horarios).size !== horarios.length) {
    return res.status(400).json({ error: "Selecciona una cancha, fecha y horarios válidos." });
  }

  const hoy = parsearFecha(fechaLocal());
  const diferenciaDias = Math.round((fechaValida.getTime() - hoy.getTime()) / 86400000);
  if (diferenciaDias < 0 || diferenciaDias > 30) {
    return res.status(400).json({ error: "La fecha debe estar entre hoy y los próximos 30 días." });
  }

  const permitidos = new Set(horariosDisponibles(fecha).map((horario) => horario.inicio));
  if (!horarios.every((hora) => permitidos.has(hora))) {
    return res.status(400).json({ error: "Uno o más horarios ya no están disponibles." });
  }

  const resultado = bloquearHorarios({ cancha, fecha, horarios });
  if (resultado.bloqueado) {
    return res.status(409).json({
      codigo: "HORARIO_BLOQUEADO",
      error: "Error al reservar, este horario está siendo reservado por otro usuario"
    });
  }

  res.status(201).json({
    reservaId: resultado.id,
    venceEn: resultado.venceEn,
    cancha,
    fecha,
    horarios
  });
});

// Rutas de la reserva temporal: consultar, renovar el bloqueo, liberarlo o validar los datos del jugador.
app.get("/api/reservas/:id", (req, res) => {
  const reserva = obtenerReserva(req.params.id);
  if (!reserva || reserva.estado !== "formulario") {
    return res.status(404).json({ error: "El bloqueo de esta reserva venció o ya no está disponible." });
  }
  res.json({
    cancha: reserva.cancha,
    fecha: reserva.fecha,
    horarios: reserva.horarios
  });
});

app.post("/api/reservas/:id/latido", (req, res) => {
  const venceEn = extenderReserva(req.params.id);
  if (!venceEn) {
    return res.status(404).json({ error: "El bloqueo de esta reserva venció." });
  }
  res.json({ venceEn });
});

app.post("/api/reservas/:id/liberar", (req, res) => {
  liberarReserva(req.params.id);
  res.status(204).end();
});

app.post("/api/reservas/:id/validar", (req, res) => {
  const resultado = validarDatosReserva(req.params.id, req.body || {});
  if (!resultado.encontrada) {
    return res.status(409).json({ error: "El bloqueo venció. Selecciona nuevamente tus horarios." });
  }
  if (!resultado.valido) {
    return res.status(422).json({
      error: "Revisa los campos indicados. El formulario se vació para que puedas corregirlos.",
      errores: resultado.errores
    });
  }

  res.json({
    reservaId: resultado.reserva.id,
    cancha: resultado.reserva.cancha,
    fecha: resultado.reserva.fecha,
    horarios: resultado.reserva.horarios,
    pago: resultado.pago
  });
});

app.get("/api/pagos/:id", (req, res) => {
  const resultado = obtenerPago(req.params.id);
  if (!resultado) {
    return res.status(404).json({ error: "No hay un pago pendiente asociado a esta reserva." });
  }
  if (resultado.reserva.estado === "confirmacion_pendiente") {
    return res.status(409).json({ error: "Ya recibimos la referencia de pago de esta reserva." });
  }

  res.json({
    reservaId: resultado.reserva.id,
    pago: resultado.pago,
    administrador: datosAdministrador,
    cancha: JSON.parse(resultado.reserva.cancha_json),
    fecha: resultado.reserva.fecha,
    horarios: JSON.parse(resultado.reserva.horarios_json)
  });
});

app.post("/api/pagos/:id/referencia", async (req, res, next) => {
  const resultado = obtenerPago(req.params.id);
  if (!resultado || resultado.reserva.estado !== "pago_pendiente") {
    return res.status(409).json({ error: "No se puede adjuntar una referencia a esta reserva." });
  }

  const imagen = obtenerExtensionImagen(req.body?.imagen);
  if (!imagen) {
    return res.status(400).json({ error: "Adjunta una imagen PNG, JPG o WEBP de máximo 5 MB." });
  }

  const nombreOriginal = typeof req.body.nombreArchivo === "string"
    ? path.basename(req.body.nombreArchivo).slice(0, 120)
    : "";
  const nombreArchivo = nombreOriginal || `referencia.${imagen.extension}`;
  const referenciaId = crypto.randomUUID();
  const directorioReferencias = process.env.CANCHAYA_PAYMENT_REFERENCES_PATH
    || path.resolve(__dirname, "../../Datos/Pagos/Referencias");
  const rutaImagen = path.join(directorioReferencias, `${referenciaId}.${imagen.extension}`);
  const rutaRelativa = path.relative(path.resolve(__dirname, "../../Datos/Pagos"), rutaImagen);
  await fs.mkdir(directorioReferencias, { recursive: true });

  try {
    await fs.writeFile(rutaImagen, imagen.contenido, { flag: "wx" });
    const guardado = guardarReferencia(
      req.params.id,
      rutaRelativa,
      nombreArchivo,
      resultado.pago.anticipoBs
    );
    if (!guardado) {
      await fs.unlink(rutaImagen);
      return res.status(409).json({ error: "La reserva ya no está esperando el pago." });
    }
    res.status(201).json({ estado: "confirmacion_pendiente" });
  } catch (error) {
    try {
      await fs.unlink(rutaImagen);
    } catch (limpiezaError) {
      if (limpiezaError.code !== "ENOENT") throw limpiezaError;
    }
    next(error);
  }
});

// Una ruta API desconocida devuelve JSON para que el cliente pueda presentar el error.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "La ruta solicitada no existe." });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Ocurrió un error interno. Intenta nuevamente." });
});

if (require.main === module) {
  // Limpia bloqueos cuyo formulario quedó abandonado sin que el navegador notificara la salida.
  const cleanup = setInterval(limpiarBloqueosVencidos, 30 * 1000);
  cleanup.unref();
  app.listen(port, () => {
    console.log(`CanchaYA disponible en http://localhost:${port}`);
  });
}

module.exports = app;
