const CLAVE = "solicitudesComplejos";
 
// Solicitudes de complejos que quieren unirse al sistema.
// Se suben a localStorage la primera vez. Puedes seguir pegando objetos aquí.
const SEMILLA = [
  {
    id: 1,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "Carlos Mendoza", cedula: "V-12345678", telefono: "0412-5551234", correo: "carlos.mendoza@correo.com" },
    complejo: { nombre: "Complejo Deportivo La Candelaria", direccion: "Av. Urdaneta, esquina Pelota, local 3", zona: "La Candelaria", deportes: ["Fútbol", "Básquet"] },
    descripcion: "Dos canchas techadas con estacionamiento y cafetín. Abierto de 8:00 am a 10:00 pm.",
  },
  {
    id: 2,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "Andrea Salazar", cedula: "V-18765432", telefono: "0414-5559876", correo: "andrea.salazar@correo.com" },
    complejo: { nombre: "Pádel Club Las Mercedes", direccion: "Calle Madrid, Edif. Sport Center, planta baja", zona: "Las Mercedes", deportes: ["Pádel", "Tenis"] },
    descripcion: "Tres canchas de pádel y una de tenis, con vestuarios y alquiler de equipos.",
  },
  {
    id: 3,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "Luis Rojas", cedula: "V-9876543", telefono: "0424-5554321", correo: "luis.rojas@correo.com" },
    complejo: { nombre: "Arena Chacao", direccion: "Av. Francisco de Miranda, cerca de Parque Cristal", zona: "Chacao", deportes: ["Fútbol", "Béisbol"] },
    descripcion: "Cancha de fútbol sala con grama sintética y campo de práctica de béisbol.",
  },
  {
    id: 4,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "Mariana Contreras", cedula: "V-15432876", telefono: "0416-5552468", correo: "mariana.contreras@correo.com" },
    complejo: { nombre: "Tenis Club Altamira", direccion: "Av. San Juan Bosco, entre 2da y 3ra Transversal, local 1", zona: "Altamira", deportes: ["Tenis", "Pádel"] },
    descripcion: "Cuatro canchas de arcilla y una de pádel, con iluminación nocturna y clases para principiantes.",
  },
  {
    id: 5,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "José Hernández", cedula: "V-11876543", telefono: "0426-5551357", correo: "jose.hernandez@correo.com" },
    complejo: { nombre: "Canchas El Paraíso", direccion: "Av. Páez, frente a la plaza, galpón 5", zona: "El Paraíso", deportes: ["Básquet", "Fútbol"] },
    descripcion: "Dos canchas multiuso techadas, con gradas pequeñas y zona de parrilleras para eventos.",
  },
  {
    id: 6,
    estado: "pendiente",
    mensaje: "",
    dueno: { nombre: "Daniela Pinto", cedula: "V-20987654", telefono: "0412-5558642", correo: "daniela.pinto@correo.com" },
    complejo: { nombre: "Diamante Baruta", direccion: "Calle Los Pinos, Urb. La Trinidad, local 8", zona: "Baruta", deportes: ["Béisbol", "Fútbol"] },
    descripcion: "Campo de softbol y cancha de fútbol 7 con grama natural. Ideal para ligas de fin de semana.",
  },
];
 
/* ===================== MODELO ===================== */
 
class Dueno {
  constructor({ nombre, cedula, telefono, correo }) {
    this.nombre = nombre;
    this.cedula = cedula;
    this.telefono = telefono;
    this.correo = correo;
  }
}
 
class Complejo {
  constructor({ nombre, direccion, zona, deportes }) {
    this.nombre = nombre;
    this.direccion = direccion;
    this.zona = zona;
    this.deportes = deportes;
  }
}
 
// Una solicitud sabe aceptarse y denegarse; su estado solo cambia por esos métodos.
class Solicitud {
  #estado;
  #mensaje;
 
  constructor({ id, dueno, complejo, descripcion, estado = "pendiente", mensaje = "" }) {
    this.id = id;
    this.dueno = new Dueno(dueno);
    this.complejo = new Complejo(complejo);
    this.descripcion = descripcion;
    this.#estado = estado;
    this.#mensaje = mensaje;
  }
 
