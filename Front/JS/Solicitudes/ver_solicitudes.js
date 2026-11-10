/**
 * Historia «Ver solicitudes» (épica Complejos). Página Solicitudes/solicitudes.html.
 * El administrador de CanchaYA ve las solicitudes de registro de complejos
 * (primero las pendientes) y abre el detalle de cada una. Para aprobar o
 * rechazar usa ModificarSolicitudVista (historia Modificar solicitudes).
 * Habla con GET /api/admin/solicitudes y GET /api/admin/solicitudes/:id.
 */
class VerSolicitudesPagina extends Pagina {
  constructor() {
    super();
    this.elementos = {
      resumen: this.$("#requests-summary"),
      seccionLista: this.$("#requests-section"),
      lista: this.$("#requests-list"),
      seccionDetalle: this.$("#request-detail"),
      detalle: this.$("#request-detail-content"),
      error: this.$("#requests-error")
    };
    // Composición: la página tiene dentro la parte de Modificar solicitudes.
    this.modificar = new ModificarSolicitudVista(this);
    this.configurarEventos();
    this.iniciar();
  }

  async iniciar() {
    if (!(await this.exigirSesion("administrador"))) return;
    await this.mostrarLista();
  }

  /** Clase de la etiqueta según el estado (verde, amarilla o roja). */
  claseEstado(estado) {
    if (estado === "Aprobado") return "status-label";
    if (estado === "Rechazado") return "status-label denegada";
    return "status-label pendiente";
  }

  async mostrarLista() {
    this.mostrarTexto(this.elementos.error);
    this.elementos.seccionDetalle.hidden = true;
    this.elementos.seccionLista.hidden = false;
    try {
      const { pendientes, solicitudes } = await this.api.consultar("/api/admin/solicitudes");
      this.elementos.resumen.textContent = pendientes
        ? `Tienes ${pendientes} solicitud${pendientes === 1 ? "" : "es"} pendiente${pendientes === 1 ? "" : "s"} de revisar.`
        : "No hay solicitudes pendientes.";
      this.elementos.lista.innerHTML = solicitudes.length ? solicitudes.map((solicitud) => `
        <button class="request-card" type="button" data-solicitud="${Formato.escaparHTML(solicitud.id)}">
          <div><strong>${Formato.escaparHTML(solicitud.nombreComplejo)}</strong>
          <span>RIF ${Formato.escaparHTML(solicitud.rif)} · ${Formato.escaparHTML(solicitud.zona)} · ${Formato.escaparHTML(solicitud.deportes.join(", "))}</span>
          <small>Dueño: ${Formato.escaparHTML(solicitud.dueno.nombre)} · ${Formato.escaparHTML(solicitud.correo)}</small></div>
          <span class="${this.claseEstado(solicitud.estado)}">${Formato.escaparHTML(solicitud.estado)}</span>
          <span class="request-arrow" aria-hidden="true">→</span>
        </button>
      `).join("") : '<p class="request-empty">Todavía no hay solicitudes de complejos.</p>';
    } catch (error) {
      this.mostrarTexto(this.elementos.error, error.message);
    }
  }

  /** Abre el detalle de una solicitud con todos los datos del dueño y del complejo. */
  async mostrarDetalle(id) {
    this.mostrarTexto(this.elementos.error);
    try {
      const solicitud = await this.api.consultar(`/api/admin/solicitudes/${encodeURIComponent(id)}`);
      const dato = (etiqueta, valor) => `<p><strong>${etiqueta}:</strong> ${Formato.escaparHTML(valor)}</p>`;
      this.elementos.detalle.innerHTML = `
        <div class="request-info">
          <h3>${Formato.escaparHTML(solicitud.nombreComplejo)} <span class="${this.claseEstado(solicitud.estado)}">${Formato.escaparHTML(solicitud.estado)}</span></h3>
          ${dato("RIF", solicitud.rif)}
          ${dato("Dirección", solicitud.direccion)}
          ${dato("Zona", solicitud.zona)}
          ${dato("Deportes", solicitud.deportes.join(", "))}
          ${dato("Dueño", solicitud.dueno.nombre)}
          ${dato("Cédula", solicitud.dueno.cedula)}
          ${dato("Teléfono", solicitud.dueno.telefono)}
          ${dato("Correo", solicitud.correo)}
          ${solicitud.motivoRechazo ? dato("Motivo del rechazo", solicitud.motivoRechazo) : ""}
        </div>
      `;
      this.modificar.preparar(solicitud);
      this.elementos.seccionLista.hidden = true;
      this.elementos.seccionDetalle.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      this.mostrarTexto(this.elementos.error, error.message);
    }
  }

  configurarEventos() {
    this.elementos.lista.addEventListener("click", (evento) => {
      const tarjeta = evento.target.closest("[data-solicitud]");
      if (tarjeta) this.mostrarDetalle(tarjeta.dataset.solicitud);
    });
    this.$("#back-to-requests").addEventListener("click", () => this.mostrarLista());
    this.$("#refresh-requests").addEventListener("click", () => this.mostrarLista());
    this.conectarCerrarSesion(this.$("#logout-button"));
  }
}

new VerSolicitudesPagina();
