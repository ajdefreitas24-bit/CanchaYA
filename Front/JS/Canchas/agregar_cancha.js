/**
 * Historia «Agregar cancha» (épica Canchas). Página Canchas/agregar_cancha.html.
 * El encargado del complejo (ya aprobado) publica una cancha: deporte (solo los
 * que ofrece su complejo), nombre, ubicación, capacidad, precio por hora y foto.
 * También puede editar las canchas que ya tiene.
 * Habla con GET, POST y PATCH /api/complejo/canchas.
 */
class AgregarCanchaPagina extends Pagina {
  constructor() {
    super();
    this.canchas = [];
    this.canchaEditandoId = null;
    this.elementos = {
      formulario: this.$("#court-form"),
      titulo: this.$("#court-form-title"),
      deporte: this.$("#court-sport"),
      nombre: this.$("#court-name"),
      ubicacion: this.$("#court-location"),
      capacidad: this.$("#court-capacity"),
      precio: this.$("#court-price"),
      foto: this.$("#court-photo"),
      vistaPrevia: this.$("#court-photo-preview"),
      error: this.$("#court-form-error"),
      botonCancelarEdicion: this.$("#cancel-court-edit"),
      botonGuardar: this.$("#save-court"),
      lista: this.$("#complex-courts-list")
    };
    this.configurarEventos();
    this.iniciar();
  }

  async iniciar() {
    if (!(await this.exigirSesion("complejo"))) return;
    try {
      const [{ deportes }, { ubicaciones }, misCanchas] = await Promise.all([
        this.api.consultar("/api/deportes"),
        this.api.consultar("/api/ubicaciones"),
        this.api.consultar("/api/complejo/canchas")
      ]);
      this.zonaDelComplejo = misCanchas.zona;
      this.llenarOpciones(deportes.filter((deporte) => misCanchas.deportes.includes(deporte.id)), ubicaciones);
      this.reiniciarFormulario();
      this.mostrarCanchas(misCanchas.canchas);
    } catch (error) {
      this.mostrarTexto(this.elementos.error, error.message);
    }
  }

  /** Solo aparecen los deportes que el complejo registró al hacer su solicitud. */
  llenarOpciones(deportes, ubicaciones) {
    this.elementos.deporte.innerHTML = [
      '<option value="">Selecciona un deporte</option>',
      ...deportes.map((deporte) => `<option value="${Formato.escaparHTML(deporte.id)}">${Formato.escaparHTML(deporte.nombre)}</option>`)
    ].join("");
    this.elementos.ubicacion.innerHTML = [
      '<option value="">Selecciona una ubicación</option>',
      ...ubicaciones.map((zona) => `<option value="${Formato.escaparHTML(zona)}">${Formato.escaparHTML(zona)}</option>`)
    ].join("");
  }

  mostrarCanchas(canchas) {
    this.canchas = canchas;
    if (canchas.length === 0) {
      this.elementos.lista.innerHTML = '<p class="request-empty">Todavía no has registrado canchas.</p>';
      return;
    }
    this.elementos.lista.innerHTML = canchas.map((cancha) => `
      <article class="request-card court-detail">
        ${cancha.fotoUrl ? `<img class="court-thumbnail" src="${Formato.escaparHTML(cancha.fotoUrl)}" alt="Foto de ${Formato.escaparHTML(cancha.nombre)}">` : ""}
        <div><strong>${Formato.escaparHTML(cancha.nombre)} · ${Formato.escaparHTML(cancha.deporte)}</strong>
        <span>${Formato.escaparHTML(cancha.ubicacion)} · ${Formato.escaparHTML(cancha.capacidad)}</span>
        <small>$${Formato.escaparHTML(cancha.precioPorHora)} por hora</small></div>
        <button class="secondary-button edit-court-button" type="button" data-cancha-editar="${Formato.escaparHTML(cancha.id)}">Editar</button>
      </article>
    `).join("");
  }

