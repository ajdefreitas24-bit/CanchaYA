/**
 * Historia «Registrar complejo» (épica Complejos). Página Complejos/registrar_complejo.html.
 * Sigue el diagrama de actividades paso a paso:
 *
 *   Inicio: el dueño elige «Registrar mi complejo» en la página principal.
 *   1. Buscar las zonas y los deportes (Lista de zonas y deportes) y mostrar el formulario.
 *   2. El dueño ingresa sus datos, los del complejo, la zona y los deportes.
 *      [Cancela]  -> vuelve a la página principal.
 *      [Registra] -> presiona «Registrar».
 *   3. El servidor valida los datos.                     [No válidos]      -> mostrar los errores -> corregir.
 *   4. El servidor verifica si el correo o el RIF existen. [Ya registrado] -> mostrar cuál -> corregir.
 *   5. El servidor crea la cuenta del dueño y registra la solicitud (Pendiente de aprobación).
 *   6. «Solicitud enviada, pendiente de aprobación» -> Presionar «Aceptar» -> vuelve a la página principal.
 *
 * Habla con GET /api/complejos/formulario y POST /api/complejos/registro
 * (Back/Logica/Complejos/registrar_complejo.js).
 */
class RegistrarComplejoPagina extends Pagina {
  constructor() {
    super();
    this.elementos = {
      cargando: this.$("#complex-loading"),
      formulario: this.$("#complex-form"),
      zona: this.$("#zona"),
      deportes: this.$("#deportes-list"),
      error: this.$("#complex-error"),
      botonRegistrar: this.$("#register-complex"),
      botonCancelar: this.$("#cancel-complex")
    };
    this.configurarEventos();
    this.iniciar();
  }

  /** Paso 1: buscar las zonas y los deportes y mostrar el formulario. */
  async iniciar() {
    try {
      const { zonas, deportes } = await this.api.consultar("/api/complejos/formulario");
      this.mostrarFormulario(zonas, deportes);
    } catch (error) {
      this.mostrarTexto(this.elementos.cargando, error.message);
    }
  }

  mostrarFormulario(zonas, deportes) {
    const e = this.elementos;
    e.zona.innerHTML = [
      '<option value="">Selecciona la zona</option>',
      ...zonas.map((zona) => `<option value="${Formato.escaparHTML(zona)}">${Formato.escaparHTML(zona)}</option>`)
    ].join("");
    e.deportes.innerHTML = deportes.map((deporte) => `
      <label class="choice-option"><input type="checkbox" name="deportes" value="${Formato.escaparHTML(deporte.id)}"><span>${Formato.escaparHTML(deporte.icono)} ${Formato.escaparHTML(deporte.nombre)}</span></label>
    `).join("");
    e.cargando.hidden = true;
    e.formulario.hidden = false;
  }

  /** Junta los datos del formulario en un objeto (los deportes van en una lista). */
  leerDatos() {
    const datos = new FormData(this.elementos.formulario);
    return {
      nombre: datos.get("nombre"),
      cedula: datos.get("cedula"),
      telefono: datos.get("telefono"),
      correo: datos.get("correo"),
      password: datos.get("password"),
      nombreComplejo: datos.get("nombreComplejo"),
      rif: datos.get("rif"),
      direccion: datos.get("direccion"),
      zona: datos.get("zona"),
      deportes: datos.getAll("deportes")
    };
  }

  /** [Cancela] -> fin: vuelve a la página principal. */
  alPresionarCancelar() {
    this.volverAlInicio();
  }

  /** [Registra] -> Presionar «Registrar». El servidor hace los pasos 3, 4 y 5. */
  async alPresionarRegistrar(evento) {
    evento.preventDefault();
    const e = this.elementos;
    this.limpiarErroresDeCampos(e.formulario);
    this.mostrarTexto(e.error);
    e.botonRegistrar.disabled = true;
    try {
      const respuesta = await this.api.enviar("/api/complejos/registro", this.leerDatos());
      // Paso 6: «Solicitud enviada, pendiente de aprobación» -> Presionar «Aceptar» -> fin.
      await this.ventana.mostrar(respuesta.mensaje, { boton: "Aceptar" });
      this.volverAlInicio();
    } catch (error) {
      if (error.estado === 400 || error.estado === 409) {
        // Paso 3 [No válidos] o paso 4 [Ya registrado]: se marca cada dato que hay que corregir.
        this.mostrarTexto(e.error, error.message);
        this.mostrarErroresDeCampos(e.formulario, error.datos.errores);
      } else {
        this.mostrarTexto(e.error, error.message);
      }
    } finally {
      e.botonRegistrar.disabled = false;
    }
  }

  configurarEventos() {
    this.elementos.formulario.addEventListener("submit", (evento) => this.alPresionarRegistrar(evento));
    this.elementos.botonCancelar.addEventListener("click", () => this.alPresionarCancelar());
  }
}

new RegistrarComplejoPagina();