  get estado() { return this.#estado; }
  get mensaje() { return this.#mensaje; }
  get pendiente() { return this.#estado === "pendiente"; }
 
  aceptar() {
    this.#exigirPendiente();
    this.#estado = "aceptada";
  }
 
  denegar(mensaje) {
    this.#exigirPendiente();
    const texto = mensaje.trim();
    if (!texto) throw new Error("Al denegar hay que escribir un mensaje.");
    this.#estado = "denegada";
    this.#mensaje = texto;
  }
 
  #exigirPendiente() {
    if (!this.pendiente) throw new Error("La solicitud ya fue respondida.");
  }
 
  // Los campos privados no se serializan solos, por eso se define aquí.
  toJSON() {
    return {
      id: this.id,
      estado: this.#estado,
      mensaje: this.#mensaje,
      dueno: this.dueno,
      complejo: this.complejo,
      descripcion: this.descripcion,
    };
  }
}
 
// Guarda y carga las solicitudes en localStorage.
class RepositorioSolicitudes {
  #clave;
  #solicitudes;
 
  constructor(clave, semilla) {
    this.#clave = clave;
    this.#solicitudes = this.#cargar() ?? semilla.map((datos) => new Solicitud(datos));
    this.guardar();
  }
 
  get todas() { return this.#solicitudes; }
  get pendientes() { return this.#solicitudes.filter((s) => s.pendiente).length; }
 
  guardar() {
    localStorage.setItem(this.#clave, JSON.stringify(this.#solicitudes));
  }
 
  #cargar() {
    try {
      const datos = JSON.parse(localStorage.getItem(this.#clave));
      return datos?.map((d) => new Solicitud(d)) ?? null;
    } catch {
      return null;
    }
  }
}
 
/* ===================== VISTA ===================== */
 
class Dom {
  static crear(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto) nodo.textContent = texto;
    return nodo;
  }
}
 
// Aviso temporal en pantalla. Se crea desde JS, no hace falta HTML.
class Notificacion {
  static exito(texto, ms = 3000) {
    const aviso = Dom.crear("div", "toast selection-message", texto);
    aviso.setAttribute("role", "status");
    document.body.append(aviso);
    setTimeout(() => aviso.remove(), ms);
  }
}
 
// Dibuja una sola solicitud y avisa cuando el usuario decide.
class TarjetaSolicitud {
  #solicitud;
  #alDecidir;
 
  constructor(solicitud, alDecidir) {
    this.#solicitud = solicitud;
    this.#alDecidir = alDecidir;
  }
 
  render() {
    const s = this.#solicitud;
    const { dueno: d, complejo: c } = s;
    const caja = Dom.crear("article", "request-card");
    const info = Dom.crear("div", "request-data");
    info.append(
      this.#grupo("Dueño", [["Nombre", d.nombre], ["Cédula", d.cedula], ["Teléfono", d.telefono], ["Correo", d.correo]]),
      this.#grupo("Complejo", [["Nombre", c.nombre], ["Dirección", c.direccion], ["Zona", c.zona], ["Deportes", c.deportes.join(", ")]])
    );
    caja.append(info, Dom.crear("p", "request-description", s.descripcion));
    caja.append(...(s.pendiente ? this.#controles() : [this.#resultado()]));
    return caja;
  }
 
  #grupo(titulo, filas) {
    const grupo = Dom.crear("div");
    const dl = Dom.crear("dl");
    for (const [etiqueta, valor] of filas) {
      const fila = Dom.crear("div");
      fila.append(Dom.crear("dt", "", etiqueta), Dom.crear("dd", "", valor));
      dl.append(fila);
    }
    grupo.append(Dom.crear("h3", "", titulo), dl);
    return grupo;
  }
 
  #resultado() {
    const s = this.#solicitud;
    return s.estado === "aceptada"
      ? Dom.crear("p", "selection-message", "Aceptada")
      : Dom.crear("p", "error-message", `Denegada. Mensaje: ${s.mensaje}`);
  }
 
  // Botones Aceptar/Denegar + formulario de mensaje (oculto hasta pulsar Denegar)
  #controles() {
    const s = this.#solicitud;
 
    const acciones = Dom.crear("div", "request-actions");
    const aceptar = Dom.crear("button", "primary-button", "Aceptar");
    const denegar = Dom.crear("button", "deny-button", "Denegar");
    aceptar.type = denegar.type = "button";
    acciones.append(aceptar, denegar);
 
    const form = Dom.crear("form", "deny-form");
    form.hidden = true;
    const campo = Dom.crear("textarea");
    campo.required = true;
    campo.placeholder = "Escribe el motivo de la denegación";
    campo.setAttribute("aria-label", "Mensaje de denegación");
    const botones = Dom.crear("div", "request-actions");
    const enviar = Dom.crear("button", "deny-button", "Enviar y denegar");
    const cancelar = Dom.crear("button", "text-button", "Cancelar");
    cancelar.type = "button";
    botones.append(enviar, cancelar);
    form.append(campo, botones);
 
    aceptar.addEventListener("click", () => {
      s.aceptar();
      this.#alDecidir("Solicitud aceptada con éxito.");
    });
    denegar.addEventListener("click", () => {
      acciones.hidden = true;
      form.hidden = false;
      campo.focus();
    });
    cancelar.addEventListener("click", () => {
      form.hidden = true;
      acciones.hidden = false;
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!campo.value.trim()) return;
      s.denegar(campo.value);
      this.#alDecidir("Solicitud denegada. El mensaje fue enviado.");
    });
 
    return [acciones, form];
  }
}
 
// Controla la caja grande: dibuja las tarjetas y guarda tras cada decisión.
class PanelSolicitudes {
  #repositorio;
  #lista;
  #contador;
 
  constructor(repositorio, lista, contador) {
    this.#repositorio = repositorio;
    this.#lista = lista;
    this.#contador = contador;
  }
 
  render() {
    const tarjetas = this.#repositorio.todas.map((s) => new TarjetaSolicitud(s, (aviso) => this.#alDecidir(aviso)).render());
    this.#lista.replaceChildren(...tarjetas);
    this.#contador.textContent = `${this.#repositorio.pendientes} pendientes`;
  }
 
  #alDecidir(aviso) {
    this.#repositorio.guardar();
    this.render();
    Notificacion.exito(aviso);
  }
}
 
/* ===================== INICIO ===================== */
 
const repositorio = new RepositorioSolicitudes(CLAVE, SEMILLA);
new PanelSolicitudes(
  repositorio,
  document.getElementById("lista"),
  document.getElementById("contador")
).render();