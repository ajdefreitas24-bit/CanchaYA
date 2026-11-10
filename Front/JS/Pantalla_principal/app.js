/**
 * Aplicación de la página principal (index.html). Se encarga de lo común:
 * iniciar sesión, crear la cuenta del jugador, cerrar sesión y mostrar el panel
 * de cada tipo de cuenta. Lo de cada historia está en su propia clase (vista),
 * y esta clase las tiene a todas dentro (composición).
 */
class CanchaYAApp {
  constructor() {
    this.api = new ApiCliente();
    this.usuario = null;
    this.modoRegistro = false;

    // Secciones de la página: portada, panel del jugador, panel del complejo y buscador.
    this.vistasHTML = {
      portada: document.querySelector("#landing-view"),
      jugador: document.querySelector("#player-view"),
      complejo: document.querySelector("#admin-view"),
      reservas: document.querySelector("#booking-view")
    };
    this.elementos = {
      botonSalir: document.querySelector("#home-button"),
      mensajeSesion: document.querySelector("#session-message"),
      mensajeError: document.querySelector("#error-message"),
      formulario: document.querySelector("#auth-form"),
      titulo: document.querySelector("#auth-title"),
      descripcion: document.querySelector("#auth-description"),
      indice: document.querySelector(".panel-index"),
      campoNombre: document.querySelector("#name-field"),
      nombre: document.querySelector("#auth-name"),
      correo: document.querySelector("#auth-email"),
      password: document.querySelector("#auth-password"),
      botonEnviar: document.querySelector("#auth-submit"),
      botonCambiarModo: document.querySelector("#auth-switch"),
      etiquetaCambiarModo: document.querySelector("#auth-switch-label"),
      mensajeAuth: document.querySelector("#auth-message")
    };

    // Una vista por historia de la página principal. El orden importa: varias usan al buscador.
    this.buscador = new BuscadorDeCanchas(this);
    this.buscarPorZona = new BuscarPorZonaVista(this);
    this.verHorarios = new VerHorariosDisponiblesVista(this);
    this.reservarCancha = new ReservarCanchaVista(this);
    this.cancelarReserva = new CancelarReservaVista(this);
    this.verificarPago = new VerificarPagoVista(this);
    this.panelComplejo = new PanelComplejoVista(this);
    this.vistas = [
      this.buscador, this.buscarPorZona, this.verHorarios, this.reservarCancha,
      this.cancelarReserva, this.verificarPago, this.panelComplejo
    ];

    this.configurarEventos();
  }

  // ----- Mensajes comunes -----

  mostrarMensajeSesion(texto = "") {
    this.elementos.mensajeSesion.textContent = texto;
    this.elementos.mensajeSesion.hidden = !texto;
  }

  mostrarError(texto) {
    this.elementos.mensajeError.textContent = texto;
    this.elementos.mensajeError.hidden = false;
  }

  ocultarError() {
    this.elementos.mensajeError.textContent = "";
    this.elementos.mensajeError.hidden = true;
  }

  mostrarMensajeAuth(texto = "") {
    this.elementos.mensajeAuth.textContent = texto;
    this.elementos.mensajeAuth.hidden = !texto;
  }

  /** Número en las burbujas de los botones (se oculta si es 0). */
  actualizarContador(elemento, cantidad) {
    elemento.textContent = String(cantidad);
    elemento.hidden = cantidad === 0;
  }

