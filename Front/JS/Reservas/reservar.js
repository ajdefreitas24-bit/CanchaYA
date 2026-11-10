/**
 * Historia «Reservar cancha» (épica Reservas), segunda parte. Página Reservas/reservar.html.
 * Lee el identificador de la reserva temporal de la URL, mantiene vivo el
 * bloqueo mientras se llena el formulario y lo libera si se cancela o se
 * abandona la página. Hereda de Pagina (api, ventana y ayudas comunes).
 */
class ReservationFormPage extends Pagina {
  constructor() {
    super();
    // Estos campos pertenecen a la página actual; el token de sesión es por pestaña.
    this.reservaId = new URLSearchParams(window.location.search).get("reserva");
    this.formulario = document.querySelector("#reservation-form");
    this.campos = ["nombre", "cedula", "correo", "telefono", "jugadores"];
    this.errorGeneral = document.querySelector("#form-error");
    this.intervaloLatido = null;
    this.salidaLiberada = false;
    this.configurarEventos();
    this.inicializar();
  }

  /** Expone un error de reserva fuera de los mensajes específicos de cada campo. */
  mostrarErrorGeneral(mensaje) {
  this.errorGeneral.textContent = mensaje;
  this.errorGeneral.hidden = false;
}

  /** Resume cancha, fecha, horas y fija el máximo de jugadores para el formulario. */
  mostrarResumen(reserva) {
  const texto = Formato.escaparHTML;
  document.querySelector("#reservation-summary").innerHTML = `
    <div><span class="section-kicker">${texto(reserva.cancha.deporte)} · ${texto(reserva.cancha.complejo)}</span><h2>${texto(reserva.cancha.nombre)}</h2><p>${texto(Formato.fechaLarga(reserva.fecha))} · ${texto(reserva.horarios.join(", "))}</p></div>
    <div class="summary-price"><strong>$${texto(reserva.cancha.precioPorHora * reserva.horarios.length)}</strong><span>total estimado</span></div>
  `;
  const equipos = reserva.cancha.capacidad.match(/(\d+)\s*vs\.\s*(\d+)/i);
  document.querySelector("#jugadores").max = equipos
    ? Number(equipos[1]) + Number(equipos[2])
    : Math.max(...(reserva.cancha.capacidad.match(/\d+/g) || ["1"]).map(Number));
}

  /** Quita marcas y mensajes de error de todos los campos antes de validar de nuevo. */
  limpiarErrores() {
  for (const campo of this.campos) {
    const input = document.querySelector(`#${campo}`);
    const error = document.querySelector(`#error-${campo}`);
    input.removeAttribute("aria-invalid");
    error.hidden = true;
    error.textContent = "";
  }
}

  /** Vacía los campos inválidos y muestra el motivo que devolvió la API para cada uno. */
  manejarValidacionFallida(errores) {
  this.formulario.reset();
  this.limpiarErrores();
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
  /** Intenta liberar el bloqueo al cerrar/navegar; el vencimiento del servidor es respaldo. */
  liberarAlSalir() {
  if (!this.reservaId || this.salidaLiberada) return;
  this.salidaLiberada = true;
  this.api.avisarAlSalir(`/api/reservas/${encodeURIComponent(this.reservaId)}/liberar`).then((respuesta) => {
    if (!respuesta.ok) console.error("No se pudo liberar el horario al salir.");
  }).catch((error) => console.error("No se pudo liberar el horario al salir:", error));
}

  /** Renueva periódicamente el bloqueo mientras el jugador permanece en esta pantalla. */
  iniciarLatido() {
  this.intervaloLatido = window.setInterval(async () => {
    try {
      await this.api.consultar(`/api/reservas/${encodeURIComponent(this.reservaId)}/latido`, { method: "POST" });
    } catch (error) {
      window.clearInterval(this.intervaloLatido);
      this.mostrarErrorGeneral(error.message);
    }
  }, 30_000);
}

  /** Construye la URL de regreso para poder restaurar la cancha y la fecha elegidas. */
  urlDevolucion() {
  const actuales = new URLSearchParams(window.location.search);
  const parametros = new URLSearchParams({
    cancha: actuales.get("cancha") || "",
    fecha: actuales.get("fecha") || "",
    cancelada: "1"
  });
  return `/?${parametros}`;
}

  /** Conecta cancelar, enviar formulario y salida de página con el ciclo de reserva. */
  configurarEventos() {
document.querySelector("#cancel-reservation").addEventListener("click", async (evento) => {
  const boton = evento.currentTarget;
  boton.disabled = true;
  try {
    await this.api.consultar(`/api/reservas/${encodeURIComponent(this.reservaId)}/liberar`, { method: "POST" });
    this.salidaLiberada = true;
    window.clearInterval(this.intervaloLatido);
    window.location.assign(this.urlDevolucion());
  } catch (error) {
    boton.disabled = false;
    this.mostrarErrorGeneral(error.message);
  }
});

// Si la API detecta errores, se vacían los campos y se señalan los que deben corregirse.
this.formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  this.limpiarErrores();
  this.errorGeneral.hidden = true;
  const boton = document.querySelector("#submit-reservation");
  boton.disabled = true;
  try {
    const resultado = await this.api.enviar(`/api/reservas/${encodeURIComponent(this.reservaId)}/validar`,
      Object.fromEntries(new FormData(this.formulario)));
    window.clearInterval(this.intervaloLatido);
    window.location.assign(`/HTML/Pagos/pago.html?reserva=${encodeURIComponent(resultado.reservaId)}`);
  } catch (error) {
    if (error.estado === 422) {
      this.manejarValidacionFallida(error.datos.errores);
    }
    this.mostrarErrorGeneral(error.message);
  } finally {
    boton.disabled = false;
  }
});

window.addEventListener("pagehide", () => this.liberarAlSalir());

  }

  /** Carga la reserva temporal y desactiva el formulario si falta o expiró el identificador. */
  inicializar() {
    if (!this.reservaId) {
  this.mostrarErrorGeneral("No encontramos la reserva. Regresa a fechas y horarios.");
  this.formulario.querySelectorAll("button, input").forEach((elemento) => { elemento.disabled = true; });
} else {
  this.api.consultar(`/api/reservas/${encodeURIComponent(this.reservaId)}`)
    .then((reserva) => {
      this.mostrarResumen(reserva);
      this.iniciarLatido();
    })
    .catch((error) => {
      this.mostrarErrorGeneral(error.message);
      this.formulario.querySelectorAll("button, input").forEach((elemento) => { elemento.disabled = true; });
    });
    }
  }
}

new ReservationFormPage();
