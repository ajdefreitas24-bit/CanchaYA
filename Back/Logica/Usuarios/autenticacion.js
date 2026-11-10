const crypto = require("node:crypto");
const db = require("../../Datos/Reservas/conexion");
const administrador = require("../../Datos/Usuarios/administrador");

const DURACION_SESION_MS = 7 * 24 * 60 * 60 * 1000;
const LONGITUD_HASH = 64;

/**
 * Servicio de identidad: crea cuentas, compara contraseñas sin comparación
 * ordinaria de strings y gestiona tokens aleatorios guardados como hashes.
 */
class AuthenticationService {
  /** Permite inyectar una base SQLite alternativa, por ejemplo una base aislada de pruebas. */
  constructor(database = db) {
    this.db = database;
  }

  /** Deriva un hash de contraseña usando un salt individual por usuario. */
  hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, LONGITUD_HASH).toString("hex");
  }

  /** Reduce el objeto de cuenta a los campos que pueden salir por la API. */
  usuarioPublico(usuario) {
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      tipo: usuario.tipo
    };
  }

  /** Genera salt e identificador, persiste el hash y retorna solo datos públicos. */
  crearUsuario({ nombre, correo, password, tipo }) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = this.hashPassword(password, salt);
    const id = crypto.randomUUID();

    this.db.prepare(`
      INSERT INTO usuarios (id, nombre, correo, tipo, password_hash, password_salt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, nombre, correo, tipo, passwordHash, salt);

    return this.usuarioPublico({ id, nombre, correo, tipo });
  }

  /** Busca la cuenta y verifica su hash con comparación de tiempo constante. */
  autenticarUsuario(correo, password) {
    const usuario = this.db.prepare(`
      SELECT id, nombre, correo, tipo, password_hash, password_salt
      FROM usuarios
      WHERE correo = ?
    `).get(correo);

    if (!usuario) return null;

    const hashRecibido = Buffer.from(this.hashPassword(password, usuario.password_salt), "hex");
    const hashGuardado = Buffer.from(usuario.password_hash, "hex");
    return hashRecibido.length === hashGuardado.length
      && crypto.timingSafeEqual(hashRecibido, hashGuardado)
      ? this.usuarioPublico(usuario)
      : null;
  }

  /** Crea un token bearer, almacena su SHA-256 y elimina sesiones ya vencidas. */
  crearSesion(usuarioId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const venceEn = Date.now() + DURACION_SESION_MS;

    this.db.prepare("DELETE FROM sesiones WHERE vence_en <= ?").run(Date.now());
    this.db.prepare("INSERT INTO sesiones (token_hash, usuario_id, vence_en) VALUES (?, ?, ?)")
      .run(tokenHash, usuarioId, venceEn);

    return { token, venceEn };
  }

  /** Resuelve el token a usuario público y borra la sesión si ya expiró. */
  obtenerUsuarioDeSesion(token) {
    if (typeof token !== "string" || token.length > 100) return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const sesion = this.db.prepare(`
      SELECT u.id, u.nombre, u.correo, u.tipo, s.vence_en
      FROM sesiones s
      JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?
    `).get(tokenHash);

    if (!sesion) return null;
    if (sesion.vence_en <= Date.now()) {
      this.db.prepare("DELETE FROM sesiones WHERE token_hash = ?").run(tokenHash);
      return null;
    }
    return this.usuarioPublico(sesion);
  }

  /** Revoca el token indicado sin guardar el token original en la base. */
  eliminarSesion(token) {
    if (typeof token !== "string" || token.length > 100) return;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    this.db.prepare("DELETE FROM sesiones WHERE token_hash = ?").run(tokenHash);
  }

  /**
   * Regla de Registrar complejo: la cuenta del dueño se activa cuando el
   * administrador aprueba el complejo. Devuelve el mensaje que impide entrar,
   * o null si la cuenta puede iniciar sesión.
   */
  motivoDeCuentaInactiva(usuario) {
    if (usuario.tipo !== "complejo") return null;
    const complejo = this.db.prepare("SELECT estado, motivo_rechazo FROM complejos WHERE usuario_id = ?").get(usuario.id);
    if (!complejo || complejo.estado === "Aprobado") return null;
    if (complejo.estado === "Rechazado") {
      return `La solicitud de tu complejo fue rechazada. Motivo: ${complejo.motivo_rechazo}`;
    }
    return "Tu complejo está pendiente de aprobación. Podrás entrar cuando el administrador lo apruebe.";
  }

  /** Crea la cuenta del administrador la primera vez que arranca el servidor. */
  crearAdministradorSiNoExiste() {
    const existe = this.db.prepare("SELECT 1 FROM usuarios WHERE tipo = 'administrador'").get();
    if (existe) return false;
    this.crearUsuario({ ...administrador, tipo: "administrador" });
    console.log(`Se creó la cuenta del administrador: ${administrador.correo}`);
    return true;
  }

  /**
   * Rutas de sesión (compartidas por todas las historias): crear cuenta de jugador,
   * iniciar sesión, consultar la sesión actual y cerrarla.
   */
  registrarRutas(servidor) {
    const { app } = servidor;

    // Comprueba si el navegador presenta una sesión válida sin exigir autenticación.
    app.get("/api/auth/session", (req, res) => {
      res.json({ usuario: this.obtenerUsuarioDeSesion(servidor.leerTokenSesion(req)) });
    });

    // Registra una cuenta de jugador. Las cuentas de complejo se crean con la
    // historia «Registrar complejo» y la del administrador se crea sola.
    app.post("/api/auth/register", (req, res) => {
      const { nombre, correo, password, tipo = "jugador" } = req.body || {};
      const nombreNormalizado = typeof nombre === "string" ? nombre.trim() : "";
      const correoNormalizado = typeof correo === "string" ? correo.trim().toLowerCase() : "";

      if (nombreNormalizado.length < 2 || nombreNormalizado.length > 80) {
        return res.status(400).json({ error: "El nombre debe tener entre 2 y 80 caracteres." });
      }
      if (correoNormalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado)) {
        return res.status(400).json({ error: "Escribe un correo electrónico válido." });
      }
      if (typeof password !== "string" || password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "La contraseña debe tener entre 8 y 128 caracteres." });
      }
      if (tipo !== "jugador") {
        return res.status(400).json({ error: "Para registrar un complejo usa la opción «Registrar mi complejo»." });
      }

      try {
        const usuario = this.crearUsuario({ nombre: nombreNormalizado, correo: correoNormalizado, password, tipo });
        const sesion = this.crearSesion(usuario.id);
        servidor.limpiarCookieSesion(res, req);
        return res.status(201).json({ usuario, token: sesion.token });
      } catch (error) {
        if (error.message.includes("UNIQUE constraint failed: usuarios.correo")) {
          return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
        }
        throw error;
      }
    });

    // Verifica credenciales y emite una sesión independiente para la pestaña.
    app.post("/api/auth/login", (req, res) => {
      const { correo, password } = req.body || {};
      const correoNormalizado = typeof correo === "string" ? correo.trim().toLowerCase() : "";
      if (correoNormalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado)
        || typeof password !== "string" || password.length > 128) {
        return res.status(400).json({ error: "Escribe tu correo y contraseña." });
      }

      const usuario = this.autenticarUsuario(correoNormalizado, password);
      if (!usuario) {
        return res.status(401).json({ error: "El correo o la contraseña no son correctos." });
      }
      const motivo = this.motivoDeCuentaInactiva(usuario);
      if (motivo) {
        return res.status(403).json({ error: motivo });
      }

      const sesion = this.crearSesion(usuario.id);
      servidor.limpiarCookieSesion(res, req);
      res.json({ usuario, token: sesion.token });
    });

    // Elimina tokens recibidos por bearer o cookie y responde sin cuerpo.
    app.post("/api/auth/logout", (req, res) => {
      this.eliminarSesion(servidor.leerTokenSesion(req));
      this.eliminarSesion(servidor.leerCookie(req, "canchaya_session"));
      servidor.limpiarCookieSesion(res, req);
      res.status(204).end();
    });
  }
}

const authenticationService = new AuthenticationService();

// Se exportan funciones enlazadas para conservar compatibilidad con las rutas actuales.
module.exports = {
  AuthenticationService,
  authenticationService,
  autenticarUsuario: authenticationService.autenticarUsuario.bind(authenticationService),
  crearSesion: authenticationService.crearSesion.bind(authenticationService),
  crearUsuario: authenticationService.crearUsuario.bind(authenticationService),
  eliminarSesion: authenticationService.eliminarSesion.bind(authenticationService),
  obtenerUsuarioDeSesion: authenticationService.obtenerUsuarioDeSesion.bind(authenticationService)
};
