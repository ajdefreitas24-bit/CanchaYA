/*Archivo Temporal, unicamente para pruebas. Se debe reemplazar por una base de datos en el futuro.*/
/* Catálogo temporal de muestra. Para agregar un deporte, añade un objeto con sus canchas a este arreglo. */
const deportes = [
  {
    id: "futbol",
    nombre: "Fútbol",
    icono: "⚽",
    descripcion: "Cancha para partidos y entrenamientos.",
    canchas: [
      { id: "futbol-1", nombre: "Cancha El Gol", complejo: "Complejo Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Grama artificial", capacidad: "11 vs. 11", precioPorHora: 45 },
      { id: "futbol-2", nombre: "Cancha La Grama", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Grama artificial", capacidad: "7 vs. 7", precioPorHora: 35 },
      { id: "futbol-3", nombre: "Cancha Norte", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Grama natural", capacidad: "11 vs. 11", precioPorHora: 50 }
    ]
  },
  {
    id: "basket",
    nombre: "Basket",
    icono: "🏀",
    descripcion: "Espacios para jugar en equipo.",
    canchas: [
      { id: "basket-1", nombre: "Cancha Central", complejo: "Complejo Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Madera", capacidad: "5 vs. 5", precioPorHora: 30 },
      { id: "basket-2", nombre: "Cancha Los Samanes", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Sintética", capacidad: "5 vs. 5", precioPorHora: 25 },
      { id: "basket-3", nombre: "Cancha del Puerto", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Cemento", capacidad: "5 vs. 5", precioPorHora: 28 }
    ]
  },
  {
    id: "padel",
    nombre: "Pádel",
    icono: "🎾",
    descripcion: "Encuentra tu próxima pista de pádel.",
    canchas: [
      { id: "padel-1", nombre: "Pista Panorámica", complejo: "Club Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Césped sintético", capacidad: "4 jugadores", precioPorHora: 32 },
      { id: "padel-2", nombre: "Pista Este", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Césped sintético", capacidad: "4 jugadores", precioPorHora: 30 },
      { id: "padel-3", nombre: "Pista Marina", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Césped sintético", capacidad: "4 jugadores", precioPorHora: 35 }
    ]
  },
  {
    id: "beisbol",
    nombre: "Béisbol",
    icono: "⚾",
    descripcion: "Campos para practicar y competir.",
    canchas: [
      { id: "beisbol-1", nombre: "Campo Las Águilas", complejo: "Complejo Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Grama natural", capacidad: "9 vs. 9", precioPorHora: 55 },
      { id: "beisbol-2", nombre: "Campo La Sabana", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Grama natural", capacidad: "9 vs. 9", precioPorHora: 50 },
      { id: "beisbol-3", nombre: "Campo Costero", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Grama natural", capacidad: "9 vs. 9", precioPorHora: 60 }
    ]
  },
  {
    id: "voleibol",
    nombre: "Voleibol",
    icono: "🏐",
    descripcion: "Canchas para voleibol de sala o playa.",
    canchas: [
      { id: "voleibol-1", nombre: "Cancha Arena", complejo: "Complejo Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Arena", capacidad: "6 vs. 6", precioPorHora: 25 },
      { id: "voleibol-2", nombre: "Cancha Techada", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Madera", capacidad: "6 vs. 6", precioPorHora: 28 },
      { id: "voleibol-3", nombre: "Cancha Playera", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Arena", capacidad: "6 vs. 6", precioPorHora: 30 }
    ]
  },
  {
    id: "tenis",
    nombre: "Tenis",
    icono: "🎾",
    descripcion: "Aparta una cancha y juega a tu ritmo.",
    canchas: [
      { id: "tenis-1", nombre: "Cancha Raqueta", complejo: "Complejo Deportivo Montalbán", ubicacion: "Montalbán, Caracas", superficie: "Arcilla", capacidad: "2 o 4 jugadores", precioPorHora: 28 },
      { id: "tenis-2", nombre: "Cancha Los Samanes", complejo: "Centro Deportivo Los Samanes", ubicacion: "Los Samanes, Caracas", superficie: "Dura", capacidad: "2 o 4 jugadores", precioPorHora: 30 },
      { id: "tenis-3", nombre: "Cancha Marina", complejo: "Polideportivo La Guaira", ubicacion: "Maiquetía, La Guaira", superficie: "Dura", capacidad: "2 o 4 jugadores", precioPorHora: 32 }
    ]
  }
];

module.exports = deportes;
