c = open("app/api/predictions/route.ts", encoding="utf-8").read()

old_suenos = """const SUENOS: { [k: number]: string } = {
  0: "Huevos", 1: "Agua", 2: "Nino", 3: "San Cono", 4: "La cama", 5: "Gato", 6: "Perro", 7: "Revolver",
  8: "Incendio", 9: "Arroyo", 10: "La leche", 11: "Minero", 12: "Soldado", 13: "La yeta", 14: "Borracho",
  15: "Nina bonita", 16: "Anillo", 17: "Desgracia", 18: "Sangre", 19: "Pescado", 20: "La fiesta",
  21: "Mujer", 22: "Loco", 23: "Cocinero", 24: "Caballo", 25: "Gallina", 26: "La misa", 27: "Peine",
  28: "Cerro", 29: "San Pedro", 30: "Santa Rosa", 31: "Luz", 32: "Dinero", 33: "Cristo", 34: "Cabeza",
  35: "Pajarito", 36: "Manteca", 37: "Dentista", 38: "Piedras", 39: "Lluvia", 40: "Cura", 41: "Cuchillo",
  42: "Zapatillas", 43: "Balcon", 44: "Carcel", 45: "Vino", 46: "Tomates", 47: "Muerto", 48: "Muerto habla",
  49: "Carne", 50: "Pan", 51: "Serrucho", 52: "Madre", 53: "Barco", 54: "Vaca", 55: "Musica", 56: "Caida",
  57: "Jorobado", 58: "Ahogado", 59: "Plantas", 60: "Virgen", 61: "Escopeta", 62: "Inundacion",
  63: "Casamiento", 64: "Llanto", 65: "Cazador", 66: "Lombrices", 67: "Vibora", 68: "Sobrinos",
  69: "Vicios", 70: "Muerto sueno", 71: "Excremento", 72: "Sorpresa", 73: "Hospital", 74: "Gente negra",
  75: "Besos", 76: "Fuego", 77: "Pierna mujer", 78: "Ramera", 79: "Ladron", 80: "Bochas",
  81: "Flores", 82: "Pelea", 83: "Mal tiempo", 84: "Iglesia", 85: "Linterna", 86: "Humo",
  87: "Piojos", 88: "Papas", 89: "Rata", 90: "Miedo", 91: "Excursion", 92: "Medico",
  93: "Enamorado", 94: "Cementerio", 95: "Anteojos", 96: "Marido", 97: "Mesa",
  98: "Lavandera", 99: "Hermano"
}"""

new_suenos = """const SUENOS: { [k: number]: string } = {
  0:"🥚 Huevos",1:"💧 Agua",2:"👶 Nino",3:"⛪ San Cono",4:"🛏 La cama",5:"🐱 Gato",6:"🐶 Perro",7:"🔫 Revolver",
  8:"🔥 Incendio",9:"🌊 Arroyo",10:"🥛 La leche",11:"⛏ Minero",12:"💂 Soldado",13:"😬 La yeta",14:"🍺 Borracho",
  15:"👧 Nina bonita",16:"💍 Anillo",17:"😢 Desgracia",18:"🩸 Sangre",19:"🐟 Pescado",20:"🎉 La fiesta",
  21:"👩 Mujer",22:"🤪 Loco",23:"👨‍🍳 Cocinero",24:"🐴 Caballo",25:"🐔 Gallina",26:"⛪ La misa",27:"🪮 Peine",
  28:"⛰ Cerro",29:"🙏 San Pedro",30:"🌹 Santa Rosa",31:"💡 Luz",32:"💰 Dinero",33:"✝ Cristo",34:"💀 Cabeza",
  35:"🐦 Pajarito",36:"🧈 Manteca",37:"🦷 Dentista",38:"🪨 Piedras",39:"🌧 Lluvia",40:"⛪ Cura",41:"🔪 Cuchillo",
  42:"👟 Zapatillas",43:"🏠 Balcon",44:"🔒 Carcel",45:"🍷 Vino",46:"🍅 Tomates",47:"💀 Muerto",48:"👻 Muerto habla",
  49:"🥩 Carne",50:"🍞 Pan",51:"🪚 Serrucho",52:"👩 Madre",53:"🚢 Barco",54:"🐄 Vaca",55:"🎵 Musica",56:"😵 Caida",
  57:"🤸 Jorobado",58:"🌊 Ahogado",59:"🌿 Plantas",60:"🙏 Virgen",61:"🔫 Escopeta",62:"🌊 Inundacion",
  63:"💒 Casamiento",64:"😭 Llanto",65:"🏹 Cazador",66:"🐛 Lombrices",67:"🐍 Vibora",68:"👨‍👧 Sobrinos",
  69:"🍸 Vicios",70:"💀 Muerto sueno",71:"💩 Excremento",72:"🎁 Sorpresa",73:"🏥 Hospital",74:"👥 Gente",
  75:"💋 Besos",76:"🔥 Fuego",77:"🦵 Pierna",78:"👠 Ramera",79:"🦹 Ladron",80:"🎳 Bochas",
  81:"🌸 Flores",82:"👊 Pelea",83:"⛈ Mal tiempo",84:"⛪ Iglesia",85:"🔦 Linterna",86:"💨 Humo",
  87:"🐜 Piojos",88:"🥔 Papas",89:"🐀 Rata",90:"😰 Miedo",91:"🚌 Excursion",92:"👨‍⚕️ Medico",
  93:"❤ Enamorado",94:"⚰ Cementerio",95:"👓 Anteojos",96:"👨 Marido",97:"🪑 Mesa",
  98:"👗 Lavandera",99:"👫 Hermano"
}"""

if old_suenos in c:
    c = c.replace(old_suenos, new_suenos, 1)
    print("OK - emojis en significados")
else:
    print("ERROR - buscando SUENOS...")
    idx = c.find("const SUENOS")
    print(repr(c[idx:idx+100]))

open("app/api/predictions/route.ts", "w", encoding="utf-8").write(c)
