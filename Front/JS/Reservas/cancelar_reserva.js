/**
 * Historia «Cancelar reserva» (épica Reservas).
 * En «Ver reservaciones» el jugador ve sus reservas confirmadas y puede
 * cancelar una. El horario vuelve a quedar disponible y el complejo recibe
 * un aviso. Habla con GET /api/jugador/reservaciones y
 * POST /api/jugador/reservaciones/:id/cancelar.
 */
class CancelarReservaVista extends Vista {
  constructor(app) {
    super(app);
    this.boton = this.$("#show-reservations");
    this.contador = this.$("#reservation-count");
    this.seccion = this.$("#player-reservations");
    this.lista = this.$("#player-reservations-list");
    this.configurarEventos();
  }

  alIniciarSesion(usuario) {
    this.seccion.hidden = true;
    this.actualizar(usuario).catch((error) => this.app.mostrarMensajeSesion(error.message));
  }

  async actualizar(usuario) {
    if (usuario?.tipo !== "jugador") return;
    const { reservaciones } = await this.api.consultar("/api/jugador/reservaciones");
    this.app.actualizarContador(this.contador, reservaciones.length);
    if (!this.seccion.hidden) this.renderizar(reservaciones);
  }

  renderizar(reservaciones) {
    if (reservaciones.length === 0) {
      this.lista.innerHTML = '<p class="request-empty">Todavía no tienes reservaciones confirmadas.</p>';
      return;
    }
    this.lista.innerHTML = reservaciones.map((reserva) => `
      <article class="request-card">
        <div><strong>${Formato.escaparHTML(reserva.cancha.nombre)}</strong>
        <span>${Formato.escaparHTML(Formato.fechaLarga(reserva.fecha))} · ${Formato.escaparHTML(reserva.horarios.join(", "))}</span>
        <small>Reserva confirmada</small></div><span class="status-label">Confirmada</span>
        <button class="secondary-button cancel-reservation-button" type="button" data-cancelar-reserva="${Formato.escaparHTML(reserva.id)}">Cancelar reservación</button>
      </article>
    `).join("");
  }

  /** Pide confirmación y cancela la reserva en el servidor. */
  async cancelar(reservaId, boton) {
    const confirmar = window.confirm(
      "¿Estás seguro de que deseas cancelar esta reservación? En esta versión no se realizan reembolsos. Si cancelas, el horario volverá a estar disponible."
    );
    if (!confirmar) return;
    boton.disabled = true;
    try {
      const resultado = await this.api.consultar(`/api/jugador/reservaciones/${encodeURIComponent(reservaId)}/cancelar`, { method: "POST" });
      this.app.mostrarMensajeSesion(resultado.mensaje);
      await this.app.actualizarVistas();
    } catch (error) {
      this.app.mostrarMensajeSesion(error.message);
      boton.disabled = false;
    }
  }

  configurarEventos() {
    this.boton.addEventListener("click", async () => {
      this.app.verificarPago.ocultarNotificacionesJugador();
      this.seccion.hidden = false;
      try {
        await this.actualizar(this.app.usuario);
      } catch (error) {
        this.app.mostrarMensajeSesion(error.message);
      }
    });
    this.lista.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-cancelar-reserva]");
      if (boton) this.cancelar(boton.dataset.cancelarReserva, boton);
    });
  }
}
