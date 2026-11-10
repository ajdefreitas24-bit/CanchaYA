const express = require("express");
const path = require("node:path");
const deportes = require("../../Datos/Canchas/catalogo");
const ubicacionesCaracas = require("../../Datos/Canchas/ubicaciones");
const db = require("../../Datos/Reservas/conexion");
const { limpiarBloqueosVencidos } = require("../Horarios/bloquear_horario");
const { authenticationService, obtenerUsuarioDeSesion } = require("../Usuarios/autenticacion");

// Una clase por historia de usuario. Cada una registra sus propias rutas.
const { AgregarCancha } = require("../Canchas/agregar_cancha");
const { AgregarHorario } = require("../Horarios/agregar_horario");
const { RegistrarComplejo } = require("../Complejos/registrar_complejo");
const { paymentService } = require("../Pagos/registrar_pago");
const { BuscarPorZona } = require("../Canchas/buscar_por_zona");
const { VerHorariosDisponibles } = require("../Horarios/ver_horarios_disponibles");
const { reservationService } = require("../Reservas/reservar_cancha");
const { CancelarReserva } = require("../Reservas/cancelar_reserva");
const { VerSolicitudes } = require("../Solicitudes/ver_solicitudes");
const { ModificarSolicitudes } = require("../Solicitudes/modificar_solicitudes");
const { VerificarPago } = require("../Pagos/verificar_pago");

/**
 * Servidor HTTP de CanchaYA. Configura Express, sirve el frontend, ofrece los
 * métodos que comparten todas las historias (sesión, fechas, canchas, imágenes)
 * y le pide a cada historia de usuario que registre sus rutas.
 */
class CanchaYAHttpServer {
  constructor() {
    this.app = express();
    this.port = Number(process.env.PORT) || 3000;
    this.frontPath = path.resolve(__dirname, "../../../Front");
    this.app.use(express.json({ limit: "8mb" }));
    this.app.use(express.static(this.frontPath));
    this.requerirJugador = this.requerirTipo("jugador", "Esta acción está disponible para cuentas de jugador.");
    this.requerirComplejo = this.requerirTipo("complejo", "Esta acción está disponible para cuentas de complejo.");
    this.requerirAdministrador = this.requerirTipo("administrador", "Esta acción está disponible solo para el administrador.");

    // Ver horarios disponibles también lo usa Reservar cancha, por eso se guarda aparte.
    this.verHorarios = new VerHorariosDisponibles();
    this.historias = [
      authenticationService, // Sesión (compartida)
      new AgregarCancha(), // Joseph
      new AgregarHorario(), // Joseph
      new RegistrarComplejo(), // Nicole
      paymentService, // Nicole: Pagar adelanto
      new BuscarPorZona(), // Buscar por zona
      this.verHorarios, // Ver horarios disponibles
      reservationService, // Reservar cancha
      new CancelarReserva(), // Cancelar reserva
      new VerSolicitudes(), // Ver solicitudes
      new ModificarSolicitudes(), // Modificar solicitudes
      new VerificarPago() // Complemento: el complejo confirma o deniega el pago
    ];
    this.registrarRutas();
  }

