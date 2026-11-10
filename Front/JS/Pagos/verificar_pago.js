/**
 * Complemento de «Pagar adelanto»: después de que el jugador envía la
 * referencia, el complejo la revisa y confirma o deniega la reserva.
 *  - Complejo: «Ver notificaciones» (pagos por revisar y cancelaciones),
 *    detalle con la imagen de la referencia y «Ver reservas».
 *  - Jugador: «Notificaciones» con el resultado de cada reserva.
 * Habla con /api/complejo/solicitudes, /api/complejo/reservaciones y
 * /api/jugador/notificaciones.
 */
class VerificarPagoVista extends Vista {
  constructor(app) {
    super(app);
    this.solicitudActual = null;
    this.urlReferencia = null;
    this.elementos = {
      // Complejo
      botonSolicitudes: this.$("#open-requests"),
      contadorSolicitudes: this.$("#request-count"),
      estado: this.$("#request-update-status"),
      solicitudes: this.$("#complex-requests"),
      listaSolicitudes: this.$("#complex-requests-list"),
      detalle: this.$("#request-detail"),
      contenidoDetalle: this.$("#request-detail-content"),
      feedback: this.$("#request-feedback"),
      campoMotivo: this.$("#rejection-reason-field"),
      motivo: this.$("#rejection-reason"),
      botonDenegar: this.$("#deny-request"),
      botonConfirmar: this.$("#approve-request"),
      botonReservas: this.$("#open-complex-reservations"),
      contadorReservas: this.$("#complex-reservation-count"),
      reservas: this.$("#complex-reservations"),
      listaReservas: this.$("#complex-reservations-list"),
      // Jugador
      botonNotificaciones: this.$("#show-player-notifications"),
      contadorNotificaciones: this.$("#player-notification-count"),
      notificaciones: this.$("#player-notifications"),
      listaNotificaciones: this.$("#player-notifications-list")
    };
    this.configurarEventos();
  }

  alIniciarSesion(usuario) {
    this.elementos.solicitudes.hidden = true;
    this.elementos.detalle.hidden = true;
    this.elementos.reservas.hidden = true;
    this.elementos.notificaciones.hidden = true;
    if (usuario?.tipo === "jugador") this.avisarResultadoDelPago();
    this.actualizar(usuario).catch((error) => this.mostrarEstado(error.message));
  }

  async actualizar(usuario) {
    if (usuario?.tipo === "complejo") {
      await Promise.all([this.actualizarSolicitudes(), this.actualizarReservasComplejo()]);
    } else if (usuario?.tipo === "jugador") {
      await this.actualizarNotificacionesJugador();
    }
  }

  mostrarEstado(texto) {
    this.elementos.estado.textContent = texto;
  }

  /** La página de espera deja guardado el resultado para avisarlo al volver al inicio. */
  avisarResultadoDelPago() {
    const resultado = sessionStorage.getItem("canchaya.reservation-result");
    if (!resultado) return;
    sessionStorage.removeItem("canchaya.reservation-result");
    this.app.mostrarMensajeSesion(resultado === "confirmada"
      ? "¡Tu reserva fue confirmada! Ya aparece en «Ver reservaciones»."
      : "El complejo denegó la referencia y el horario quedó disponible nuevamente.");
  }

  // ----- Complejo: pagos por revisar y cancelaciones -----

  async actualizarSolicitudes() {
    const { solicitudes = [], cancelaciones = [] } = await this.api.consultar("/api/complejo/solicitudes");
    const total = solicitudes.length + cancelaciones.length;
    this.app.actualizarContador(this.elementos.contadorSolicitudes, total);
    this.mostrarEstado(total
      ? `Tienes ${total} notificación${total === 1 ? "" : "es"} de reservas.`
      : "No tienes notificaciones nuevas.");
    if (!this.elementos.solicitudes.hidden) this.renderizarSolicitudes(solicitudes, cancelaciones);
  }

