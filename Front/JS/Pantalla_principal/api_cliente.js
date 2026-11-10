/**
 * Se comunica con el servidor (la API de CanchaYA). Todas las páginas usan un
 * objeto de esta clase, así el token de la sesión y el manejo de errores se
 * escriben una sola vez. El token se guarda por pestaña (sessionStorage).
 */
class ApiCliente {
  static CLAVE_TOKEN = "canchaya.session";

  /** Token de la sesión de esta pestaña, o null si nadie inició sesión. */
  get token() {
    try {
      return sessionStorage.getItem(ApiCliente.CLAVE_TOKEN);
    } catch {
      return null;
    }
  }

  guardarToken(token) {
    sessionStorage.setItem(ApiCliente.CLAVE_TOKEN, token);
  }

  borrarToken() {
    sessionStorage.removeItem(ApiCliente.CLAVE_TOKEN);
  }

  /** Cabeceras de cada solicitud: agrega el token si hay sesión. */
  cabeceras(extra = {}) {
    const headers = new Headers(extra);
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    return headers;
  }

  /**
   * Hace la solicitud y devuelve el JSON de la respuesta. Si el servidor
   * responde con error, lanza un Error con su mensaje, su código (estado)
   * y los datos que envió (por ejemplo, los errores de cada campo).
   */
  async consultar(ruta, opciones = {}) {
    const respuesta = await fetch(ruta, { ...opciones, headers: this.cabeceras(opciones.headers) });
    const datos = respuesta.status === 204 ? {} : await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw Object.assign(new Error(datos.error || "No se pudo completar la solicitud."), {
        estado: respuesta.status,
        datos
      });
    }
    return datos;
  }

  /** Envía datos en formato JSON (por defecto con POST). */
  enviar(ruta, datos, metodo = "POST") {
    return this.consultar(ruta, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
  }

  /** Descarga una imagen protegida (por ejemplo, la referencia de pago). */
  async obtenerImagen(ruta) {
    const respuesta = await fetch(ruta, { headers: this.cabeceras() });
    if (!respuesta.ok) {
      const error = await respuesta.json().catch(() => ({}));
      throw new Error(error.error || "No se pudo cargar la imagen.");
    }
    if (!respuesta.headers.get("content-type")?.startsWith("image/")) {
      throw new Error("El archivo recibido no es una imagen válida.");
    }
    return respuesta.blob();
  }

  /** Aviso que se envía aunque la página se esté cerrando. */
  avisarAlSalir(ruta) {
    return fetch(ruta, { method: "POST", headers: this.cabeceras(), keepalive: true });
  }

  /** Datos del usuario que inició sesión en esta pestaña, o null. */
  async usuarioActual() {
    const { usuario } = await this.consultar("/api/auth/session");
    return usuario;
  }

  async cerrarSesion() {
    await this.consultar("/api/auth/logout", { method: "POST" });
    this.borrarToken();
  }

  /** Convierte un archivo elegido en el formulario en texto (Data URL) para enviarlo en el JSON. */
  static leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.addEventListener("load", () => resolve(lector.result));
      lector.addEventListener("error", () => reject(new Error("No se pudo leer el archivo seleccionado.")));
      lector.readAsDataURL(archivo);
    });
  }
}