  /** Muestra una sola sección de la página y oculta las demás. */
  mostrarVista(vista) {
    for (const seccion of Object.values(this.vistasHTML)) {
      seccion.hidden = seccion !== vista;
    }
    this.elementos.botonSalir.hidden = vista === this.vistasHTML.portada;
    this.ocultarError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----- Iniciar sesión y crear cuenta de jugador -----

  /** Cambia el formulario entre «Iniciar sesión» y «Crear cuenta» (solo jugadores). */
  cambiarModoAuth(registro) {
    const e = this.elementos;
    this.modoRegistro = registro;
    e.campoNombre.hidden = !registro;
    e.nombre.required = registro;
    e.titulo.innerHTML = registro ? "Crea tu<br>cuenta de jugador." : "Qué bueno<br>verte de nuevo.";
    e.descripcion.textContent = registro ? "Con tu cuenta podrás buscar canchas y reservar." : "Inicia sesión para continuar.";
    e.botonEnviar.innerHTML = registro ? 'Crear cuenta <span aria-hidden="true">→</span>' : 'Iniciar sesión <span aria-hidden="true">→</span>';
    e.password.autocomplete = registro ? "new-password" : "current-password";
    e.etiquetaCambiarModo.textContent = registro ? "¿Ya tienes una cuenta?" : "¿Aún no tienes cuenta?";
    e.botonCambiarModo.textContent = registro ? "Iniciar sesión" : "Crear cuenta";
    e.indice.textContent = registro ? "CREAR CUENTA" : "INICIA SESIÓN";
    this.mostrarMensajeAuth();
  }

  async enviarFormularioAuth(evento) {
    evento.preventDefault();
    const e = this.elementos;
    this.mostrarMensajeAuth();
    e.botonEnviar.disabled = true;
    const datos = { correo: e.correo.value, password: e.password.value };
    if (this.modoRegistro) {
      datos.nombre = e.nombre.value;
      datos.tipo = "jugador";
    }
    try {
      const resultado = await this.api.enviar(`/api/auth/${this.modoRegistro ? "register" : "login"}`, datos);
      this.api.guardarToken(resultado.token);
      e.formulario.reset();
      this.cambiarModoAuth(false);
      this.entrar(resultado.usuario);
    } catch (error) {
      // Aquí llega, por ejemplo, «Tu complejo está pendiente de aprobación».
      this.mostrarMensajeAuth(error.message);
    } finally {
      e.botonEnviar.disabled = false;
    }
  }

  /** Abre el panel según el tipo de cuenta y avisa a todas las vistas. */
  entrar(usuario) {
    this.usuario = usuario;
    if (usuario.tipo === "administrador") {
      window.location.assign("/HTML/Solicitudes/solicitudes.html");
      return;
    }
    this.mostrarVista(usuario.tipo === "complejo" ? this.vistasHTML.complejo : this.vistasHTML.jugador);
    for (const vista of this.vistas) vista.alIniciarSesion(usuario);
  }

  async cerrarSesion() {
    this.elementos.botonSalir.disabled = true;
    this.mostrarMensajeSesion();
    try {
      await this.api.cerrarSesion();
      this.usuario = null;
      this.elementos.formulario.reset();
      this.cambiarModoAuth(false);
      this.mostrarVista(this.vistasHTML.portada);
    } catch (error) {
      this.mostrarMensajeSesion(error.message);
    } finally {
      this.elementos.botonSalir.disabled = false;
    }
  }

  /** Pide a todas las vistas que traigan sus datos de nuevo. */
  actualizarVistas() {
    return Promise.all(this.vistas.map((vista) => vista.actualizar(this.usuario)));
  }

  configurarEventos() {
    this.elementos.botonCambiarModo.addEventListener("click", () => this.cambiarModoAuth(!this.modoRegistro));
    this.elementos.formulario.addEventListener("submit", (evento) => this.enviarFormularioAuth(evento));
    this.elementos.botonSalir.addEventListener("click", () => this.cerrarSesion());
    document.querySelector("#open-booking").addEventListener("click", () => this.mostrarVista(this.vistasHTML.reservas));
  }

  // ----- Inicio de la página -----

  /** Carga el catálogo y la sesión, y muestra la portada o el panel que corresponde. */
  async iniciar() {
    try {
      const [catalogo, usuario, { ubicaciones }] = await Promise.all([
        this.api.consultar("/api/deportes"),
        this.api.usuarioActual(),
        this.api.consultar("/api/ubicaciones")
      ]);
      for (const vista of this.vistas) vista.prepararCatalogo({ ...catalogo, ubicaciones });

      if (!usuario) {
        this.mostrarVista(this.vistasHTML.portada);
        return;
      }
      this.entrar(usuario);
      // Si el jugador vuelve de la página de datos de la reserva, se abre otra vez el calendario.
      if (usuario.tipo === "jugador") {
        await this.verHorarios.restaurar(new URLSearchParams(window.location.search));
      }
    } catch (error) {
      this.mostrarVista(this.vistasHTML.portada);
      this.mostrarMensajeAuth(error.message);
    }
  }

  /** Cada 15 segundos se traen los cambios hechos desde otra pestaña. */
  iniciarActualizaciones() {
    window.setInterval(() => {
      if (!this.usuario) return;
      this.actualizarVistas().catch((error) => this.mostrarMensajeSesion(error.message));
    }, 15000);
  }
}

const app = new CanchaYAApp();
app.iniciar();
app.iniciarActualizaciones();