  renderizarSolicitudes(solicitudes, cancelaciones) {
    const tarjetas = [
      ...solicitudes.map((solicitud) => `
        <button class="request-card" type="button" data-solicitud="${Formato.escaparHTML(solicitud.id)}">
          <div><strong>Solicitud de reserva · ${Formato.escaparHTML(solicitud.cancha.nombre)} · ${Formato.escaparHTML(solicitud.cuentaJugador.nombre)}</strong>
          <span>${Formato.escaparHTML(Formato.fecha(solicitud.fecha, { day: "numeric", month: "long", year: "numeric" }))} · ${Formato.escaparHTML(solicitud.horarios.join(", "))}</span>
          <small>Comprobante: ${Formato.escaparHTML(solicitud.nombreArchivo)}</small></div>
          <span class="request-arrow" aria-hidden="true">→</span>
        </button>
      `),
      ...cancelaciones.map((cancelacion) => `
        <article class="request-card cancellation-notification">
          <div>
            <strong>Reservación cancelada · ${Formato.escaparHTML(cancelacion.cancha.nombre)} · ${Formato.escaparHTML(cancelacion.cuentaJugador.nombre)}</strong>
            <span>${Formato.escaparHTML(Formato.fechaLarga(cancelacion.fecha))} · ${Formato.escaparHTML(cancelacion.horarios.join(", "))}</span>
            <small>${Formato.escaparHTML(cancelacion.cuentaJugador.correo)} canceló la reservación. El horario volvió a estar disponible.</small>
          </div>
          <span class="status-label denegada">Cancelada</span>
        </article>
      `)
    ];
    this.elementos.listaSolicitudes.innerHTML = tarjetas.length
      ? tarjetas.join("")
      : '<p class="request-empty">No tienes notificaciones.</p>';
  }

  liberarImagen() {
    if (this.urlReferencia) {
      URL.revokeObjectURL(this.urlReferencia);
      this.urlReferencia = null;
    }
  }

  /** Muestra los datos del jugador y la imagen de la referencia de pago. */
  async mostrarDetalle(id) {
    this.elementos.feedback.hidden = true;
    this.elementos.campoMotivo.hidden = true;
    this.elementos.motivo.value = "";
    this.elementos.botonDenegar.textContent = "Denegar reserva";
    this.liberarImagen();
    this.solicitudActual = id;
    try {
      const solicitud = await this.api.consultar(`/api/complejo/solicitudes/${encodeURIComponent(id)}`);
      const dato = (etiqueta, valor) => `<p><strong>${etiqueta}:</strong> ${Formato.escaparHTML(valor)}</p>`;
      this.elementos.contenidoDetalle.innerHTML = `
        <div class="request-info">
          <h3>${Formato.escaparHTML(solicitud.cancha.nombre)} · ${Formato.escaparHTML(solicitud.cancha.complejo)}</h3>
          ${dato("Deporte", solicitud.cancha.deporte)}
          ${dato("Fecha", Formato.fechaLarga(solicitud.fecha))}
          ${dato("Horario(s)", solicitud.horarios.join(", "))}
          ${dato("Jugador", `${solicitud.jugador.nombre} (${solicitud.cuentaJugador.correo})`)}
          ${dato("Cédula", solicitud.jugador.cedula)}
          ${dato("Correo de contacto", solicitud.jugador.correo)}
          ${dato("Teléfono", solicitud.jugador.telefono)}
          ${dato("Jugadores", solicitud.jugador.jugadores)}
          ${dato("Anticipo reportado", `Bs. ${solicitud.montoBs}`)}
          ${dato("Comprobante", solicitud.nombreArchivo)}
        </div>
        <div class="reference-container">
          <p class="reference-loading" id="reference-loading" role="status">Cargando la referencia de pago…</p>
          <img class="reference-preview" id="reference-preview" alt="Referencia de pago adjuntada por el jugador" hidden>
        </div>
      `;
      this.elementos.solicitudes.hidden = true;
      this.elementos.detalle.hidden = false;
      await this.mostrarImagenReferencia(id, solicitud.referenciaUrl);
    } catch (error) {
      this.mostrarEstado(error.message);
      await this.actualizarSolicitudes();
    }
  }

