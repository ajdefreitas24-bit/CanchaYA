/**
 * Formatos que se repiten en todas las páginas. Sus métodos son estáticos
 * porque no guardan datos: se usan como Formato.fecha(...), sin crear objetos.
 */
class Formato {
  /** Evita que un texto escrito por un usuario se interprete como HTML. */
  static escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caracter]);
  }

  /** Fecha en español. Se usa el mediodía para que la zona horaria no cambie el día. */
  static fecha(fecha, opciones) {
    return new Intl.DateTimeFormat("es-VE", opciones).format(new Date(`${fecha}T12:00:00`));
  }

  /** Ejemplo: «jueves, 12 de noviembre de 2026». */
  static fechaLarga(fecha) {
    return Formato.fecha(fecha, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  /** Fecha de hoy del navegador en formato AAAA-MM-DD. */
  static hoy() {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  }

  static bolivares(monto) {
    return new Intl.NumberFormat("es-VE", { style: "currency", currency: "VES", minimumFractionDigits: 2 }).format(monto);
  }
}
