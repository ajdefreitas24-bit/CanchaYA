// Estado de navegación y selección de la interfaz; la disponibilidad real siempre se consulta al servidor.
const state = {
  deportes: [],
  fechaActual: "",
  deporte: null,
  cancha: null,
  fecha: "",
  inicioSemana: 0,
  horarios: [],
  horariosSeleccionados: new Set()
};

const elementos = {
  landing: document.querySelector("#landing-view"),
  jugador: document.querySelector("#player-view"),
  administrador: document.querySelector("#admin-view"),
  reservas: document.querySelector("#booking-view"),
  botonInicio: document.querySelector("#home-button"),
  listaDeportes: document.querySelector("#sports-list"),
  cantidadDeportes: document.querySelector("#sport-count"),
  resumenCatalogo: document.querySelector("#catalog-summary"),
  seccionCanchas: document.querySelector("#courts-section"),
  listaCanchas: document.querySelector("#courts-list"),
  seccionDetalles: document.querySelector("#details-section"),
  resumenCancha: document.querySelector("#court-summary"),
  listaFechas: document.querySelector("#dates-list"),
  rangoFechas: document.querySelector("#calendar-range"),
  fechaDisponibilidad: document.querySelector("#availability-date"),
  listaHorarios: document.querySelector("#slots-list"),
  mensajeSeleccion: document.querySelector("#selection-message"),
  accionesSeleccion: document.querySelector("#selection-actions"),
  mensajeError: document.querySelector("#error-message"),
  pasos: [
    document.querySelector("#step-sport"),
    document.querySelector("#step-court"),
    document.querySelector("#step-date")
  ]
};

function escaparHTML(valor) {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function mostrarVista(vista) {
  for (const seccion of [elementos.landing, elementos.jugador, elementos.administrador, elementos.reservas]) {
    seccion.hidden = seccion !== vista;
  }
  elementos.botonInicio.hidden = vista === elementos.landing;
  ocultarError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarError(mensaje) {
  elementos.mensajeError.textContent = mensaje;
  elementos.mensajeError.hidden = false;
}

function ocultarError() {
  elementos.mensajeError.hidden = true;
  elementos.mensajeError.textContent = "";
}

async function consultarAPI(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) {
    throw new Error(datos.error || "No se pudo completar la solicitud.");
  }
  return datos;
}

function actualizarPasos(paso) {
  elementos.pasos.forEach((elemento, indice) => {
    elemento.classList.toggle("active", indice === paso);
    elemento.classList.toggle("complete", indice < paso);
  });
}

function renderizarDeportes() {
  elementos.cantidadDeportes.textContent = `${String(state.deportes.length).padStart(2, "0")} DEPORTES`;
  elementos.listaDeportes.innerHTML = state.deportes.map((deporte) => `
    <button class="sport-card${state.deporte?.id === deporte.id ? " selected" : ""}" type="button" data-deporte="${escaparHTML(deporte.id)}">
      <span class="sport-icon" aria-hidden="true">${escaparHTML(deporte.icono)}</span>
      <span class="sport-name">${escaparHTML(deporte.nombre)}</span>
      <span class="sport-description">${escaparHTML(deporte.descripcion)}</span>
      <span class="sport-arrow" aria-hidden="true">↗</span>
    </button>
  `).join("");
}

async function seleccionarDeporte(id) {
  const deporte = state.deportes.find((elemento) => elemento.id === id);
  if (!deporte) return;

  ocultarError();
  state.deporte = deporte;
  state.cancha = null;
  state.horariosSeleccionados.clear();
  elementos.seccionDetalles.hidden = true;
  elementos.seccionCanchas.hidden = false;
  elementos.listaCanchas.innerHTML = '<p class="loading-message">Buscando canchas...</p>';
  document.querySelector("#courts-heading").textContent = `Canchas de ${deporte.nombre}`;
  renderizarDeportes();
  actualizarPasos(1);
  elementos.seccionCanchas.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const canchas = await consultarAPI(`/api/canchas?deporte=${encodeURIComponent(deporte.id)}`);
    elementos.listaCanchas.innerHTML = canchas.map((cancha) => `
      <button class="court-card${state.cancha?.id === cancha.id ? " selected" : ""}" type="button" data-cancha="${escaparHTML(cancha.id)}">
        <span class="court-card-top"><span class="court-marker" aria-hidden="true">✳</span><span class="court-price">$${escaparHTML(cancha.precioPorHora)}<small> / hora</small></span></span>
        <span class="court-name">${escaparHTML(cancha.nombre)}</span>
        <span class="court-complex">${escaparHTML(cancha.complejo)}</span>
        <span class="court-location">⌖ &nbsp;${escaparHTML(cancha.ubicacion)}</span>
        <span class="court-card-action">Ver disponibilidad <span aria-hidden="true">→</span></span>
      </button>
    `).join("");
  } catch (error) {
    mostrarError(error.message);
    elementos.listaCanchas.innerHTML = "";
  }
}

