/**
 * Panel del complejo (lo ve el encargado al iniciar sesión). Muestra el nombre
 * del complejo, los accesos a «Agregar cancha» y «Agregar horario» (cada una
 * tiene su propia página) y la lista de los próximos horarios registrados.
 */
class PanelComplejoVista extends Vista {
  constructor(app) {
    super(app);
    this.nombre = this.$("#complex-name");
    this.listaHorarios = this.$("#complex-schedules-list");
  }

  alIniciarSesion(usuario) {
    if (usuario?.tipo !== "complejo") return;
    this.nombre.textContent = `${usuario.nombre}.`;
    this.actualizar(usuario).catch((error) => {
      this.listaHorarios.innerHTML = `<p class="request-empty">${Formato.escaparHTML(error.message)}</p>`;
    });
  }

  async actualizar(usuario) {
    if (usuario?.tipo !== "complejo") return;
    const { canchas, horarios } = await this.api.consultar("/api/complejo/horarios");
    this.renderizarHorarios(canchas, horarios);
  }

  renderizarHorarios(canchas, horarios) {
    if (canchas.length === 0) {
      this.listaHorarios.innerHTML = '<p class="request-empty">Todavía no tienes canchas. Primero agrega una cancha y luego sus horarios.</p>';
      return;
    }
    if (horarios.length === 0) {
      this.listaHorarios.innerHTML = '<p class="request-empty">Todavía no has agregado horarios.</p>';
      return;
    }
    this.listaHorarios.innerHTML = horarios.map((horario) => `
      <article class="request-card court-detail">
        <div><strong>${Formato.escaparHTML(horario.cancha)}</strong>
        <span>${Formato.escaparHTML(Formato.fechaLarga(horario.fecha))} · ${Formato.escaparHTML(horario.horaInicio)} a ${Formato.escaparHTML(horario.horaFin)}</span></div>
      </article>
    `).join("");
  }
}
