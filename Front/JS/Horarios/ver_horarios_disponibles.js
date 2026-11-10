/**
 * Historia «Ver horarios disponibles» (épica Horarios).
 * Después de elegir una cancha, el jugador ve un calendario de 30 días y, para
 * el día elegido, las horas libres. Las horas salen de los horarios que registró
 * el complejo (historia Agregar horario) menos las que ya están reservadas.
 * Habla con GET /api/canchas/:id y GET /api/canchas/:id/disponibilidad?fecha=.
 */
class VerHorariosDisponiblesVista extends Vista {
  constructor(app) {
    super(app);
    this.cancha = null;
    this.fechaActual = "";
    this.fecha = "";
    this.inicioSemana = 0;
    this.horarios = [];
    this.seleccionados = new Set();
    this.elementos = {
      seccion: this.$("#details-section"),
      resumen: this.$("#court-summary"),
      listaFechas: this.$("#dates-list"),
      rangoFechas: this.$("#calendar-range"),
      fechaElegida: this.$("#availability-date"),
      listaHorarios: this.$("#slots-list"),
      acciones: this.$("#selection-actions"),
      mensajeSeleccion: this.$("#selection-message"),
      anterior: this.$("#previous-dates"),
      siguiente: this.$("#next-dates")
    };
    this.configurarEventos();
  }

  prepararCatalogo({ fechaActual }) {
    this.fechaActual = fechaActual;
    this.fecha = fechaActual;
  }

  /** Oculta el calendario (cuando el jugador cambia de búsqueda o de cancha). */
  cerrar() {
    this.cancha = null;
    this.seleccionados.clear();
    this.elementos.seccion.hidden = true;
  }

  /** Horas que el jugador marcó, ordenadas. Las usa Reservar cancha. */
  horasSeleccionadas() {
    return [...this.seleccionados].sort();
  }

  /** Carga el detalle de la cancha elegida y muestra su calendario. */
  async seleccionarCancha(id) {
    this.app.ocultarError();
    try {
      const cancha = await this.api.consultar(`/api/canchas/${encodeURIComponent(id)}`);
      this.cancha = cancha;
      this.fecha = this.fechaActual;
      this.inicioSemana = 0;
      this.seleccionados.clear();
      this.elementos.seccion.hidden = false;
      this.app.buscador.actualizarPasos(2);
      this.elementos.resumen.innerHTML = `
        <span class="summary-icon" aria-hidden="true">${Formato.escaparHTML(cancha.icono)}</span>
        <div class="summary-main"><span class="section-kicker">${Formato.escaparHTML(cancha.deporte)} · ${Formato.escaparHTML(cancha.complejo)}</span><h3>${Formato.escaparHTML(cancha.nombre)}</h3><span class="court-location">⌖ &nbsp;${Formato.escaparHTML(cancha.ubicacion)}</span></div>
        <div class="summary-specs"><span>${Formato.escaparHTML(cancha.capacidad)}</span></div>
        <div class="summary-price"><strong>$${Formato.escaparHTML(cancha.precioPorHora)}</strong><span>por hora</span></div>
      `;
      this.renderizarFechas();
      this.elementos.seccion.scrollIntoView({ behavior: "smooth", block: "start" });
      await this.cargarDisponibilidad();
    } catch (error) {
      this.app.mostrarError(error.message);
    }
  }

  /** Las 31 fechas que se pueden consultar: hoy y los 30 días siguientes. */
  fechasDelCalendario() {
    return Array.from({ length: 31 }, (_, indice) => {
      const fecha = new Date(`${this.fechaActual}T12:00:00`);
      fecha.setDate(fecha.getDate() + indice);
      return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    });
  }

  /** Dibuja la semana visible del calendario. */
  renderizarFechas() {
    const fechas = this.fechasDelCalendario();
    const visibles = fechas.slice(this.inicioSemana, this.inicioSemana + 7);
    this.elementos.listaFechas.innerHTML = visibles.map((fecha, indice) => `
      <button class="date-card${fecha === this.fecha ? " selected" : ""}" type="button" data-fecha="${fecha}" aria-pressed="${fecha === this.fecha}">
        <span>${indice === 0 && this.inicioSemana === 0 ? "HOY" : Formato.escaparHTML(Formato.fecha(fecha, { weekday: "short" }).replace(".", ""))}</span>
        <strong>${Formato.escaparHTML(Formato.fecha(fecha, { day: "2-digit" }))}</strong>
        <small>${Formato.escaparHTML(Formato.fecha(fecha, { month: "short" }).replace(".", ""))}</small>
      </button>
    `).join("");
    const primera = visibles[0];
    const ultima = visibles[visibles.length - 1];
    this.elementos.rangoFechas.textContent = `${Formato.fecha(primera, { day: "numeric", month: "short" })} – ${Formato.fecha(ultima, { day: "numeric", month: "short" })}`;
    this.elementos.anterior.disabled = this.inicioSemana === 0;
    this.elementos.siguiente.disabled = this.inicioSemana + 7 >= fechas.length;
  }

