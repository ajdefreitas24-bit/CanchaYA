/**
 * Clase padre de las páginas que tienen su propio archivo HTML (agregar cancha,
 * agregar horario, registrar complejo, solicitudes, datos de la reserva, pago y espera).
 * Cada página hija hereda con «extends Pagina» y llama a super() en su constructor.
 */
class Pagina {
  constructor() {
    this.api = new ApiCliente();          // composición: la página tiene un cliente de la API
    this.ventana = new VentanaMensaje();  // y una ventana para los mensajes con «OK»
  }

  $(selector) {
    return document.querySelector(selector);
  }

  /** Regresa a la página principal (allí está el panel de cada tipo de cuenta). */
  volverAlInicio() {
    window.location.assign("/");
  }

  /**
   * Revisa que haya iniciado sesión el tipo de cuenta correcto. Si no, vuelve
   * a la página principal y devuelve null.
   */
  async exigirSesion(tipo) {
    try {
      const usuario = await this.api.usuarioActual();
      if (usuario?.tipo === tipo) return usuario;
    } catch {
      // Si no se pudo consultar la sesión, también vuelve al inicio.
    }
    window.location.replace("/");
    return null;
  }

  /** Conecta el botón «Cerrar sesión» del encabezado. */
  conectarCerrarSesion(boton) {
    boton?.addEventListener("click", async () => {
      boton.disabled = true;
      try {
        await this.api.cerrarSesion();
      } finally {
        this.volverAlInicio();
      }
    });
  }

  /**
   * Muestra el error de cada campo debajo de él. En el HTML, cada campo tiene
   * un <small data-error-de="nombreDelCampo"> donde se escribe su mensaje.
   */
  mostrarErroresDeCampos(formulario, errores) {
    let primero = null;
    for (const [campo, mensaje] of Object.entries(errores || {})) {
      const aviso = formulario.querySelector(`[data-error-de="${campo}"]`);
      if (aviso) {
        aviso.textContent = mensaje;
        aviso.hidden = false;
      }
      const control = formulario.elements[campo];
      if (control instanceof HTMLElement) {
        control.setAttribute("aria-invalid", "true");
        primero ??= control;
      }
    }
    primero?.focus();
  }

  limpiarErroresDeCampos(formulario) {
    for (const aviso of formulario.querySelectorAll("[data-error-de]")) {
      aviso.hidden = true;
      aviso.textContent = "";
    }
    for (const control of formulario.querySelectorAll("[aria-invalid]")) {
      control.removeAttribute("aria-invalid");
    }
  }

  /** Muestra u oculta un mensaje general (por ejemplo, en un <p class="form-error">). */
  mostrarTexto(elemento, texto = "") {
    elemento.textContent = texto;
    elemento.hidden = !texto;
  }
}
