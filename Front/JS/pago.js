const reservaId = new URLSearchParams(window.location.search).get("reserva");
const paymentSummary = document.querySelector("#payment-summary");
const paymentContent = document.querySelector("#payment-content");
const paymentForm = document.querySelector("#payment-form");
const paymentError = document.querySelector("#payment-error");
const fileInput = document.querySelector("#payment-image");
const botonPago = document.querySelector("#submit-payment");
const maximumImageBytes = 5 * 1024 * 1024;

// El pago mantiene los horarios bloqueados; en esta pantalla no se libera al salir.
async function consultarAPI(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la solicitud.");
  return datos;
}

function mostrarError(mensaje) {
  paymentError.textContent = mensaje;
  paymentError.hidden = false;
}

function formatoBolivares(monto) {
  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "VES",
    minimumFractionDigits: 2
  }).format(monto);
}

function renderizarPago(datos) {
  const horaTexto = datos.horarios.join(", ");
  paymentSummary.innerHTML = `
    <div><span class="section-kicker">${datos.cancha.deporte} · ${datos.cancha.complejo}</span><h2>${datos.cancha.nombre}</h2><p>${datos.fecha} · ${horaTexto}</p></div>
    <div class="summary-price"><strong>$${datos.pago.precioTotalUsd}</strong><span>total estimado</span></div>
  `;
  document.querySelector("#bank-details").innerHTML = [
    ["Banco", datos.administrador.banco],
    ["Titular", datos.administrador.titular],
    ["Cédula / RIF", datos.administrador.identificacion],
    ["Teléfono", datos.administrador.telefono],
    ["Cuenta", datos.administrador.cuenta]
  ].map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${valor}</dd></div>`).join("");
  document.querySelector("#advance-amount").textContent = formatoBolivares(datos.pago.anticipoBs);
  document.querySelector("#exchange-rate").textContent = `Tasa fija de muestra: Bs. ${datos.pago.tasaBolivaresPorDolar} por USD.`;
  paymentContent.hidden = false;
}

fileInput.addEventListener("change", () => {
  const archivo = fileInput.files[0];
  document.querySelector("#selected-file").textContent = archivo
    ? `${archivo.name} · ${(archivo.size / (1024 * 1024)).toFixed(2)} MB`
    : "";
  paymentError.hidden = true;
});

paymentForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  paymentError.hidden = true;
  const archivo = fileInput.files[0];
  if (!archivo) {
    mostrarError("Adjunta la imagen de referencia de pago para continuar.");
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type) || archivo.size > maximumImageBytes) {
    mostrarError("Adjunta una imagen PNG, JPG o WEBP de máximo 5 MB.");
    return;
  }

  botonPago.disabled = true;
  try {
    // La imagen se envía codificada para que el servidor valide su formato antes de guardarla.
    const imagen = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen. Intenta nuevamente.")));
      reader.readAsDataURL(archivo);
    });
    await consultarAPI(`/api/pagos/${encodeURIComponent(reservaId)}/referencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen, nombreArchivo: archivo.name })
    });
    window.location.assign("/HTML/Pagos/espera.html");
  } catch (error) {
    mostrarError(error.message);
    botonPago.disabled = false;
  }
});

if (!reservaId) {
  paymentSummary.innerHTML = "";
  mostrarError("No encontramos una reserva para pagar.");
} else {
  consultarAPI(`/api/pagos/${encodeURIComponent(reservaId)}`)
    .then(renderizarPago)
    .catch((error) => {
      paymentSummary.innerHTML = "";
      mostrarError(error.message);
      paymentContent.hidden = false;
      paymentForm.hidden = true;
    });
}