  /** Deja el formulario vacío para publicar una cancha nueva. */
  reiniciarFormulario() {
    const e = this.elementos;
    this.canchaEditandoId = null;
    e.formulario.reset();
    if (this.zonaDelComplejo) e.ubicacion.value = this.zonaDelComplejo;
    e.foto.required = true;
    e.vistaPrevia.hidden = true;
    e.vistaPrevia.removeAttribute("src");
    e.botonCancelarEdicion.hidden = true;
    e.botonGuardar.innerHTML = 'Publicar cancha <span aria-hidden="true">→</span>';
    e.titulo.textContent = "Datos de la cancha";
    this.mostrarTexto(e.error);
  }

  /** Llena el formulario con una cancha existente para editarla. */
  editar(cancha) {
    const e = this.elementos;
    this.reiniciarFormulario();
    this.canchaEditandoId = cancha.id;
    e.deporte.value = cancha.deporteId;
    e.nombre.value = cancha.nombre;
    e.ubicacion.value = cancha.ubicacionSector;
    e.capacidad.value = cancha.capacidadPersonas;
    e.precio.value = cancha.precioPorHora;
    e.foto.required = false; // si no elige otra foto, se queda la que tenía
    if (cancha.fotoUrl) {
      e.vistaPrevia.src = cancha.fotoUrl;
      e.vistaPrevia.hidden = false;
    }
    e.botonCancelarEdicion.hidden = false;
    e.botonGuardar.innerHTML = 'Guardar cambios <span aria-hidden="true">→</span>';
    e.titulo.textContent = "Editar cancha";
    e.formulario.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Revisa en el navegador el tipo y el tamaño de la foto antes de enviarla. */
  revisarFoto() {
    const archivo = this.elementos.foto.files[0];
    if (!archivo) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type) || archivo.size > 5 * 1024 * 1024) {
      this.elementos.foto.value = "";
      this.mostrarTexto(this.elementos.error, "Selecciona una imagen PNG, JPG o WEBP de máximo 5 MB.");
      return;
    }
    this.elementos.vistaPrevia.src = URL.createObjectURL(archivo);
    this.elementos.vistaPrevia.hidden = false;
    this.mostrarTexto(this.elementos.error);
  }

  /** Envía la cancha al servidor, que valida los datos y la guarda. */
  async guardar(evento) {
    evento.preventDefault();
    const e = this.elementos;
    this.mostrarTexto(e.error);
    e.botonGuardar.disabled = true;
    const datos = {
      deporteId: e.deporte.value,
      nombre: e.nombre.value,
      ubicacion: e.ubicacion.value,
      capacidad: Number(e.capacidad.value),
      precioPorHora: Number(e.precio.value)
    };
    try {
      const foto = e.foto.files[0];
      if (foto) datos.foto = await ApiCliente.leerArchivo(foto);
      const editando = Boolean(this.canchaEditandoId);
      await (editando
        ? this.api.enviar(`/api/complejo/canchas/${encodeURIComponent(this.canchaEditandoId)}`, datos, "PATCH")
        : this.api.enviar("/api/complejo/canchas", datos));
      this.reiniciarFormulario();
      this.mostrarCanchas((await this.api.consultar("/api/complejo/canchas")).canchas);
      await this.ventana.mostrar(editando
        ? "La información de la cancha se actualizó."
        : "La cancha se publicó y ya está disponible para los jugadores.");
    } catch (error) {
      this.mostrarTexto(e.error, error.message);
    } finally {
      e.botonGuardar.disabled = false;
    }
  }

  configurarEventos() {
    const e = this.elementos;
    e.formulario.addEventListener("submit", (evento) => this.guardar(evento));
    e.foto.addEventListener("change", () => this.revisarFoto());
    e.botonCancelarEdicion.addEventListener("click", () => this.reiniciarFormulario());
    e.lista.addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-cancha-editar]");
      const cancha = boton && this.canchas.find((item) => item.id === boton.dataset.canchaEditar);
      if (cancha) this.editar(cancha);
    });
    this.conectarCerrarSesion(this.$("#logout-button"));
  }
}

new AgregarCanchaPagina();