  async mostrarImagenReferencia(id, url) {
    const estado = this.$("#reference-loading");
    try {
      const imagen = await this.api.obtenerImagen(url);
      if (this.solicitudActual !== id) return; // el complejo ya abrió otra solicitud
      this.urlReferencia = URL.createObjectURL(imagen);
      const vistaPrevia = this.$("#reference-preview");
      vistaPrevia.src = this.urlReferencia;
      vistaPrevia.hidden = false;
      estado.hidden = true;
    } catch (error) {
      if (this.solicitudActual === id && estado) {
        estado.textContent = `No se pudo mostrar la referencia: ${error.message}`;
        estado.classList.add("reference-error");
      }
    }
  }

  volverALaLista() {
    this.liberarImagen();
    this.solicitudActual = null;
    this.elementos.detalle.hidden = true;
    this.elementos.solicitudes.hidden = false;
    return this.actualizarSolicitudes();
  }

  /** «Confirmar reserva» o «Denegar reserva» (para denegar hay que escribir el motivo). */
  async decidir(decision) {
    if (!this.solicitudActual) return;
    const motivo = this.elementos.motivo.value.trim();
    if (decision === "denegada" && (motivo.length < 3 || motivo.length > 500)) {
      this.elementos.motivo.setCustomValidity("Escribe un motivo de entre 3 y 500 caracteres.");
      this.elementos.motivo.reportValidity();
      this.elementos.motivo.addEventListener("input", () => this.elementos.motivo.setCustomValidity(""), { once: true });
      return;
    }
    this.elementos.botonDenegar.disabled = true;
    this.elementos.botonConfirmar.disabled = true;
    try {
      const resultado = await this.api.enviar(`/api/complejo/solicitudes/${encodeURIComponent(this.solicitudActual)}/decision`, { decision, motivo });
      await this.volverALaLista();
      this.mostrarEstado(resultado.mensaje);
      await this.actualizarReservasComplejo();
    } catch (error) {
      this.mostrarTextoFeedback(error.message);
    } finally {
      this.elementos.botonDenegar.disabled = false;
      this.elementos.botonConfirmar.disabled = false;
    }
  }

  mostrarTextoFeedback(texto) {
    this.elementos.feedback.textContent = texto;
    this.elementos.feedback.hidden = false;
  }

  // ----- Complejo: reservas confirmadas -----

  async actualizarReservasComplejo() {
    const { reservaciones } = await this.api.consultar("/api/complejo/reservaciones");
    this.app.actualizarContador(this.elementos.contadorReservas, reservaciones.length);
    this.elementos.listaReservas.innerHTML = reservaciones.length
      ? reservaciones.map((reserva) => `
        <article class="request-card">
          <div>
            <strong>${Formato.escaparHTML(reserva.cancha.nombre)} · ${Formato.escaparHTML(reserva.cuentaJugador.nombre)}</strong>
            <span>${Formato.escaparHTML(Formato.fechaLarga(reserva.fecha))} · ${Formato.escaparHTML(reserva.horarios.join(", "))}</span>
            <small>${Formato.escaparHTML(reserva.cuentaJugador.correo)} · ${Formato.escaparHTML(reserva.cancha.deporte)} · ${Formato.escaparHTML(reserva.cancha.ubicacion)}</small>
          </div>
          <span class="status-label${reserva.estado === "cancelada" ? " denegada" : ""}">${reserva.estado === "cancelada" ? "Cancelada" : "Confirmada"}</span>
        </article>
      `).join("")
      : '<p class="request-empty">Todavía no hay reservas confirmadas para tus canchas.</p>';
  }

  // ----- Jugador: resultado de sus reservas -----