  /** Convierte la fecha del servidor a AAAA-MM-DD sin aplicar desplazamientos UTC. */
  fechaLocal(fecha = new Date()) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    return `${anio}-${mes}-${dia}`;
  }

  /** Valida una fecha civil real y evita que fechas imposibles pasen como válidas. */
  parsearFecha(valor) {
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

  /** Días entre hoy y la fecha indicada (negativo si ya pasó). */
  diasDesdeHoy(fecha) {
    const hoy = this.parsearFecha(this.fechaLocal());
    return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
  }

  /** Busca una cookie por nombre, separando las cookies HTTP recibidas. */
  leerCookie(req, nombre) {
    const cookies = req.headers.cookie || "";
    const cookie = cookies.split(";").map((parte) => parte.trim())
      .find((parte) => parte.startsWith(`${nombre}=`));
    return cookie ? cookie.slice(nombre.length + 1) : null;
  }

  /** Acepta el token bearer usado por las pestañas y como alternativa una cookie. */
  leerTokenSesion(req) {
    const autorizacion = req.headers.authorization || "";
    const coincidencia = /^Bearer ([A-Za-z0-9_-]+)$/.exec(autorizacion);
    return coincidencia ? coincidencia[1] : this.leerCookie(req, "canchaya_session");
  }

  /** Invalida la cookie de sesión anterior al usar el flujo de token por pestaña. */
  limpiarCookieSesion(res, req) {
    const segura = req.secure ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `canchaya_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${segura}`
    );
  }

  /** Middleware de autorización: resuelve la sesión y exige el rol indicado. */
  requerirTipo(tipo, mensaje) {
    return (req, res, next) => {
      const usuario = obtenerUsuarioDeSesion(this.leerTokenSesion(req));
      if (!usuario) {
        return res.status(401).json({ error: "Inicia sesión para continuar." });
      }
      if (usuario.tipo !== tipo) {
        return res.status(403).json({ error: mensaje });
      }
      req.usuario = usuario;
      next();
    };
  }

  // La tabla canchas es la fuente persistente; el catálogo solo resuelve los metadatos del deporte.
  /** Convierte una fila SQL de cancha al objeto público usado por API e interfaz. */
  buscarCancha(id) {
    const fila = db.prepare(`
      SELECT c.*, u.nombre AS complejo
      FROM canchas c
      JOIN usuarios u ON u.id = c.complejo_id
      WHERE c.id = ?
    `).get(id);
    if (!fila) return null;

    const deporte = deportes.find((elemento) => elemento.id === fila.deporte_id);
    if (!deporte) return null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      complejo: fila.complejo,
      complejoId: fila.complejo_id,
      ubicacion: fila.ubicacion,
      ubicacionSector: fila.ubicacion.split(",")[0],
      superficie: "No especificada",
      capacidad: `${fila.capacidad} personas`,
      capacidadPersonas: fila.capacidad,
      precioPorHora: fila.precio_por_hora,
      fotoUrl: fila.foto_data ? `/api/canchas/${encodeURIComponent(fila.id)}/foto` : null,
      deporte: deporte.nombre,
      deporteId: deporte.id,
      icono: deporte.icono
    };
  }

  // Comprueba formato, tamaño y firma del archivo; no confía solo en el tipo MIME del navegador.
  /**
   * Decodifica una imagen PNG/JPEG/WEBP y revisa tamaño y firma del archivo,
   * para no confiar únicamente en el MIME declarado por el navegador.
   */
  obtenerExtensionImagen(dataUrl) {
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

  /**
   * Registra las rutas compartidas (página principal, catálogos y datos de una
   * cancha), luego las de cada historia y al final los manejadores de error.
   */
  registrarRutas() {
    // Entrega el documento principal que inicia la aplicación del navegador.
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(this.frontPath, "HTML", "Pantalla_principal", "index.html"));
    });

    // Catálogo de deportes, conteo de canchas y fecha de referencia del servidor.
    this.app.get("/api/deportes", (req, res) => {
      const conteos = new Map(db.prepare(`
        SELECT deporte_id, COUNT(*) AS cantidad
        FROM canchas
        GROUP BY deporte_id
      `).all().map(({ deporte_id, cantidad }) => [deporte_id, cantidad]));
      res.json({
        fechaActual: this.fechaLocal(),
        cantidadCanchas: [...conteos.values()].reduce((total, cantidad) => total + cantidad, 0),
        deportes: deportes.map((deporte) => ({
          ...deporte,
          cantidadCanchas: conteos.get(deporte.id) || 0
        }))
      });
    });

    // Lista controlada de sectores de Caracas que se puede asignar a una cancha.
    this.app.get("/api/ubicaciones", (req, res) => {
      res.json({ ubicaciones: ubicacionesCaracas });
    });

    // Busca canchas por deporte; el identificador debe pertenecer al catálogo oficial.
    this.app.get("/api/canchas", (req, res) => {
      if (typeof req.query.deporte !== "string" || !deportes.some((deporte) => deporte.id === req.query.deporte)) {
        return res.status(400).json({ error: "Selecciona un deporte válido." });
      }

      const canchas = db.prepare(`
        SELECT id FROM canchas WHERE deporte_id = ? ORDER BY creada_en DESC
      `).all(req.query.deporte).map(({ id }) => this.buscarCancha(id));
      res.json(canchas);
    });

    // Cada historia agrega sus rutas (polimorfismo: todas tienen registrarRutas).
    for (const historia of this.historias) {
      historia.registrarRutas(this);
    }

    // Devuelve una cancha individual en el formato completo de la interfaz.
    this.app.get("/api/canchas/:id", (req, res) => {
      const cancha = this.buscarCancha(req.params.id);
      if (!cancha) {
        return res.status(404).json({ error: "No se encontró la cancha." });
      }
      res.json(cancha);
    });

    // Sirve la foto almacenada en la fila de la cancha con su MIME validado.
    this.app.get("/api/canchas/:id/foto", (req, res) => {
      const fila = db.prepare("SELECT foto_data FROM canchas WHERE id = ?").get(req.params.id);
      if (!fila?.foto_data) {
        return res.status(404).json({ error: "Esta cancha no tiene una foto registrada." });
      }
      const imagen = this.obtenerExtensionImagen(fila.foto_data);
      if (!imagen) {
        return res.status(500).json({ error: "La foto de esta cancha no es válida." });
      }
      res.type(imagen.extension === "jpg" ? "image/jpeg" : `image/${imagen.extension}`).send(imagen.contenido);
    });

    // Una ruta API desconocida devuelve JSON para que el cliente pueda presentar el error.
    this.app.use("/api", (req, res) => {
      res.status(404).json({ error: "La ruta solicitada no existe." });
    });

    this.app.use((error, req, res, next) => {
      console.error(error);
      res.status(500).json({ error: "Ocurrió un error interno. Intenta nuevamente." });
    });
  }

  /** Inicia la limpieza periódica de bloqueos expirados y escucha en el puerto configurado. */
  listen() {
    const cleanup = setInterval(limpiarBloqueosVencidos, 30 * 1000);
    cleanup.unref();
    return this.app.listen(this.port, () => {
      console.log(`CanchaYA disponible en http://localhost:${this.port}`);
    });
  }
}

const application = new CanchaYAHttpServer();
authenticationService.crearAdministradorSiNoExiste();

if (require.main === module) {
  application.listen();
}

module.exports = application.app;
