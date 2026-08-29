/**
 * Diccionario Cultural de Quiniela — La Tabla de los Sueños
 *
 * Mapeo de los números 00 al 99 con su nombre tradicional
 * y un ícono/emoji representativo de la cultura quinielera argentina.
 *
 * Referencia: "La tabla de los sueños y profesiones" usada por
 * quinielistas desde décadas.
 */

export interface QuinielaEntry {
  number: string   // "00"-"99"
  name: string     // Nombre tradicional
  icon: string     // Emoji representativo
}

const dictionary: readonly QuinielaEntry[] = [
  { number: "00", name: "El Huevo",              icon: "🥚" },
  { number: "01", name: "El Bautismo",           icon: "💧" },
  { number: "02", name: "El Negrito",            icon: "🧒" },
  { number: "03", name: "La Iglesia",            icon: "⛪" },
  { number: "04", name: "La Cama",               icon: "🛏️" },
  { number: "05", name: "El Gato",               icon: "🐱" },
  { number: "06", name: "El Perro",              icon: "🐶" },
  { number: "07", name: "La Pistola",            icon: "🔫" },
  { number: "08", name: "El Fuego",              icon: "🔥" },
  { number: "09", name: "El Río",                icon: "🏞️" },
  { number: "10", name: "La Leche",              icon: "🥛" },
  { number: "11", name: "El Ciervo",             icon: "🦌" },
  { number: "12", name: "El Soldado",            icon: "💂" },
  { number: "13", name: "La Suerte",             icon: "🍀" },
  { number: "14", name: "El Borracho",           icon: "🍷" },
  { number: "15", name: "La Niña",               icon: "👧" },
  { number: "16", name: "El Anillo",             icon: "💍" },
  { number: "17", name: "El Llorón",             icon: "😭" },
  { number: "18", name: "La Sangre",             icon: "🩸" },
  { number: "19", name: "El Pez",                icon: "🐟" },
  { number: "20", name: "El Mamá",               icon: "🥳" },
  { number: "21", name: "La Mujer",              icon: "👩" },
  { number: "22", name: "El Loco",               icon: "🤪" },
  { number: "23", name: "La Mariposa",           icon: "🦋" },
  { number: "24", name: "El Caballo",            icon: "🐴" },
  { number: "25", name: "La Gallina",            icon: "🐔" },
  { number: "26", name: "El Curandero",          icon: "🧙" },
  { number: "27", name: "El Toro",               icon: "🐂" },
  { number: "28", name: "La Montaña",            icon: "⛰️" },
  { number: "29", name: "El Gaucho",             icon: "🤠" },
  { number: "30", name: "La Luna",               icon: "🌙" },
  { number: "31", name: "El Martillo",           icon: "🔨" },
  { number: "32", name: "La Llave",              icon: "🔑" },
  { number: "33", name: "El Ángel",              icon: "😇" },
  { number: "34", name: "La Muerte",             icon: "💀" },
  { number: "35", name: "El Sombrero",           icon: "🎩" },
  { number: "36", name: "La Botella",            icon: "🍾" },
  { number: "37", name: "El Escorpión",          icon: "🦂" },
  { number: "38", name: "La Araña",              icon: "🕷️" },
  { number: "39", name: "El QSOS",               icon: "🆘" },
  { number: "40", name: "El Corazón",            icon: "❤️" },
  { number: "41", name: "La Flecha",             icon: "🏹" },
  { number: "42", name: "El Reloj",              icon: "⏰" },
  { number: "43", name: "El Barco",              icon: "⛵" },
  { number: "44", name: "La Casa",               icon: "🏠" },
  { number: "45", name: "El Pañuelo",            icon: "🧣" },
  { number: "46", name: "El Árbol",              icon: "🌳" },
  { number: "47", name: "La Cabeza",             icon: "🗣️" },
  { number: "48", name: "El Gatito",             icon: "🐈" },
  { number: "49", name: "La Loba",               icon: "🐺" },
  { number: "50", name: "ElPancho",              icon: "🌭" },
  { number: "51", name: "El Panadero",           icon: "👨‍🍳" },
  { number: "52", name: "La Paloma",             icon: "🕊️" },
  { number: "53", name: "El Dermatológico",      icon: "🏥" },
  { number: "54", name: "El Umbral",             icon: "🚪" },
  { number: "55", name: "La Colmena",            icon: "🐝" },
  { number: "56", name: "El Cuervo",             icon: "🐦‍⬛" },
  { number: "57", name: "La Víbora",             icon: "🐍" },
  { number: "58", name: "El Espíritu",           icon: "👻" },
  { number: "59", name: "La Luna Nueva",         icon: "🌑" },
  { number: "60", name: "El Estudio",            icon: "📚" },
  { number: "61", name: "La Vaca",               icon: "🐄" },
  { number: "62", name: "El Dragón",             icon: "🐉" },
  { number: "63", name: "La Mano",               icon: "✋" },
  { number: "64", name: "El Teléfono",           icon: "📞" },
  { number: "65", name: "El Colchón",            icon: "🛌" },
  { number: "66", name: "Los Dientes",           icon: "🦷" },
  { number: "67", name: "El Fondo",              icon: "🕳️" },
  { number: "68", name: "La Escoba",             icon: "🧹" },
  { number: "69", name: "El Látigo",             icon: "🪢" },
  { number: "70", name: "La Calavera",           icon: "💀" },
  { number: "71", name: "El Bono",               icon: "🎫" },
  { number: "72", name: "El Payaso",             icon: "🤡" },
  { number: "73", name: "El Hospital",           icon: "🏥" },
  { number: "74", name: "El Pecado",             icon: "😈" },
  { number: "75", name: "El Manicomio",          icon: "🤪" },
  { number: "76", name: "La Brasa",              icon: "🔥" },
  { number: "77", name: "La Pierna",             icon: "🦵" },
  { number: "78", name: "La Morena",             icon: "💃" },
  { number: "79", name: "El Ninja",              icon: "🥷" },
  { number: "80", name: "El Trofeo",             icon: "🏆" },
  { number: "81", name: "La Pelota",             icon: "⚽" },
  { number: "82", name: "El Ocho",               icon: "🎱" },
  { number: "83", name: "La Raqueta",            icon: "🎾" },
  { number: "84", name: "El Bate",               icon: "⚾" },
  { number: "85", name: "La Voley",              icon: "🏐" },
  { number: "86", name: "El Rugby",              icon: "🏉" },
  { number: "87", name: "El Bowling",            icon: "🎳" },
  { number: "88", name: "La Pelota Ping Pong",   icon: "🏓" },
  { number: "89", name: "El Tenis",              icon: "🏓" },
  { number: "90", name: "El Televisor",          icon: "📺" },
  { number: "91", name: "La Radio",              icon: "📻" },
  { number: "92", name: "El Micrófono",          icon: "🎤" },
  { number: "93", name: "La Música",             icon: "🎼" },
  { number: "94", name: "El Saxofón",            icon: "🎷" },
  { number: "95", name: "La Guitarra",           icon: "🎸" },
  { number: "96", name: "La Trompeta",           icon: "🎺" },
  { number: "97", name: "El Violín",             icon: "🎻" },
  { number: "98", name: "El Bombo",              icon: "🥁" },
  { number: "99", name: "El Acordeón",           icon: "🪗" },
] as const

