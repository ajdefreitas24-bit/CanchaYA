// Cuenta del administrador de CanchaYA. Se crea sola la primera vez que arranca el
// servidor, si todavía no hay ningún administrador. Se puede cambiar con las variables
// de entorno CANCHAYA_ADMIN_CORREO y CANCHAYA_ADMIN_PASSWORD.
module.exports = Object.freeze({
  nombre: "Administrador CanchaYA",
  correo: process.env.CANCHAYA_ADMIN_CORREO || "admin@canchaya.com",
  password: process.env.CANCHAYA_ADMIN_PASSWORD || "admin12345"
});
