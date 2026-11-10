/**
 * Ventana con un mensaje y un botón («OK» o «Aceptar»). Se usa en los pasos de
 * los diagramas que dicen «mostrar mensaje» y luego «presionar OK».
 * mostrar() devuelve una promesa que se cumple cuando el usuario presiona el botón.
 */
class VentanaMensaje {
  mostrar(texto, { boton = "OK", tipo = "exito" } = {}) {
    return new Promise((resolve) => {
      const fondo = document.createElement("div");
      fondo.className = "message-backdrop";
      fondo.innerHTML = `
        <div class="message-box ${tipo === "aviso" ? "message-warning" : ""}" role="alertdialog" aria-modal="true" aria-labelledby="message-text">
          <span class="message-icon" aria-hidden="true">${tipo === "aviso" ? "!" : "✓"}</span>
          <p id="message-text"></p>
          <button class="primary-button" type="button"></button>
        </div>`;
      fondo.querySelector("p").textContent = texto;
      const botonOk = fondo.querySelector("button");
      botonOk.textContent = boton;
      botonOk.addEventListener("click", () => {
        fondo.remove();
        resolve();
      });
      document.body.append(fondo);
      botonOk.focus();
    });
  }
}
