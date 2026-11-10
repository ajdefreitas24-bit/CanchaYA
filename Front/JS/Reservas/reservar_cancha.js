/**
 * Historia «Reservar cancha» (épica Reservas), primera parte.
 * Cuando el jugador presiona «Confirmar horarios», se apartan las horas
 * elegidas por 90 segundos (POST /api/reservas/bloquear) para que nadie más
 * las tome, y se pasa a la página de datos del jugador (Reservas/reservar.js).
 */
class ReservarCanchaVista extends Vista {
  constructor(app) {
    super(app);
    this.boton = this.$("#confirm-selection");
    this.boton.addEventListener("click", () => this.apartarHorarios());
  }

  async apartarHorarios() {
    const verHorarios = this.app.verHorarios;
    const horas = verHorarios.horasSeleccionadas();
    if (!verHorarios.cancha || horas.length === 0) return;
    this.boton.disabled = true;
    this.app.ocultarError();
    try {
      const resultado = await this.api.enviar("/api/reservas/bloquear", {
        canchaId: verHorarios.cancha.id,
        fecha: verHorarios.fecha,
        horarios: horas
      });
      const parametros = new URLSearchParams({
        reserva: resultado.reservaId,
        cancha: verHorarios.cancha.id,
        fecha: verHorarios.fecha
      });
      window.location.href = `/HTML/Reservas/reservar.html?${parametros}`;
    } catch (error) {
      // Si otro jugador ganó esas horas, se recarga la disponibilidad y se avisa.
      await verHorarios.cargarDisponibilidad();
      this.app.mostrarError(error.message);
    } finally {
      this.boton.disabled = false;
    }
  }
}
