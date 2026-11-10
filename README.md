# CanchaYA

Aplicación web para reservar canchas deportivas en complejos de Caracas.
Todo está hecho en JavaScript y orientado a objetos: el servidor (Back) usa
Node.js con Express y SQLite, y la interfaz (Front) usa HTML, CSS y clases de
JavaScript en el navegador.

## Cómo iniciarlo

Requiere Node.js 22.13 o superior (trae SQLite incluido, no hace falta XAMPP).

```sh
npm install
npm start
```

Abre <http://localhost:3000>. Para usar otro puerto, define la variable `PORT`.

La base de datos se crea sola en `Back/Datos/Reservas/canchaya.sqlite`. Si
tienes una base de una versión anterior, el servidor avisa al arrancar: bórrala
y vuelve a ejecutar `npm start`.

### Cuentas

- **Administrador de CanchaYA:** se crea al arrancar por primera vez.
  Correo `admin@canchaya.com`, contraseña `admin12345` (se pueden cambiar con las
  variables `CANCHAYA_ADMIN_CORREO` y `CANCHAYA_ADMIN_PASSWORD`).
- **Complejo:** se crea con «Registrar mi complejo» en la página principal.
  Queda pendiente hasta que el administrador lo aprueba en «Solicitudes».
- **Jugador:** se crea con «Crear cuenta» en la página principal.

### Recorrido para probar todo

1. Registrar mi complejo (página principal) y enviar la solicitud.
2. Entrar como administrador, abrir la solicitud y aprobarla.
3. Entrar como el complejo: Agregar cancha y luego Agregar horario.
4. Crear una cuenta de jugador: Buscar cancha → Buscar por zona → elegir la
   cancha → ver los horarios disponibles → Confirmar horarios.
5. Llenar los datos de la reserva y pagar el adelanto (adjuntar la referencia).
6. Como complejo, en «Ver notificaciones», confirmar el pago.
7. Como jugador, en «Ver reservaciones», cancelar la reserva.

## Historias y archivos

Cada historia tiene su clase en el Back (con sus rutas) y su clase en el Front.

| Historia | Back (Back/Logica/…) | Front (Front/JS/… y Front/HTML/…) |
|---|---|---|
| Registrar complejo | `Complejos/registrar_complejo.js` | `Complejos/registrar_complejo.js`, `HTML/Complejos/registrar_complejo.html` |
| Ver solicitudes | `Solicitudes/ver_solicitudes.js` | `Solicitudes/ver_solicitudes.js`, `HTML/Solicitudes/solicitudes.html` |
| Modificar solicitudes | `Solicitudes/modificar_solicitudes.js` | `Solicitudes/modificar_solicitudes.js` |
| Agregar cancha | `Canchas/agregar_cancha.js` | `Canchas/agregar_cancha.js`, `HTML/Canchas/agregar_cancha.html` |
| Agregar horario | `Horarios/agregar_horario.js` | `Horarios/agregar_horario.js`, `HTML/Horarios/agregar_horario.html` |
| Buscar por zona | `Canchas/buscar_por_zona.js` | `Canchas/buscar_por_zona.js` |
| Ver horarios disponibles | `Horarios/ver_horarios_disponibles.js` | `Horarios/ver_horarios_disponibles.js` |
| Reservar cancha | `Reservas/reservar_cancha.js`, `Reservas/validar_reservas.js`, `Horarios/bloquear_horario.js` | `Reservas/reservar_cancha.js`, `Reservas/reservar.js`, `HTML/Reservas/reservar.html` |
| Cancelar reserva | `Reservas/cancelar_reserva.js` | `Reservas/cancelar_reserva.js` |
| Pagar adelanto | `Pagos/registrar_pago.js`, `Pagos/verificar_pago.js` | `Pagos/pago.js`, `Pagos/espera.js`, `Pagos/verificar_pago.js`, `HTML/Pagos/` |

Las tablas de cada parte están en `Back/Datos/<Parte>/*.sql`.

## Organización del código

**Back**

- `Back/Logica/Pantalla_principal/index.js`: clase `CanchaYAHttpServer`. Configura
  Express, guarda la lista de historias y llama a `registrarRutas(servidor)` de
  cada una (todas tienen ese método: polimorfismo). También tiene las ayudas
  comunes: fechas, sesión (`requerirJugador`, `requerirComplejo`,
  `requerirAdministrador`) y `buscarCancha`.
- `Back/Logica/Usuarios/autenticacion.js`: clase `AuthenticationService`. Crear
  cuenta de jugador, iniciar y cerrar sesión, contraseñas con hash (scrypt) y la
  cuenta del administrador. Un complejo pendiente o rechazado no puede entrar.
- `Back/Datos/Reservas/conexion.js`: abre la base SQLite y crea las tablas.

**Front**

- `Front/JS/Pantalla_principal/`: clases comunes.
  - `ApiCliente`: habla con el servidor (token de la sesión y errores).
  - `Formato`: fechas, bolívares y `escaparHTML`.
  - `VentanaMensaje`: los mensajes con botón «OK» o «Aceptar».
  - `Pagina`: clase padre de cada página con su propio HTML.
  - `Vista`: clase padre de cada parte de la página principal.
  - `BuscadorDeCanchas`: pasos del buscador y lista de canchas.
  - `PanelComplejoVista`: panel del complejo con sus próximos horarios.
  - `CanchaYAApp`: inicio de sesión y paneles; tiene dentro una vista por historia.
- Cada historia tiene su clase en la carpeta de su parte (Canchas, Horarios,
  Reservas, Pagos, Complejos, Solicitudes).

## Pruebas

```sh
npm test
```

Corre cuatro archivos de prueba con bases temporales (no tocan la base real):

- `Back/Logica/Complejos/registrar_complejo.test.js`: Registrar complejo.
- `Back/Logica/Solicitudes/solicitudes.test.js`: Ver y Modificar solicitudes.
- `Back/Logica/Horarios/agregar_horario.test.js`: Agregar cancha y Agregar horario.
- `Back/Logica/Reservas/reservar_cancha.test.js`: búsqueda, disponibilidad, reserva, pago y cancelación.

## Reglas importantes

- Solo Caracas; deportes: fútbol, basket, pádel, béisbol y tenis.
- Los horarios de una misma cancha no se superponen (18:00–20:00 choca con
  19:00–21:00, pero no con 20:00–21:00). Las horas van en punto, de 07:00 a 22:00.
- El jugador ve horas con al menos 2 horas de anticipación y hasta 30 días.
- Al elegir horas se apartan por 90 segundos mientras llena sus datos.
- El adelanto es el 25 % del total; CanchaYA no cobra en línea, solo registra la
  referencia (imagen) y el complejo la confirma o la deniega.
- Las imágenes de las referencias se guardan en `Back/Datos/Pagos/Referencias/`
  (excluida de Git).
