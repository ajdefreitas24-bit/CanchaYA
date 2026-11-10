/**
 * Historia «Pagar adelanto», último paso. Página Pagos/espera.html.
 * Consulta cada 2,5 segundos el estado de la reserva y regresa al inicio
 * cuando el complejo confirma o deniega el pago. Hereda de Pagina.
 */
class WaitingPage extends Pagina {
  constructor() {
    super();
    // El ID llega en la URL y el token identifica la cuenta en esta pestaña.
    this.reservaId = new URLSearchParams(window.location.search).get("reserva");
    this.mensajeEstado = document.querySelector("#waiting-status");
    this.intervalo = null;
    this.inicializar();
  }

  /** Consulta el estado; al resolverse, guarda el resultado para notificar al regresar. */
  async consultarEstado() {
    if (!this.api.token) {
      this.mensajeEstado.textContent = "No se encontró la sesión del jugador. Inicia sesión para consultar la reserva.";
      return;
    }

    try {
      const datos = await this.api.consultar(`/api/jugador/reservas/${encodeURIComponent(this.reservaId)}/estado`);
      if (datos.estado === "confirmada" || datos.estado === "denegada") {
        window.clearInterval(this.intervalo);
        sessionStorage.setItem("canchaya.reservation-result", datos.estado);
        window.location.replace("/");
        return;
      }
      this.mensajeEstado.textContent = "La referencia sigue pendiente de revisión. Esta página se actualiza automáticamente.";
    } catch (error) {
      this.mensajeEstado.textContent = error.message;
    }
  }

  /** Inicia la primera consulta y el sondeo periódico si la URL contiene una reserva. */
  inicializar() {
    if (!this.reservaId) {
      this.mensajeEstado.textContent = "No encontramos el identificador de esta reserva.";
      return;
    }
    this.consultarEstado();
    this.intervalo = window.setInterval(() => this.consultarEstado(), 2500);
  }
}

new WaitingPage();
