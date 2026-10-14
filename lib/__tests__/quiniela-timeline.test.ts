import { describe, it, expect } from "vitest"
import { dateART, getDependency, resolverDependencia, todayART } from "@/lib/quiniela-timeline"
import { normalizarCronToken } from "@/lib/cron/auth"

describe("dateART", () => {
  // Regresión bug real 2026-10-14: se construía medianoche UTC del día objetivo
  // y se formateaba CON tz ART (UTC−3) → devolvía SIEMPRE un día atrás.
  // dateART(-1) devolvía hace DOS días y la cadena de cron-run quedó bloqueada
  // esperando el "Nocturna" de un domingo (10-11) inexistente.
  it("devuelve la fecha calendario correcta (off-by-one corregido)", () => {
    // 2026-10-14 00:00 ART = 2026-10-14T03:00:00Z
    const ref = new Date("2026-10-14T03:00:00Z")
    expect(dateART(0, ref)).toBe("2026-10-14")
    expect(dateART(-1, ref)).toBe("2026-10-13")
    expect(dateART(1, ref)).toBe("2026-10-15")
  })

  it("usa el día ART incluso cerca del cambio de medianoche UTC", () => {
    // 2026-10-14 23:30 ART = 2026-10-15T02:30:00Z → sigue siendo 10-14 en ART
    const ref = new Date("2026-10-15T02:30:00Z")
    expect(dateART(0, ref)).toBe("2026-10-14")
    expect(dateART(-1, ref)).toBe("2026-10-13")
  })

  it("sin ref usa la fecha ART de hoy (misma semántica que todayART)", () => {
    expect(dateART(0)).toBe(todayART())
  })
})

describe("getDependency", () => {
  it("cadena declarada: Previa ← Nocturna de ayer; turnos del día ← turno anterior", () => {
    expect(getDependency("Previa")).toEqual({ turno: "Nocturna", dateOffset: -1 })
    expect(getDependency("Primera")).toEqual({ turno: "Previa", dateOffset: 0 })
    expect(getDependency("Matutina")).toEqual({ turno: "Primera", dateOffset: 0 })
    expect(getDependency("Vespertina")).toEqual({ turno: "Matutina", dateOffset: 0 })
    expect(getDependency("Nocturna")).toEqual({ turno: "Vespertina", dateOffset: 0 })
  })

  it("Poceada es independiente (juego separado 00-99)", () => {
    expect(getDependency("Poceada")).toBeNull()
  })
})

describe("resolverDependencia", () => {
  it("día normal: sin saltos (la fecha esperada es un día con sorteo)", () => {
    // 2026-10-14 00:30 ART → ayer = 10-13 (martes, con sorteo)
    const r = resolverDependencia({ turno: "Nocturna", dateOffset: -1 }, new Date("2026-10-14T03:30:00Z"))
    expect(r).toEqual({ turno: "Nocturna", fecha: "2026-10-13" })
  })

  it("tras domingo + feriado: camina hasta el último día con sorteo real (bug 10-11/10-12)", () => {
    // Corrida real del 2026-10-13 23:45 ART que quedó bloqueada en prod:
    // esperaba "Nocturna del 10-11" (domingo, sin sorteo) para siempre.
    // 10-12 está en FERIADOS 2026, 10-11 es domingo → la expectativa real es
    // el sábado 10-10 (último día con sorteo previo).
    const r = resolverDependencia({ turno: "Nocturna", dateOffset: -1 }, new Date("2026-10-14T02:45:00Z"))
    expect(r.fecha).toBe("2026-10-10")
    expect(r.turno).toBe("Nocturna")
  })

  it("lunes: la dependencia de Previa (Nocturna de ayer = domingo) salta al sábado", () => {
    // 2026-10-19 es lunes; 10-18 domingo sin sorteo → sábado 10-17
    const r = resolverDependencia({ turno: "Nocturna", dateOffset: -1 }, new Date("2026-10-19T13:00:00Z"))
    expect(r.fecha).toBe("2026-10-17")
  })

  it("feriado parcial 24/12: el prerequisite baja al turno anterior que sí se sortea", () => {
    // 2026-12-24 09:00 ART (jueves): Matutina y Vespertina suspendidas
    const ref = new Date("2026-12-24T12:00:00Z")
    expect(resolverDependencia({ turno: "Matutina", dateOffset: 0 }, ref)).toEqual({
      turno: "Primera",
      fecha: "2026-12-24",
    })
    // Nocturna depende de Vespertina (suspendida) → Matutina (suspendida) → Primera
    expect(resolverDependencia({ turno: "Vespertina", dateOffset: 0 }, ref)).toEqual({
      turno: "Primera",
      fecha: "2026-12-24",
    })
  })

  it("31/12 también suspende Matutina y Vespertina", () => {
    const ref = new Date("2026-12-31T12:00:00Z")
    // Prerequisito de Nocturna = Vespertina (suspendida) → Matutina (suspendida) → Primera
    expect(resolverDependencia({ turno: "Vespertina", dateOffset: 0 }, ref)).toEqual({
      turno: "Primera",
      fecha: "2026-12-31",
    })
    // Un turno NO suspendido nunca se salta: el prerequisito se queda tal cual
    expect(resolverDependencia({ turno: "Primera", dateOffset: 0 }, ref)).toEqual({
      turno: "Primera",
      fecha: "2026-12-31",
    })
  })
})

describe("normalizarCronToken", () => {
  // Regresión bug real 2026-10-14: el env CRON_SECRET de prod está guardado
  // con prefijo ("Bearer X") y el webhook lo anteponía otra vez → header
  // "Bearer Bearer X" → 401 → /api/cron-precompute nunca corría tras cada
  // scrape y predictions_cache no se refrescaba durante el día.
  it("colapsa prefijos Bearer anidados (la forma que envía el webhook)", () => {
    expect(normalizarCronToken("Bearer Bearer mi-secreto")).toBe("mi-secreto")
    expect(normalizarCronToken("Bearer mi-secreto")).toBe("mi-secreto")
    expect(normalizarCronToken("mi-secreto")).toBe("mi-secreto")
  })

  it("es case-insensitive y con cualquier cantidad de espacios", () => {
    expect(normalizarCronToken("bearer   mi-secreto")).toBe("mi-secreto")
    expect(normalizarCronToken("BEARER BEARER mi-secreto")).toBe("mi-secreto")
  })

  it("no toca secretos que no llevan prefijo (comportamiento previo intacto)", () => {
    expect(normalizarCronToken("abcdef123456")).toBe("abcdef123456")
    expect(normalizarCronToken("")).toBe("")
  })
})
