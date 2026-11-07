const reservaId = new URLSearchParams(window.location.search).get("reserva");
const formulario = document.querySelector("#reservation-form");
const campos = ["nombre", "cedula", "correo", "telefono", "jugadores"];
const errorGeneral = document.querySelector("#form-error");
let intervaloLatido;
let salidaLiberada = false;

// El formulario utiliza la API para validar los datos y mantener vigente su bloqueo temporal.
async function consultarAPI(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  const datos = respuesta.status === 204 ? {} : await respuesta.json();
  if (!respuesta.ok) throw Object.assign(new Error(datos.error || "No se pudo completar la solicitud."), { respuesta, datos });
  return datos;
}

function mostrarErrorGeneral(mensaje) {
  errorGeneral.textContent = mensaje;
  errorGeneral.hidden = false;
}

function mostrarResumen(reserva) {
  document.querySelector("#reservation-summary").innerHTML = `
    <div><span class="section-kicker">${reserva.cancha.deporte} · ${reserva.cancha.complejo}</span><h2>${reserva.cancha.nombre}</h2><p>${reserva.fecha} · ${reserva.horarios.join(", ")}</p></div>
    <div class="summary-price"><strong>$${reserva.cancha.precioPorHora * reserva.horarios.length}</strong><span>total estimado</span></div>
  `;
  const equipos = reserva.cancha.capacidad.match(/(\d+)\s*vs\.\s*(\d+)/i);
  document.querySelector("#jugadores").max = equipos
    ? Number(equipos[1]) + Number(equipos[2])
    : Math.max(...(reserva.cancha.capacidad.match(/\d+/g) || ["1"]).map(Number));
}

function limpiarErrores() {
  for (const campo of campos) {
    const input = document.querySelector(`#${campo}`);
    const error = document.querySelector(`#error-${campo}`);
    input.removeAttribute("aria-invalid");
    error.hidden = true;
    error.textContent = "";
  }
}

function manejarValidacionFallida(errores) {
  formulario.reset();
  limpiarErrores();
  for (const [campo, mensaje] of Object.entries(errores)) {
    const input = document.querySelector(`#${campo}`);
    const error = document.querySelector(`#error-${campo}`);
    if (!input || !error) continue;
    input.setAttribute("aria-invalid", "true");
    error.textContent = mensaje;
    error.hidden = false;
  }
}

// pagehide intenta liberar la reserva incluso al cerrar o recargar; el vencimiento del servidor es el respaldo.
function liberarAlSalir() {
  if (!reservaId || salidaLiberada) return;
  salidaLiberada = true;
  const url = `/api/reservas/${encodeURIComponent(reservaId)}/liberar`;
  const enviado = navigator.sendBeacon(url, new Blob([], { type: "application/json" }));
  if (!enviado) {
    fetch(url, { method: "POST", keepalive: true })
      .then((respuesta) => {
        if (!respuesta.ok) console.error("No se pudo liberar el horario al salir.");
      })
      .catch((error) => console.error("No se pudo liberar el horario al salir:", error));
  }
}

function iniciarLatido() {
  intervaloLatido = window.setInterval(async () => {
    try {
      await consultarAPI(`/api/reservas/${encodeURIComponent(reservaId)}/latido`, { method: "POST" });
    } catch (error) {
      window.clearInterval(intervaloLatido);
      mostrarErrorGeneral(error.message);
    }
  }, 30_000);
}

function urlDevolucion() {
  const parametros = new URLSearchParams({
    deporte: new URLSearchParams(window.location.search).get("deporte") || "",
    cancha: new URLSearchParams(window.location.search).get("cancha") || "",
    fecha: new URLSearchParams(window.location.search).get("fecha") || "",
    cancelada: "1"
  });
  return `/?${parametros}`;
}

document.querySelector("#cancel-reservation").addEventListener("click", async (evento) => {
  const boton = evento.currentTarget;
  boton.disabled = true;
  try {
    await consultarAPI(`/api/reservas/${encodeURIComponent(reservaId)}/liberar`, { method: "POST" });
    salidaLiberada = true;
    window.clearInterval(intervaloLatido);
    window.location.assign(urlDevolucion());
  } catch (error) {
    boton.disabled = false;
    mostrarErrorGeneral(error.message);
  }
});

// Si la API detecta errores, se vacían los campos y se señalan los que deben corregirse.
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  limpiarErrores();
  errorGeneral.hidden = true;
  const boton = document.querySelector("#submit-reservation");
  boton.disabled = true;
  try {
    const resultado = await consultarAPI(`/api/reservas/${encodeURIComponent(reservaId)}/validar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(formulario)))
    });
    window.clearInterval(intervaloLatido);
    window.location.assign(`/HTML/Pagos/pago.html?reserva=${encodeURIComponent(resultado.reservaId)}`);
  } catch (error) {
    if (error.respuesta?.status === 422) {
      manejarValidacionFallida(error.datos.errores);
    }
    mostrarErrorGeneral(error.message);
  } finally {
    boton.disabled = false;
  }
});

window.addEventListener("pagehide", liberarAlSalir);

if (!reservaId) {
  mostrarErrorGeneral("No encontramos la reserva. Regresa a fechas y horarios.");
  formulario.querySelectorAll("button, input").forEach((elemento) => { elemento.disabled = true; });
} else {
  consultarAPI(`/api/reservas/${encodeURIComponent(reservaId)}`)
    .then((reserva) => {
      mostrarResumen(reserva);
      iniciarLatido();
    })
    .catch((error) => {
      mostrarErrorGeneral(error.message);
      formulario.querySelectorAll("button, input").forEach((elemento) => { elemento.disabled = true; });
    });
}