// O(1) lookup maps
const byNumber = new Map<string, QuinielaEntry>(dictionary.map(e => [e.number, e]))

/**
 * Get the cultural entry for a 2-digit number string.
 * @param num - "00" to "99" (will be padded if needed)
 */
export function getQuinielaEntry(num: string | number): QuinielaEntry {
  const key = String(num).padStart(2, "0").slice(-2)
  return byNumber.get(key) ?? { number: key, name: "Descenido", icon: "❓" }
}

/**
 * Get just the traditional name for a number.
 */
export function getQuinielaName(num: string | number): string {
  return getQuinielaEntry(num).name
}

/**
 * Get just the icon for a number.
 */
export function getQuinielaIcon(num: string | number): string {
  return getQuinielaEntry(num).icon
}

/**
 * Get the cultural name+icon for the last 2 digits of a 3c or 4c prediction.
 * E.g. "024" → { number: "24", name: "El Caballo", icon: "🐴" }
 */
export function getLast2CifrasEntry(num: string | number): QuinielaEntry {
  const s = String(num)
  const last2 = s.slice(-2).padStart(2, "0")
  return getQuinielaEntry(last2)
}

/**
 * Full dictionary for rendering lists/grids.
 */
export function getAllEntries(): readonly QuinielaEntry[] {
  return dictionary
}

export default dictionary
