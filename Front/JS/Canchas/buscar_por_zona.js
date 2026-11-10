/**
 * Historia «Buscar por zona» (épica Canchas).
 * El jugador elige una zona de Caracas y ve las canchas de esa zona,
 * sin tener que elegir un deporte. Habla con GET /api/canchas/zona/:zona.
 */
class BuscarPorZonaVista extends Vista {
  constructor(app) {
    super(app);
    this.formulario = this.$("#zone-search");
    this.selectorZona = this.$("#zone-search-location");
    this.formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      if (this.selectorZona.value) this.buscar(this.selectorZona.value);
    });
  }

  /** Llena la lista de zonas con las que envía el servidor. */
  prepararCatalogo({ ubicaciones }) {
    this.selectorZona.innerHTML = [
      '<option value="">Elige una zona</option>',
      ...ubicaciones.map((zona) => `<option value="${Formato.escaparHTML(zona)}">${Formato.escaparHTML(zona)}</option>`)
    ].join("");
  }

  /** Pide al servidor las canchas de la zona y las muestra con el buscador. */
  buscar(zona) {
    return this.app.buscador.mostrarResultados(
      `Canchas en ${zona}`,
      () => this.api.consultar(`/api/canchas/zona/${encodeURIComponent(zona)}`),
      `Todavía no hay canchas registradas en ${zona}.`
    );
  }
}