// Se fija el formato local al mediodía para que la fecha no cambie por ajustes de zona horaria.
function formatearFecha(fecha, opciones) {
  return new Intl.DateTimeFormat("es-VE", opciones).format(new Date(`${fecha}T12:00:00`));
}

function renderizarFechas() {
  const fechas = Array.from({ length: 31 }, (_, indice) => {
    const fecha = new Date(`${state.fechaActual}T12:00:00`);
    fecha.setDate(fecha.getDate() + indice);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  });
  const visibles = fechas.slice(state.inicioSemana, state.inicioSemana + 7);
  elementos.listaFechas.innerHTML = visibles.map((fecha, indice) => `
    <button class="date-card${fecha === state.fecha ? " selected" : ""}" type="button" data-fecha="${fecha}" aria-pressed="${fecha === state.fecha}">
      <span>${indice === 0 && state.inicioSemana === 0 ? "HOY" : escaparHTML(formatearFecha(fecha, { weekday: "short" }).replace(".", ""))}</span>
      <strong>${escaparHTML(formatearFecha(fecha, { day: "2-digit" }))}</strong>
      <small>${escaparHTML(formatearFecha(fecha, { month: "short" }).replace(".", ""))}</small>
    </button>
  `).join("");
  const primera = visibles[0];
  const ultima = visibles[visibles.length - 1];
  elementos.rangoFechas.textContent = `${formatearFecha(primera, { day: "numeric", month: "short" })} – ${formatearFecha(ultima, { day: "numeric", month: "short" })}`;
  document.querySelector("#previous-dates").disabled = state.inicioSemana === 0;
  document.querySelector("#next-dates").disabled = state.inicioSemana + 7 >= fechas.length;
}

// Los horarios bloqueados permanecen visibles y solo reciben una marca informativa.
function renderizarHorarios() {
  elementos.fechaDisponibilidad.textContent = formatearFecha(state.fecha, { weekday: "long", day: "numeric", month: "long" });
  if (state.horarios.length === 0) {
    elementos.listaHorarios.innerHTML = '<p class="empty-message">No quedan horarios disponibles para esta fecha. Prueba con otro día.</p>';
    return;
  }

  elementos.listaHorarios.innerHTML = state.horarios.map((horario) => {
    const seleccionado = state.horariosSeleccionados.has(horario.inicio);
    return `
      <button class="slot-card${seleccionado ? " selected" : ""}" type="button" data-hora="${escaparHTML(horario.inicio)}" aria-pressed="${seleccionado}">
        <strong>${escaparHTML(horario.inicio)}</strong><span>– ${escaparHTML(horario.fin)}</span>
        <small>${seleccionado ? "Seleccionado" : horario.bloqueado ? "En proceso" : "Elegir"}</small>
      </button>
    `;
  }).join("");
}

async function cargarDisponibilidad() {
  ocultarError();
  state.horariosSeleccionados.clear();
  elementos.accionesSeleccion.hidden = true;
  elementos.listaHorarios.innerHTML = '<p class="loading-message">Consultando horarios...</p>';
  try {
    const datos = await consultarAPI(`/api/canchas/${encodeURIComponent(state.cancha.id)}/disponibilidad?fecha=${encodeURIComponent(state.fecha)}`);
    state.horarios = datos.horarios;
    renderizarFechas();
    renderizarHorarios();
  } catch (error) {
    elementos.listaHorarios.innerHTML = "";
    mostrarError(error.message);
  }
}

async function seleccionarCancha(id) {
  ocultarError();
  try {
    state.cancha = await consultarAPI(`/api/canchas/${encodeURIComponent(id)}`);
    state.fecha = state.fechaActual;
    state.inicioSemana = 0;
    state.horariosSeleccionados.clear();
    elementos.seccionDetalles.hidden = false;
    actualizarPasos(2);
    elementos.resumenCancha.innerHTML = `
      <span class="summary-icon" aria-hidden="true">${escaparHTML(state.deporte.icono)}</span>
      <div class="summary-main"><span class="section-kicker">${escaparHTML(state.cancha.deporte)} · ${escaparHTML(state.cancha.complejo)}</span><h3>${escaparHTML(state.cancha.nombre)}</h3><span class="court-location">⌖ &nbsp;${escaparHTML(state.cancha.ubicacion)}</span></div>
      <div class="summary-specs"><span>${escaparHTML(state.cancha.superficie)}</span><span>${escaparHTML(state.cancha.capacidad)}</span></div>
      <div class="summary-price"><strong>$${escaparHTML(state.cancha.precioPorHora)}</strong><span>por hora</span></div>
    `;
    renderizarFechas();
    elementos.seccionDetalles.scrollIntoView({ behavior: "smooth", block: "start" });
    await cargarDisponibilidad();
  } catch (error) {
    mostrarError(error.message);
  }
}

elementos.landing.querySelector("#player-entry").addEventListener("click", () => mostrarVista(elementos.jugador));
elementos.landing.querySelector("#admin-entry").addEventListener("click", () => mostrarVista(elementos.administrador));
elementos.botonInicio.addEventListener("click", () => mostrarVista(elementos.landing));
elementos.jugador.querySelector("#open-booking").addEventListener("click", () => mostrarVista(elementos.reservas));

