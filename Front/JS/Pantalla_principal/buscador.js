/**
 * Parte común del buscador de canchas del jugador: los pasos de arriba
 * (Deporte · Cancha · Fecha y hora), el cambio entre buscar por deporte o por
 * zona, las tarjetas de deportes y la lista de canchas encontradas.
 * Buscar por zona (BuscarPorZonaVista) y Ver horarios disponibles
 * (VerHorariosDisponiblesVista) usan esta clase para mostrar sus resultados.
 */
class BuscadorDeCanchas extends Vista {
  constructor(app) {
    super(app);
    this.deportes = [];
    this.deporte = null;
    this.elementos = {
      listaDeportes: this.$("#sports-list"),
      cantidadDeportes: this.$("#sport-count"),
      resumenCatalogo: this.$("#catalog-summary"),
      botonPorDeporte: this.$("#search-by-sport-mode"),
      botonPorZona: this.$("#search-by-zone-mode"),
      formularioZona: this.$("#zone-search"),
      seccionCanchas: this.$("#courts-section"),
      tituloCanchas: this.$("#courts-heading"),
      listaCanchas: this.$("#courts-list"),
      pasos: [this.$("#step-sport"), this.$("#step-court"), this.$("#step-date")]
    };
    this.configurarEventos();
  }

  prepararCatalogo(catalogo) {
    this.mostrarCatalogo(catalogo);
  }

  /** Mientras el jugador está conectado, se actualiza el número de canchas por deporte. */
  async actualizar(usuario) {
    if (usuario?.tipo !== "jugador") return;
    this.mostrarCatalogo(await this.api.consultar("/api/deportes"));
  }

  mostrarCatalogo(catalogo) {
    this.deportes = catalogo.deportes;
    this.elementos.resumenCatalogo.textContent = `${catalogo.deportes.length} deportes · ${catalogo.cantidadCanchas} canchas disponibles`;
    this.renderizarDeportes();
  }

  renderizarDeportes() {
    this.elementos.cantidadDeportes.textContent = `${String(this.deportes.length).padStart(2, "0")} DEPORTES`;
    this.elementos.listaDeportes.innerHTML = this.deportes.map((deporte) => `
      <button class="sport-card${this.deporte?.id === deporte.id ? " selected" : ""}" type="button" data-deporte="${Formato.escaparHTML(deporte.id)}">
        <span class="sport-icon" aria-hidden="true">${Formato.escaparHTML(deporte.icono)}</span>
        <span class="sport-name">${Formato.escaparHTML(deporte.nombre)}</span>
        <span class="sport-description">${deporte.cantidadCanchas} ${deporte.cantidadCanchas === 1 ? "cancha" : "canchas"} · ${Formato.escaparHTML(deporte.descripcion)}</span>
        <span class="sport-arrow" aria-hidden="true">↗</span>
      </button>
    `).join("");
  }

  /** Marca en qué paso va el jugador: 0 deporte o zona, 1 cancha, 2 fecha y hora. */
  actualizarPasos(paso) {
    this.elementos.pasos.forEach((elemento, indice) => {
      elemento.classList.toggle("active", indice === paso);
      elemento.classList.toggle("complete", indice < paso);
    });
  }

  /** Cambia entre «Buscar por deporte» y «Buscar por zona» y reinicia la búsqueda. */
  cambiarModo(modo) {
    const porZona = modo === "zona";
    this.deporte = null;
    this.app.verHorarios.cerrar();
    this.elementos.seccionCanchas.hidden = true;
    this.actualizarPasos(0);
    this.elementos.botonPorDeporte.classList.toggle("selected", !porZona);
    this.elementos.botonPorDeporte.setAttribute("aria-pressed", String(!porZona));
    this.elementos.botonPorZona.classList.toggle("selected", porZona);
    this.elementos.botonPorZona.setAttribute("aria-pressed", String(porZona));
    this.elementos.listaDeportes.hidden = porZona;
    this.elementos.formularioZona.hidden = !porZona;
    this.renderizarDeportes();
  }

