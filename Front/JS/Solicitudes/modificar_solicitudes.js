/**
 * Historia «Modificar solicitudes» (épica Complejos).
 * En el detalle de una solicitud pendiente, el administrador la aprueba o la
 * rechaza. Para rechazar debe escribir el motivo. Al aprobarla, la cuenta del
 * dueño ya puede iniciar sesión y agregar canchas.
 * Habla con POST /api/admin/solicitudes/:id/decision.
 */
class ModificarSolicitudVista {
  constructor(pagina) {
    this.pagina = pagina;   // la página de Ver solicitudes que la contiene
    this.api = pagina.api;
    this.solicitud = null;
    this.elementos = {
      acciones: pagina.$("#decision-section"),
      campoMotivo: pagina.$("#rejection-reason-field"),
      motivo: pagina.$("#rejection-reason"),
      error: pagina.$("#decision-error"),
      botonAprobar: pagina.$("#approve-complex"),
      botonRechazar: pagina.$("#reject-complex")
    };
    this.configurarEventos();
  }

  /** Muestra los botones solo si la solicitud sigue pendiente. */
  preparar(solicitud) {
    const e = this.elementos;
    this.solicitud = solicitud;
    e.acciones.hidden = solicitud.estado !== "Pendiente de aprobación";
    e.campoMotivo.hidden = true;
    e.motivo.value = "";
    e.botonRechazar.textContent = "Rechazar";
    this.pagina.mostrarTexto(e.error);
  }

  /** Envía «Aprobado» o «Rechazado» al servidor y vuelve a la lista. */
  async decidir(estado) {
    const e = this.elementos;
    this.pagina.mostrarTexto(e.error);
    e.botonAprobar.disabled = true;
    e.botonRechazar.disabled = true;
    try {
      const respuesta = await this.api.enviar(`/api/admin/solicitudes/${encodeURIComponent(this.solicitud.id)}/decision`, {
        estado,
        motivo: e.motivo.value
      });
      await this.pagina.ventana.mostrar(respuesta.mensaje, { boton: "Aceptar" });
      await this.pagina.mostrarLista();
    } catch (error) {
      this.pagina.mostrarTexto(e.error, error.message);
    } finally {
      e.botonAprobar.disabled = false;
      e.botonRechazar.disabled = false;
    }
  }

  configurarEventos() {
    const e = this.elementos;
    e.botonAprobar.addEventListener("click", () => this.decidir("Aprobado"));
    // El primer clic en «Rechazar» muestra el campo del motivo; el segundo envía el rechazo.
    e.botonRechazar.addEventListener("click", () => {
      if (e.campoMotivo.hidden) {
        e.campoMotivo.hidden = false;
        e.botonRechazar.textContent = "Enviar rechazo";
        e.motivo.focus();
        return;
      }
      this.decidir("Rechazado");
    });
  }
}