elementos.listaDeportes.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-deporte]");
  if (boton) seleccionarDeporte(boton.dataset.deporte);
});
elementos.listaCanchas.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-cancha]");
  if (boton) seleccionarCancha(boton.dataset.cancha);
});
elementos.listaFechas.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-fecha]");
  if (!boton || boton.dataset.fecha === state.fecha) return;
  state.fecha = boton.dataset.fecha;
  cargarDisponibilidad();
});
elementos.listaHorarios.addEventListener("click", (evento) => {
  const boton = evento.target.closest("[data-hora]");
  if (!boton) return;
  if (state.horariosSeleccionados.has(boton.dataset.hora)) {
    state.horariosSeleccionados.delete(boton.dataset.hora);
  } else {
    state.horariosSeleccionados.add(boton.dataset.hora);
  }
  renderizarHorarios();
  const cantidad = state.horariosSeleccionados.size;
  elementos.accionesSeleccion.hidden = cantidad === 0;
  if (cantidad > 0) {
    const seleccion = [...state.horariosSeleccionados].sort();
    elementos.mensajeSeleccion.textContent = `Seleccionaste ${cantidad} horario${cantidad === 1 ? "" : "s"} para el ${formatearFecha(state.fecha, { day: "numeric", month: "long" })}: ${seleccion.join(", ")}.`;
  }
});

document.querySelector("#change-sport").addEventListener("click", () => {
  state.deporte = null;
  state.cancha = null;
  state.horariosSeleccionados.clear();
  elementos.seccionCanchas.hidden = true;
  elementos.seccionDetalles.hidden = true;
  renderizarDeportes();
  actualizarPasos(0);
  document.querySelector("#sports-heading").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#change-court").addEventListener("click", () => {
  elementos.seccionDetalles.hidden = true;
  state.cancha = null;
  state.horariosSeleccionados.clear();
  actualizarPasos(1);
  elementos.seccionCanchas.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#previous-dates").addEventListener("click", () => {
  state.inicioSemana = Math.max(0, state.inicioSemana - 7);
  renderizarFechas();
});
document.querySelector("#next-dates").addEventListener("click", () => {
  state.inicioSemana = Math.min(28, state.inicioSemana + 7);
  renderizarFechas();
});
document.querySelector("#confirm-selection").addEventListener("click", async (evento) => {
  if (state.horariosSeleccionados.size === 0) return;
  const boton = evento.currentTarget;
  boton.disabled = true;
  ocultarError();

  try {
    const resultado = await consultarAPI("/api/reservas/bloquear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canchaId: state.cancha.id,
        fecha: state.fecha,
        horarios: [...state.horariosSeleccionados].sort()
      })
    });
    const parametros = new URLSearchParams({
      reserva: resultado.reservaId,
      deporte: state.deporte.id,
      cancha: state.cancha.id,
      fecha: state.fecha
    });
    window.location.href = `/HTML/Reservas/reservar.html?${parametros}`;
  } catch (error) {
    state.horariosSeleccionados.clear();
    elementos.accionesSeleccion.hidden = true;
    await cargarDisponibilidad();
    mostrarError(error.message);
  } finally {
    boton.disabled = false;
  }
});

// Al volver desde el formulario se reconstruye el deporte, la cancha y la fecha seleccionados.
async function restaurarPantallaDeHorarios() {
  const parametros = new URLSearchParams(window.location.search);
  const deporteId = parametros.get("deporte");
  const canchaId = parametros.get("cancha");
  const fecha = parametros.get("fecha");
  if (!deporteId || !canchaId || !fecha) return;

  const fechaSeleccionada = new Date(`${fecha}T12:00:00`);
  const fechaActual = new Date(`${state.fechaActual}T12:00:00`);
  const diasDesdeHoy = Math.round((fechaSeleccionada - fechaActual) / 86400000);
  if (diasDesdeHoy < 0 || diasDesdeHoy > 30) return;

  mostrarVista(elementos.reservas);
  await seleccionarDeporte(deporteId);
  await seleccionarCancha(canchaId);
  if (state.cancha?.id !== canchaId) return;

  state.fecha = fecha;
  state.inicioSemana = Math.floor(diasDesdeHoy / 7) * 7;
  await cargarDisponibilidad();
  if (parametros.get("cancelada") === "1") {
    mostrarError("La reserva fue cancelada y los horarios quedaron liberados.");
  }
}

consultarAPI("/api/deportes")
  .then((datos) => {
    state.deportes = datos.deportes;
    state.fechaActual = datos.fechaActual;
    state.fecha = datos.fechaActual;
    elementos.resumenCatalogo.textContent = `${datos.deportes.length} deportes · ${datos.cantidadCanchas} canchas de muestra`;
    renderizarDeportes();
    return restaurarPantallaDeHorarios();
  })
  .catch((error) => {
    elementos.cantidadDeportes.textContent = "NO DISPONIBLE";
    mostrarError(error.message);
  });
