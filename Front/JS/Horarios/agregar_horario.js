/**
 * Historia «Agregar horario» (épica Horarios). Página Horarios/agregar_horario.html.
 * Sigue el diagrama de actividades paso a paso:
 *
 *   Inicio: viene del panel de su complejo; el encargado ya inició sesión.
 *   1. Buscar si el complejo tiene canchas (Lista de canchas).
 *      [No]  -> «Primero debe agregar una cancha» -> OK -> vuelve al panel.
 *      [Sí]  -> mostrar el formulario con la lista de canchas.
 *   2. El encargado elige la cancha e ingresa fecha, hora de inicio y hora de fin.
 *      [Cancela] -> vuelve al panel.
 *      [Guarda]  -> presiona «Guardar».
 *   3. El servidor valida los datos.        [No válidos]   -> mostrar los datos faltantes -> corregir.
 *   4. El servidor verifica la superposición. [Se superpone] -> mostrar el horario con el que choca -> corregir.
 *   5. El servidor registra el horario -> «Horario registrado con éxito» -> OK -> vuelve al panel.
 *
 * Habla con GET y POST /api/complejo/horarios (Back/Logica/Horarios/agregar_horario.js).
 */
class AgregarHorarioPagina extends Pagina {
  /** Las horas van en punto, de 07:00 a 22:00 (igual que en el servidor). */
  static HORA_MINIMA = 7;
  static HORA_MAXIMA = 22;

  constructor() {
    super();
    this.listaDeCanchas = [];
    this.elementos = {
      cargando: this.$("#schedule-loading"),
      formulario: this.$("#schedule-form"),
      cancha: this.$("#canchaId"),
      fecha: this.$("#fecha"),
      horaInicio: this.$("#horaInicio"),
      horaFin: this.$("#horaFin"),
      superpuesto: this.$("#overlap-message"),
      error: this.$("#schedule-error"),
      botonGuardar: this.$("#save-schedule"),
      botonCancelar: this.$("#cancel-schedule")
    };
    this.configurarEventos();
    this.iniciar();
  }

  /** Inicio del diagrama y paso 1: buscar si el complejo tiene canchas. */
  async iniciar() {
    if (!(await this.exigirSesion("complejo"))) return;
    try {
      const { canchas } = await this.api.consultar("/api/complejo/horarios");
      this.listaDeCanchas = canchas;
    } catch (error) {
      this.mostrarTexto(this.elementos.cargando, error.message);
      return;
    }

    // ¿Tiene canchas? [No] -> mensaje -> Presionar OK -> fin (vuelve al panel).
    if (this.listaDeCanchas.length === 0) {
      this.elementos.cargando.hidden = true;
      await this.ventana.mostrar("Primero debe agregar una cancha", { boton: "OK", tipo: "aviso" });
      this.volverAlInicio();
      return;
    }

    // [Sí] -> mostrar el formulario con la lista de canchas.
    this.mostrarFormulario(this.listaDeCanchas);
  }

  /** Muestra el formulario: lista de canchas, fecha y las horas en punto permitidas. */
  mostrarFormulario(canchas) {
    const e = this.elementos;
    e.cancha.innerHTML = [
      '<option value="">Selecciona la cancha</option>',
      ...canchas.map((cancha) => `<option value="${Formato.escaparHTML(cancha.id)}">${Formato.escaparHTML(cancha.nombre)}</option>`)
    ].join("");
    e.fecha.min = Formato.hoy();
    const horas = [];
    for (let hora = AgregarHorarioPagina.HORA_MINIMA; hora <= AgregarHorarioPagina.HORA_MAXIMA; hora++) {
      horas.push(`${String(hora).padStart(2, "0")}:00`);
    }
    const opciones = horas.map((hora) => `<option value="${hora}">${hora}</option>`).join("");
    e.horaInicio.innerHTML = `<option value="">Hora de inicio</option>${opciones}`;
    e.horaFin.innerHTML = `<option value="">Hora de fin</option>${opciones}`;
    e.cargando.hidden = true;
    e.formulario.hidden = false;
  }

  /** [Cancela] -> fin: vuelve al panel de su complejo. */
  alPresionarCancelar() {
    this.volverAlInicio();
  }

  /** [Guarda] -> Presionar «Guardar». El servidor hace los pasos 3, 4 y 5. */
  async alPresionarGuardar(evento) {
    evento.preventDefault();
    const e = this.elementos;
    this.limpiarErroresDeCampos(e.formulario);
    this.mostrarTexto(e.superpuesto);
    this.mostrarTexto(e.error);
    e.botonGuardar.disabled = true;
    try {
      const respuesta = await this.api.enviar("/api/complejo/horarios", {
        canchaId: e.cancha.value,
        fecha: e.fecha.value,
        horaInicio: e.horaInicio.value,
        horaFin: e.horaFin.value
      });
      // Paso 5: mensaje «Horario registrado con éxito» -> Presionar OK -> fin (vuelve al panel).
      await this.ventana.mostrar(respuesta.mensaje, { boton: "OK" });
      this.volverAlInicio();
    } catch (error) {
      if (error.estado === 400) {
        this.mostrarDatosFaltantes(error.datos.errores);      // paso 3: [No válidos]
      } else if (error.estado === 409) {
        this.mostrarHorarioSuperpuesto(error.message);         // paso 4: [Se superpone]
      } else {
        this.mostrarTexto(e.error, error.message);
      }
    } finally {
      e.botonGuardar.disabled = false;
    }
  }

  /** Paso 3 [No válidos]: señala cada dato faltante o inválido; el encargado corrige y vuelve a guardar. */
  mostrarDatosFaltantes(errores) {
    this.mostrarErroresDeCampos(this.elementos.formulario, errores);
  }

  /** Paso 4 [Se superpone]: muestra el horario con el que choca; el encargado corrige y vuelve a guardar. */
  mostrarHorarioSuperpuesto(mensaje) {
    this.mostrarTexto(this.elementos.superpuesto, mensaje);
    this.elementos.horaInicio.setAttribute("aria-invalid", "true");
    this.elementos.horaFin.setAttribute("aria-invalid", "true");
  }

  configurarEventos() {
    this.elementos.formulario.addEventListener("submit", (evento) => this.alPresionarGuardar(evento));
    this.elementos.botonCancelar.addEventListener("click", () => this.alPresionarCancelar());
    this.conectarCerrarSesion(this.$("#logout-button"));
  }
}

new AgregarHorarioPagina();
