/**
 * Historia «Pagar adelanto» (épica Pagos). Página Pagos/pago.html.
 * Carga el adelanto (25 % del total) y los datos para transferir, revisa la
 * imagen en el navegador y envía la referencia para que el complejo la revise.
 * Hereda de Pagina (api, ventana y ayudas comunes).
 */
class PaymentPage extends Pagina {
  constructor() {
    super();
    // Cachea controles y el límite de tamaño que también se valida en el servidor.
    this.reservaId = new URLSearchParams(window.location.search).get("reserva");
    this.paymentSummary = document.querySelector("#payment-summary");
    this.paymentContent = document.querySelector("#payment-content");
    this.paymentForm = document.querySelector("#payment-form");
    this.paymentError = document.querySelector("#payment-error");
    this.fileInput = document.querySelector("#payment-image");
    this.botonPago = document.querySelector("#submit-payment");
    this.maximumImageBytes = 5 * 1024 * 1024;
    this.configurarEventos();
    this.inicializar();
  }

// El pago mantiene los horarios bloqueados; en esta pantalla no se libera al salir.
  /** Presenta errores de carga o envío del comprobante. */
  mostrarError(mensaje) {
  this.paymentError.textContent = mensaje;
  this.paymentError.hidden = false;
}

  /** Dibuja cancha, fecha, datos bancarios, anticipo y tasa de conversión. */
  renderizarPago(datos) {
  const texto = Formato.escaparHTML;
  this.paymentSummary.innerHTML = `
    <div><span class="section-kicker">${texto(datos.cancha.deporte)} · ${texto(datos.cancha.complejo)}</span><h2>${texto(datos.cancha.nombre)}</h2><p>${texto(Formato.fechaLarga(datos.fecha))} · ${texto(datos.horarios.join(", "))}</p></div>
    <div class="summary-price"><strong>$${texto(datos.pago.precioTotalUsd)}</strong><span>total estimado</span></div>
  `;
  document.querySelector("#bank-details").innerHTML = [
    ["Banco", datos.administrador.banco],
    ["Titular", datos.administrador.titular],
    ["Cédula / RIF", datos.administrador.identificacion],
    ["Teléfono", datos.administrador.telefono],
    ["Cuenta", datos.administrador.cuenta]
  ].map(([etiqueta, valor]) => `<div><dt>${etiqueta}</dt><dd>${texto(valor)}</dd></div>`).join("");
  document.querySelector("#advance-amount").textContent = Formato.bolivares(datos.pago.anticipoBs);
  document.querySelector("#exchange-rate").textContent = `Tasa fija de muestra: Bs. ${datos.pago.tasaBolivaresPorDolar} por USD.`;
  this.paymentContent.hidden = false;
}

  /** Actualiza el nombre del archivo y controla la validación/envío del comprobante. */
  configurarEventos() {
this.fileInput.addEventListener("change", () => {
  const archivo = this.fileInput.files[0];
  document.querySelector("#selected-file").textContent = archivo
    ? `${archivo.name} · ${(archivo.size / (1024 * 1024)).toFixed(2)} MB`
    : "";
  this.paymentError.hidden = true;
});

this.paymentForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  this.paymentError.hidden = true;
  const archivo = this.fileInput.files[0];
  if (!archivo) {
    this.mostrarError("Adjunta la imagen de referencia de pago para continuar.");
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(archivo.type) || archivo.size > this.maximumImageBytes) {
    this.mostrarError("Adjunta una imagen PNG, JPG o WEBP de máximo 5 MB.");
    return;
  }

  this.botonPago.disabled = true;
  try {
    // La imagen se envía codificada para que el servidor valide su formato antes de guardarla.
    const imagen = await ApiCliente.leerArchivo(archivo);
    await this.api.enviar(`/api/pagos/${encodeURIComponent(this.reservaId)}/referencia`, { imagen, nombreArchivo: archivo.name });
    window.location.assign(`/HTML/Pagos/espera.html?reserva=${encodeURIComponent(this.reservaId)}`);
  } catch (error) {
    this.mostrarError(error.message);
    this.botonPago.disabled = false;
  }
});

  }

  /** Obtiene el pago asociado a la reserva indicada o muestra un error bloqueante. */
  inicializar() {
    if (!this.reservaId) {
  this.paymentSummary.innerHTML = "";
  this.mostrarError("No encontramos una reserva para pagar.");
} else {
  this.api.consultar(`/api/pagos/${encodeURIComponent(this.reservaId)}`)
    .then((datos) => this.renderizarPago(datos))
    .catch((error) => {
      this.paymentSummary.innerHTML = "";
      this.mostrarError(error.message);
      this.paymentContent.hidden = false;
      this.paymentForm.hidden = true;
    });
    }
  }
}

new PaymentPage();