  /** Pide al servidor las horas libres de la cancha en la fecha elegida. */
  async cargarDisponibilidad() {
    this.app.ocultarError();
    this.seleccionados.clear();
    this.elementos.acciones.hidden = true;
    this.elementos.listaHorarios.innerHTML = '<p class="loading-message">Consultando horarios...</p>';
    try {
      const datos = await this.api.consultar(`/api/canchas/${encodeURIComponent(this.cancha.id)}/disponibilidad?fecha=${encodeURIComponent(this.fecha)}`);
      this.horarios = datos.horarios;
      this.renderizarFechas();
      this.renderizarHorarios();
    } catch (error) {
      this.elementos.listaHorarios.innerHTML = "";
      this.app.mostrarError(error.message);
    }
  }

  /** Dibuja las horas libres. Las que otro jugador está reservando dicen «En proceso». */
  renderizarHorarios() {
    this.elementos.fechaElegida.textContent = Formato.fecha(this.fecha, { weekday: "long", day: "numeric", month: "long" });
    if (this.horarios.length === 0) {
      this.elementos.listaHorarios.innerHTML = '<p class="empty-message">No hay horarios disponibles para esta fecha. Prueba con otro día.</p>';
      return;
    }
    this.elementos.listaHorarios.innerHTML = this.horarios.map((horario) => {
      const seleccionado = this.seleccionados.has(horario.inicio);
      return `
        <button class="slot-card${seleccionado ? " selected" : ""}" type="button" data-hora="${Formato.escaparHTML(horario.inicio)}" aria-pressed="${seleccionado}">
          <strong>${Formato.escaparHTML(horario.inicio)}</strong><span>– ${Formato.escaparHTML(horario.fin)}</span>
          <small>${seleccionado ? "Seleccionado" : horario.bloqueado ? "En proceso" : "Elegir"}</small>
        </button>
      `;
    }).join("");
  }

  /** Marca o desmarca una hora y muestra el resumen con el botón «Confirmar horarios». */
  alternarHora(hora) {
    if (this.seleccionados.has(hora)) this.seleccionados.delete(hora);
    else this.seleccionados.add(hora);
    this.renderizarHorarios();
    const cantidad = this.seleccionados.size;
    this.elementos.acciones.hidden = cantidad === 0;
    if (cantidad > 0) {
      this.elementos.mensajeSeleccion.textContent = `Seleccionaste ${cantidad} horario${cantidad === 1 ? "" : "s"} para el ${Formato.fecha(this.fecha, { day: "numeric", month: "long" })}: ${this.horasSeleccionadas().join(", ")}.`;
    }
  }

  /**
   * Al volver de la página de datos de la reserva (botón Cancelar), la URL trae
   * la cancha y la fecha para mostrar de nuevo el mismo calendario.
   */
  async restaurar(parametros) {
    const canchaId = parametros.get("cancha");
    const fecha = parametros.get("fecha");
    if (!canchaId || !fecha) return false;
    const dias = Math.round((new Date(`${fecha}T12:00:00`) - new Date(`${this.fechaActual}T12:00:00`)) / 86400000);
    if (!(dias >= 0 && dias <= 30)) return false;

    this.app.mostrarVista(this.app.vistasHTML.reservas);
    await this.seleccionarCancha(canchaId);
    if (this.cancha?.id !== canchaId) return true;
    this.fecha = fecha;
    this.inicioSemana = Math.floor(dias / 7) * 7;
    await this.cargarDisponibilidad();
    if (parametros.get("cancelada") === "1") {
      this.app.mostrarError("La reserva fue cancelada y los horarios quedaron liberados.");
    }
    return true;
  }

  configurarEventos() {
    this.elementos.listaFechas.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-fecha]");
      if (!boton || boton.dataset.fecha === this.fecha) return;
      this.fecha = boton.dataset.fecha;
      this.cargarDisponibilidad();
    });
    this.elementos.listaHorarios.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-hora]");
      if (boton) this.alternarHora(boton.dataset.hora);
    });
    this.elementos.anterior.addEventListener("click", () => {
      this.inicioSemana = Math.max(0, this.inicioSemana - 7);
      this.renderizarFechas();
    });
    this.elementos.siguiente.addEventListener("click", () => {
      this.inicioSemana = Math.min(28, this.inicioSemana + 7);
      this.renderizarFechas();
    });
    this.$("#change-court").addEventListener("click", () => {
      this.cerrar();
      this.app.buscador.actualizarPasos(1);
      this.$("#courts-section").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