  /**
   * Muestra la sección de canchas con un título y espera la búsqueda.
   * La usan la búsqueda por deporte y la búsqueda por zona.
   */
  async mostrarResultados(titulo, buscarCanchas, mensajeVacio) {
    this.app.ocultarError();
    this.app.verHorarios.cerrar();
    this.elementos.seccionCanchas.hidden = false;
    this.elementos.tituloCanchas.textContent = titulo;
    this.elementos.listaCanchas.innerHTML = '<p class="loading-message">Buscando canchas...</p>';
    this.actualizarPasos(1);
    this.elementos.seccionCanchas.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      this.renderizarCanchas(await buscarCanchas(), mensajeVacio);
    } catch (error) {
      this.app.mostrarError(error.message);
      this.elementos.listaCanchas.innerHTML = "";
    }
  }

  renderizarCanchas(canchas, mensajeVacio) {
    const seleccionada = this.app.verHorarios.cancha?.id;
    this.elementos.listaCanchas.innerHTML = canchas.length ? canchas.map((cancha) => `
      <button class="court-card${seleccionada === cancha.id ? " selected" : ""}" type="button" data-cancha="${Formato.escaparHTML(cancha.id)}">
        ${cancha.fotoUrl ? `<img class="court-card-photo" src="${Formato.escaparHTML(cancha.fotoUrl)}" alt="Foto de ${Formato.escaparHTML(cancha.nombre)}">` : ""}
        <span class="court-card-top"><span class="court-marker" aria-hidden="true">✳</span><span class="court-price">$${Formato.escaparHTML(cancha.precioPorHora)}<small> / hora</small></span></span>
        <span class="court-name">${Formato.escaparHTML(cancha.nombre)}</span>
        <span class="court-complex">${Formato.escaparHTML(cancha.complejo)}</span>
        <span class="court-location">⌖ &nbsp;${Formato.escaparHTML(cancha.ubicacion)}</span>
        <span class="court-card-action">Capacidad: ${Formato.escaparHTML(cancha.capacidad)} · Ver disponibilidad <span aria-hidden="true">→</span></span>
      </button>
    `).join("") : `<p class="loading-message">${Formato.escaparHTML(mensajeVacio)}</p>`;
  }

  /** Búsqueda por deporte (la tenía el compañero; no es una historia del sprint). */
  async seleccionarDeporte(id) {
    const deporte = this.deportes.find((elemento) => elemento.id === id);
    if (!deporte) return;
    this.deporte = deporte;
    this.renderizarDeportes();
    await this.mostrarResultados(
      `Canchas de ${deporte.nombre}`,
      () => this.api.consultar(`/api/canchas?deporte=${encodeURIComponent(deporte.id)}`),
      `Todavía no hay canchas registradas para ${deporte.nombre}.`
    );
  }

  /** «← Cambiar búsqueda»: vuelve al primer paso. */
  reiniciar() {
    this.deporte = null;
    this.app.verHorarios.cerrar();
    this.elementos.seccionCanchas.hidden = true;
    this.renderizarDeportes();
    this.actualizarPasos(0);
    this.$("#sports-heading").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  configurarEventos() {
    this.elementos.botonPorDeporte.addEventListener("click", () => this.cambiarModo("deporte"));
    this.elementos.botonPorZona.addEventListener("click", () => this.cambiarModo("zona"));
    this.$("#change-sport").addEventListener("click", () => this.reiniciar());
    this.elementos.listaDeportes.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-deporte]");
      if (boton) this.seleccionarDeporte(boton.dataset.deporte);
    });
    // Al elegir una cancha empieza «Ver horarios disponibles».
    this.elementos.listaCanchas.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-cancha]");
      if (boton) this.app.verHorarios.seleccionarCancha(boton.dataset.cancha);
    });
  }
}
