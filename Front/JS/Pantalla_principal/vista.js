/**
 * Clase padre de las partes de la página principal (index.html). Cada historia
 * que vive en esa página es una clase hija de Vista: el buscador, buscar por zona,
 * ver horarios disponibles, reservar cancha, cancelar reserva, etc.
 *
 * CanchaYAApp guarda todas las vistas en una lista y llama a los mismos métodos
 * en cada una (polimorfismo). Cada hija sobrescribe solo los que necesita;
 * los demás se quedan con la versión de aquí, que no hace nada.
 */
class Vista {
  constructor(app) {
    this.app = app;       // la aplicación principal, para usar sus mensajes y su estado
    this.api = app.api;   // el mismo cliente de la API para todas las vistas
  }

  $(selector) {
    return document.querySelector(selector);
  }

  /** Se llama al cargar la página, con los deportes, las zonas y la fecha del servidor. */
  prepararCatalogo(catalogo) {}

  /** Se llama cuando alguien inicia sesión (o ya tenía la sesión abierta). */
  alIniciarSesion(usuario) {}

  /** Se llama cada 15 segundos para traer los cambios hechos desde otra pestaña. */
  async actualizar(usuario) {}
}
