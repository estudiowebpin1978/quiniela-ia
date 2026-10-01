/**
 * Diccionario Cultural de Quiniela — La Tabla de los Sueños
 *
 * Mapeo de los números 00 al 99 con su nombre tradicional
 * y un ícono/emoji representativo de la cultura quinielera argentina.
 *
 * Fuente canónica: lista oficial del proyecto (00 Huevos … 99 Hermano).
 * Los nombres se usan TAL CUAL figuran acá (incluidos los apodos
 * compuestos con "–", p. ej. "05 Gato – Escoba").
 *
 * Es la ÚNICA tabla de significados: lib/suenos.ts (SUENOS), las APIs
 * (suenoDe/getSignificado) y los componentes (NumberGrid/SavedCard)
 * se derivan de acá.
 */

export interface QuinielaEntry {
  number: string   // "00"-"99"
  name: string     // Nombre tradicional
  icon: string     // Emoji representativo
}

const dictionary: readonly QuinielaEntry[] = [
  { number: "00", name: "Huevos",                 icon: "🥚" },
  { number: "01", name: "Agua",                   icon: "💧" },
  { number: "02", name: "Niño",                   icon: "🧒" },
  { number: "03", name: "San Cono",               icon: "🙏" },
  { number: "04", name: "La cama",                icon: "🛏️" },
  { number: "05", name: "Gato – Escoba",          icon: "🐱" },
  { number: "06", name: "Perro",                  icon: "🐶" },
  { number: "07", name: "Revólver",               icon: "🔫" },
  { number: "08", name: "Incendio",               icon: "🔥" },
  { number: "09", name: "Arroyo",                 icon: "🏞️" },
  { number: "10", name: "Leche – Cañón",          icon: "🥛" },
  { number: "11", name: "Minero – Medio loco",    icon: "⛏️" },
  { number: "12", name: "Soldado",                icon: "💂" },
  { number: "13", name: "La yeta",                icon: "✋" },
  { number: "14", name: "Borracho",               icon: "🍺" },
  { number: "15", name: "Niña bonita",            icon: "👧" },
  { number: "16", name: "Anillo",                 icon: "💍" },
  { number: "17", name: "Desgracia",              icon: "😭" },
  { number: "18", name: "La sangre",              icon: "🩸" },
  { number: "19", name: "Pescado",                icon: "🐟" },
  { number: "20", name: "La fiesta",              icon: "🥳" },
  { number: "21", name: "La mujer",               icon: "👩" },
  { number: "22", name: "El loco",                icon: "🤪" },
  { number: "23", name: "Mariposa – Cocinero",    icon: "🦋" },
  { number: "24", name: "Caballo",                icon: "🐴" },
  { number: "25", name: "Gallina",                icon: "🐔" },
  { number: "26", name: "La misa",                icon: "🕯️" },
  { number: "27", name: "El peine",               icon: "💈" },
  { number: "28", name: "El cerro",               icon: "⛰️" },
  { number: "29", name: "San Pedro",              icon: "🔑" },
  { number: "30", name: "Santa Rosa",             icon: "🌹" },
  { number: "31", name: "La luz",                 icon: "💡" },
  { number: "32", name: "Dinero",                 icon: "💰" },
  { number: "33", name: "Cristo",                 icon: "✝️" },
  { number: "34", name: "Cabeza",                 icon: "🗣️" },
  { number: "35", name: "Pajarito",               icon: "🐦" },
  { number: "36", name: "Manteca",                icon: "🧈" },
  { number: "37", name: "Dentista",               icon: "🦷" },
  { number: "38", name: "Aceite – Piedra",        icon: "🫒" },
  { number: "39", name: "La lluvia",              icon: "🌧️" },
  { number: "40", name: "El Cura",                icon: "📿" },
  { number: "41", name: "Cuchillo",               icon: "🔪" },
  { number: "42", name: "Zapatilla",              icon: "👟" },
  { number: "43", name: "Sapo – Balcón",          icon: "🐸" },
  { number: "44", name: "La cárcel",              icon: "⛓️" },
  { number: "45", name: "El vino",                icon: "🍷" },
  { number: "46", name: "Tomates",                icon: "🍅" },
  { number: "47", name: "Muerto",                 icon: "💀" },
  { number: "48", name: "Muerto habla",           icon: "👻" },
  { number: "49", name: "La carne",               icon: "🥩" },
  { number: "50", name: "El pan",                 icon: "🍞" },
  { number: "51", name: "Serrucho",               icon: "🪚" },
  { number: "52", name: "Madre e hijas",          icon: "👩‍👧" },
  { number: "53", name: "El barco",               icon: "⛵" },
  { number: "54", name: "La vaca",                icon: "🐄" },
  { number: "55", name: "Los gallegos – Música",  icon: "🪗" },
  { number: "56", name: "La caída",               icon: "🪂" },
  { number: "57", name: "Jorobado",               icon: "🐢" },
  { number: "58", name: "Ahogado",                icon: "🌊" },
  { number: "59", name: "Planta",                 icon: "🌱" },
  { number: "60", name: "Virgen",                 icon: "👼" },
  { number: "61", name: "Escopeta",               icon: "🔫" },
  { number: "62", name: "Inundación",             icon: "🌊" },
  { number: "63", name: "Casamiento",             icon: "💒" },
  { number: "64", name: "Llanto",                 icon: "😢" },
  { number: "65", name: "Cazador",                icon: "🎯" },
  { number: "66", name: "Lombrices",              icon: "🪱" },
  { number: "67", name: "Víbora",                 icon: "🐍" },
  { number: "68", name: "Sobrinos",               icon: "👦" },
  { number: "69", name: "Vicios",                 icon: "💊" },
  { number: "70", name: "Muerto sueño",           icon: "💤" },
  { number: "71", name: "Cerdo – Excremento",     icon: "🐷" },
  { number: "72", name: "Sorpresa",               icon: "🎁" },
  { number: "73", name: "Rengo – Hospital",       icon: "🏥" },
  { number: "74", name: "Araña – Negros",         icon: "🕷️" },
  { number: "75", name: "Payaso",                 icon: "🤡" },
  { number: "76", name: "Llamas",                 icon: "🔥" },
  { number: "77", name: "Las piernas",            icon: "🦵" },
  { number: "78", name: "Ramera",                 icon: "💃" },
  { number: "79", name: "Ladrón",                 icon: "🦹" },
  { number: "80", name: "La bocha",               icon: "🎳" },
  { number: "81", name: "Flores",                 icon: "💐" },
  { number: "82", name: "Pelea",                  icon: "🥊" },
  { number: "83", name: "Mal tiempo",             icon: "⛈️" },
  { number: "84", name: "Iglesia",                icon: "⛪" },
  { number: "85", name: "Linterna – Bicho de luz", icon: "🔦" },
  { number: "86", name: "Humo",                   icon: "🌫️" },
  { number: "87", name: "Piojos",                 icon: "🐛" },
  { number: "88", name: "El Papa",                icon: "🕊️" },
  { number: "89", name: "La rata",                icon: "🐀" },
  { number: "90", name: "El miedo",               icon: "😨" },
  { number: "91", name: "Pintor – Excusado",      icon: "🚽" },
  { number: "92", name: "Médico",                 icon: "🩺" },
  { number: "93", name: "Enamorado",              icon: "💘" },
  { number: "94", name: "Cementerio",             icon: "⚰️" },
  { number: "95", name: "Anteojos",               icon: "👓" },
  { number: "96", name: "Marido",                 icon: "👨" },
  { number: "97", name: "La mesa",                icon: "🍽️" },
  { number: "98", name: "Lavandera",              icon: "🧺" },
  { number: "99", name: "Hermano",                icon: "👥" },
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
 * E.g. "024" → { number: "24", name: "Caballo", icon: "🐴" }
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
