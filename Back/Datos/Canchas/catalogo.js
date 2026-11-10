// Catálogo de los cinco deportes permitidos por las restricciones del brief.
// Cada registro incluye el identificador persistido, la etiqueta visible y recursos gráficos.
const deportes = [
  { id: "futbol", nombre: "Fútbol", icono: "⚽", descripcion: "Cancha para partidos y entrenamientos." },
  { id: "basket", nombre: "Basket", icono: "🏀", descripcion: "Espacios para jugar en equipo." },
  { id: "padel", nombre: "Pádel", icono: "🎾", descripcion: "Encuentra tu próxima pista de pádel." },
  { id: "beisbol", nombre: "Béisbol", icono: "⚾", descripcion: "Campos para practicar y competir." },
  { id: "tenis", nombre: "Tenis", icono: "🎾", descripcion: "Aparta una cancha y juega a tu ritmo." }
];

module.exports = deportes;