  ocultarNotificacionesJugador() {
    this.elementos.notificaciones.hidden = true;
  }

  async actualizarNotificacionesJugador() {
    const { notificaciones } = await this.api.consultar("/api/jugador/notificaciones");
    this.app.actualizarContador(this.elementos.contadorNotificaciones, notificaciones.length);
    if (!this.elementos.notificaciones.hidden) this.renderizarNotificacionesJugador(notificaciones);
  }

  renderizarNotificacionesJugador(notificaciones) {
    if (notificaciones.length === 0) {
      this.elementos.listaNotificaciones.innerHTML = '<p class="request-empty">Todavía no tienes notificaciones.</p>';
      return;
    }
    this.elementos.listaNotificaciones.innerHTML = notificaciones.map((reserva) => {
      const aceptada = reserva.estado === "confirmada";
      const cancelada = reserva.estado === "cancelada";
      const motivo = reserva.estado === "denegada" && reserva.motivo ? ` Motivo: ${Formato.escaparHTML(reserva.motivo)}` : "";
      const texto = cancelada
        ? "Cancelaste esta reservación; el horario volvió a estar disponible."
        : aceptada ? "Tu reserva fue confirmada." : `Tu referencia no fue aceptada; puedes volver a reservar este horario.${motivo}`;
      return `<article class="request-card">
        <div><strong>${Formato.escaparHTML(reserva.cancha.nombre)}</strong><span>${Formato.escaparHTML(Formato.fechaLarga(reserva.fecha))} · ${Formato.escaparHTML(reserva.horarios.join(", "))}</span>
        <small>${texto}</small></div>
        <span class="status-label${aceptada ? "" : " denegada"}">${cancelada ? "Cancelada" : aceptada ? "Aceptada" : "Denegada"}</span>
      </article>`;
    }).join("");
  }

  configurarEventos() {
    const e = this.elementos;
    e.botonSolicitudes.addEventListener("click", () => {
      e.detalle.hidden = true;
      e.reservas.hidden = true;
      e.solicitudes.hidden = false;
      this.actualizarSolicitudes().catch((error) => this.mostrarEstado(error.message));
    });
    e.botonReservas.addEventListener("click", () => {
      e.detalle.hidden = true;
      e.solicitudes.hidden = true;
      e.reservas.hidden = false;
      this.actualizarReservasComplejo().catch((error) => {
        e.listaReservas.innerHTML = `<p class="request-empty">${Formato.escaparHTML(error.message)}</p>`;
      });
    });
    this.$("#refresh-requests").addEventListener("click", () => {
      this.actualizar(this.app.usuario).catch((error) => this.mostrarEstado(error.message));
    });
    this.$("#refresh-complex-reservations").addEventListener("click", () => {
      this.actualizarReservasComplejo().catch((error) => this.mostrarEstado(error.message));
    });
    this.$("#back-to-requests").addEventListener("click", () => {
      this.volverALaLista().catch((error) => this.mostrarEstado(error.message));
    });
    e.listaSolicitudes.addEventListener("click", (evento) => {
      const tarjeta = evento.target.closest("[data-solicitud]");
      if (tarjeta) this.mostrarDetalle(tarjeta.dataset.solicitud);
    });
    e.botonDenegar.addEventListener("click", () => {
      if (e.campoMotivo.hidden) {
        e.campoMotivo.hidden = false;
        e.motivo.required = true;
        e.botonDenegar.textContent = "Enviar rechazo";
        e.motivo.focus();
        return;
      }
      this.decidir("denegada");
    });
    e.botonConfirmar.addEventListener("click", () => {
      e.motivo.required = false;
      this.decidir("confirmada");
    });
    e.botonNotificaciones.addEventListener("click", async () => {
      this.app.cancelarReserva.seccion.hidden = true;
      e.notificaciones.hidden = false;
      try {
        await this.actualizarNotificacionesJugador();
      } catch (error) {
        this.app.mostrarMensajeSesion(error.message);
      }
    });
  }
}
