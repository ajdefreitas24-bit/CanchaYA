const db = require("../../Datos/Reservas/conexion");
const deportes = require("../../Datos/Canchas/catalogo");
const ubicacionesCaracas = require("../../Datos/Canchas/ubicaciones");
const { authenticationService } = require("../Usuarios/autenticacion");

/**
 * Historia «Registrar complejo» (épica Complejos). Sigue su diagrama de actividades:
 *   1. Buscar las zonas de Caracas y los deportes   -> objeto «Lista de zonas y deportes».
 *   2. Validar los datos ingresados.
 *   3. Verificar si el correo o el RIF ya están registrados.
 *   4. Crear la cuenta del dueño.
 *   5. Registrar la solicitud del complejo           -> objeto «Solicitud del complejo».
 * El complejo queda «Pendiente de aprobación» y su cuenta no puede entrar hasta
 * que el administrador lo apruebe (historias Ver y Modificar solicitudes).
 */
class RegistrarComplejo {
  /** Formatos venezolanos que se revisan con expresiones regulares. */
  static FORMATOS = {
    cedula: /^[VE]-\d{6,9}$/, // V-12345678
    telefono: /^0\d{3}-\d{7}$/, // 0412-1234567
    correo: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    rif: /^[JGVEP]-\d{8}-\d$/ // J-12345678-9
  };

  constructor(database = db) {
    this.db = database;
  }

  /** Paso 1 del diagrama: la «Lista de zonas y deportes». */
  buscarZonasYDeportes() {
    return {
      zonas: ubicacionesCaracas,
      deportes: deportes.map(({ id, nombre, icono }) => ({ id, nombre, icono }))
    };
  }

  /** Quita espacios de los extremos; si no es texto devuelve "". */
  texto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
  }

  /**
   * Paso 2 del diagrama: validar los datos ingresados. Revisa que no falte
   * ninguno y que la cédula, el teléfono, el correo y el RIF tengan el formato
   * correcto. Devuelve un mensaje por cada campo que hay que corregir.
   */
  validarDatos(datos) {
    const formatos = RegistrarComplejo.FORMATOS;
    const valores = {
      nombre: this.texto(datos.nombre),
      cedula: this.texto(datos.cedula).toUpperCase(),
      telefono: this.texto(datos.telefono),
      correo: this.texto(datos.correo).toLowerCase(),
      password: typeof datos.password === "string" ? datos.password : "",
      nombreComplejo: this.texto(datos.nombreComplejo),
      rif: this.texto(datos.rif).toUpperCase(),
      direccion: this.texto(datos.direccion),
      zona: this.texto(datos.zona),
      deportes: Array.isArray(datos.deportes) ? [...new Set(datos.deportes)] : []
    };
    const errores = {};

    if (valores.nombre.length < 2 || valores.nombre.length > 80) errores.nombre = "Ingresa tu nombre y apellido.";
    if (!valores.cedula) errores.cedula = "Ingresa tu cédula.";
    else if (!formatos.cedula.test(valores.cedula)) errores.cedula = "La cédula debe tener el formato V-12345678.";
    if (!valores.telefono) errores.telefono = "Ingresa tu teléfono.";
    else if (!formatos.telefono.test(valores.telefono)) errores.telefono = "El teléfono debe tener el formato 0412-1234567.";
    if (!valores.correo) errores.correo = "Ingresa tu correo.";
    else if (!formatos.correo.test(valores.correo)) errores.correo = "El correo no tiene un formato válido.";
    if (valores.password.length < 8 || valores.password.length > 128) errores.password = "La contraseña debe tener entre 8 y 128 caracteres.";
    if (valores.nombreComplejo.length < 2 || valores.nombreComplejo.length > 80) errores.nombreComplejo = "Ingresa el nombre del complejo.";
    if (!valores.rif) errores.rif = "Ingresa el RIF del complejo.";
    else if (!formatos.rif.test(valores.rif)) errores.rif = "El RIF debe tener el formato J-12345678-9.";
    if (valores.direccion.length < 5 || valores.direccion.length > 200) errores.direccion = "Ingresa la dirección del complejo.";
    if (!ubicacionesCaracas.includes(valores.zona)) errores.zona = "Selecciona la zona de Caracas.";
    if (valores.deportes.length === 0 || !valores.deportes.every((id) => deportes.some((deporte) => deporte.id === id))) {
      errores.deportes = "Selecciona al menos un deporte de la lista.";
    }

    return { valido: Object.keys(errores).length === 0, errores, valores };
  }

  /** Paso 3 del diagrama: indica cuál de los dos (correo o RIF) ya está registrado. */
  verificarCorreoYRif(correo, rif) {
    const errores = {};
    if (this.db.prepare("SELECT 1 FROM usuarios WHERE correo = ?").get(correo)) {
      errores.correo = "Ese correo ya está registrado.";
    }
    if (this.db.prepare("SELECT 1 FROM complejos WHERE rif = ?").get(rif)) {
      errores.rif = "Ese RIF ya está registrado.";
    }
    return errores;
  }

  /**
   * Pasos 4 y 5 del diagrama, en una transacción (se guarda todo o nada):
   * crea la cuenta del dueño y registra la solicitud «Pendiente de aprobación».
   */
  registrar(valores) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const cuenta = authenticationService.crearUsuario({
        nombre: valores.nombreComplejo,
        correo: valores.correo,
        password: valores.password,
        tipo: "complejo"
      });
      this.db.prepare(`
        INSERT INTO complejos (usuario_id, dueno_nombre, dueno_cedula, dueno_telefono, rif, direccion, zona, deportes_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cuenta.id, valores.nombre, valores.cedula, valores.telefono, valores.rif,
        valores.direccion, valores.zona, JSON.stringify(valores.deportes));
      this.db.exec("COMMIT");
      return cuenta;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  registrarRutas(servidor) {
    const { app } = servidor;

    // Paso 1: zonas y deportes para llenar el formulario de registro.
    app.get("/api/complejos/formulario", (req, res) => {
      res.json(this.buscarZonasYDeportes());
    });

    // El dueño presiona «Registrar».
    app.post("/api/complejos/registro", (req, res) => {
      // Paso 2: [Datos inválidos] -> mostrar los datos faltantes o inválidos.
      const validacion = this.validarDatos(req.body || {});
      if (!validacion.valido) {
        return res.status(400).json({ error: "Revisa los datos faltantes o inválidos.", errores: validacion.errores });
      }

      // Paso 3: [Ya registrado] -> mostrar cuál de los dos ya existe.
      const repetidos = this.verificarCorreoYRif(validacion.valores.correo, validacion.valores.rif);
      if (Object.keys(repetidos).length > 0) {
        return res.status(409).json({ error: "El correo o el RIF ya están registrados.", errores: repetidos });
      }

      // Pasos 4 y 5: crear la cuenta y registrar la solicitud.
      this.registrar(validacion.valores);
      res.status(201).json({ mensaje: "Solicitud enviada, pendiente de aprobación" });
    });
  }
}

module.exports = { RegistrarComplejo };
