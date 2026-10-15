"use client"

/**
 * Poceada Federal (Lotería de Santa Fe) — modalidad PREMIUM con las
 * MISMAS instrucciones/estructura de la Poceada de la Ciudad (misma
 * estética: brinco.css, brinco-head / brinco-sub / brinco-card / aviso),
 * pero con las reglas oficiales de la Poceada Federal.
 *
 * Acceso Premium controlado en el CLIENTE (mirando /api/auth/me, mismo
 * patrón que Brinco y Poceada). Esta página es informativa: no consume
 * endpoints protegidos, así que no hay datos de esta modalidad que el
 * servidor deba resguardar (el gate es de UI).
 *
 * IMPORTANTE — sin pronósticos a propósito: la app todavía no tiene
 * incorporada al pipeline la fuente oficial de datos de la Lotería de
 * Santa Fe (el parser parseLoteriaSantaFe existe pero no está cableado)
 * ni la alternancia mensual con Entre Ríos. No se muestran números
 * "predichos" para esta modalidad porque sería INVENTAR datos: solo se
 * publican las reglas oficiales. Si algún día se cablea la fuente, esta
 * página puede pasar a mostrar jugadas como Poceada/Brinco.
 *
 * La única lógica derivada (no inventada) es la alternancia mensual del
 * sorteo nocturno, que sale del helper puro y testeado
 * lib/poceada-federal/reglas.ts.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  periodoART,
  loteriaNocturnaRigente,
  nombreMes,
  etiquetaLoteriaNocturna,
} from "@/lib/poceada-federal/reglas"
import "../brinco/brinco.css"

const AVISO =
  "La lotería es un evento aleatorio e independiente y no se garantiza ningún resultado. " +
  "La Poceada Federal es un juego poceado (parimutuel): el premio depende del pozo y de " +
  "cuántos jugadores aciertan, no hay ganancia fija por juego. Jugá con responsabilidad."

const tituloPaso: React.CSSProperties = { fontWeight: 700 }

export default function PoceadaFederalPage() {
  const router = useRouter()
  const [cargando, setCargando] = useState(true)
  const [acceso, setAcceso] = useState<"cargando" | "ok" | "no-auth" | "no-premium">("cargando")
  const { mes, anio } = periodoART()
  const rigente = loteriaNocturnaRigente(mes)

  // Acceso Premium en el CLIENTE (mismo patrón que Brinco/Poceada):
  // getAuth() -> /api/auth/me -> canAccessPremiumFeatures | role premium/admin.
  // El estado se resuelve SIEMPRE en callbacks (nunca setState síncrono en el
  // cuerpo del effect — regla react-hooks/set-state-in-effect).
  useEffect(() => {
    const tk = getAuth()?.access_token
    Promise.resolve()
      .then(() => {
        if (!tk) return null
        return fetch("/api/auth/me", { headers: { Authorization: "Bearer " + tk } }).then((r) =>
          r.ok ? r.json() : null
        )
      })
      .then((me) => {
        if (!tk) {
          setAcceso("no-auth")
          return
        }
        const premium = me?.canAccessPremiumFeatures || me?.role === "premium" || me?.role === "admin"
        setAcceso(premium ? "ok" : "no-premium")
      })
      .catch(() => setAcceso("no-auth"))
      .finally(() => setCargando(false))
  }, [])

  if (cargando || acceso === "cargando") {
    return (
      <div className="brinco-wrap">
        <div className="brinco-loading">Cargando Poceada Federal…</div>
      </div>
    )
  }

  if (acceso === "no-auth") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Poceada Federal</h2>
        <p className="brinco-empty">Iniciá sesión para acceder.</p>
        <div className="brinco-actions" style={{ justifyContent: "center" }}>
          <button className="brinco-btn" onClick={() => router.push("/login")}>
            Iniciar sesión
          </button>
          <button className="brinco-btn ghost" onClick={() => router.push("/predictions")}>
            ← Volver a Quiniela
          </button>
        </div>
      </div>
    )
  }

  if (acceso === "no-premium") {
    return (
      <div className="brinco-wrap brinco-gate">
        <h2>Poceada Federal</h2>
        <p className="brinco-empty">
          Esta modalidad es parte de Premium. Actualizá tu plan para ver la Poceada Federal.
        </p>
        <button className="brinco-btn" onClick={() => router.push("/predictions")}>
          Ver planes
        </button>
      </div>
    )
  }

  return (
    <div className="brinco-wrap">
      <div className="brinco-head">
        <h1 className="brinco-title">Poceada Federal</h1>
        <button
          className="brinco-btn ghost"
          style={{ marginLeft: "auto", alignSelf: "center" }}
          onClick={() => router.push("/predictions")}
        >
          ← Volver a Quiniela
        </button>
      </div>

      <p className="brinco-sub">
        <b>8 números</b> distintos del <b>00 al 99</b>. Se juega de <b>lunes a sábados</b> con{" "}
        <b>dos sorteos diarios</b> (matutino y nocturno) y ganás con <b>6, 7 u 8 aciertos</b>.
      </p>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Cómo se juega y cómo se gana
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10, fontSize: "0.85rem", lineHeight: 1.55 }}>
          <li>
            <span style={tituloPaso}>La elección de números.</span> Seleccionás{" "}
            <b>8 números del 00 al 99</b> (podés elegirlos vos o mediante selección automática en la
            agencia).
          </li>
          <li>
            <span style={tituloPaso}>Los sorteos.</span> Se juega de <b>lunes a sábados</b> con dos
            sorteos diarios: <b>matutino</b> y <b>nocturno</b>.
          </li>
          <li>
            <span style={tituloPaso}>Qué lotería rige el nocturno.</span> El sorteo nocturno se
            alterna según el mes: en los <b>meses impares</b> se utiliza la{" "}
            <b>Quiniela Nocturna de Santa Fe</b>; en los <b>meses pares</b>, la{" "}
            <b>Tómbola / Quiniela Nocturna de Entre Ríos</b>.
            <div
              className="brinco-meta"
              style={{ marginTop: 6, display: "block", borderRadius: 8 }}
            >
              📅 Este mes ({nombreMes(mes)} de {anio} → mes {mes % 2 === 1 ? "impar" : "par"}) el
              nocturno lo rige: <b>{etiquetaLoteriaNocturna(rigente)}</b>
            </div>
          </li>
          <li>
            <span style={tituloPaso}>Extracción.</span> Se toman las <b>2 últimas cifras</b> de los{" "}
            <b>20 premios</b> del sorteo de quiniela correspondiente. Si hay números repetidos, se
            realizan extracciones adicionales hasta completar <b>20 números distintos</b>.
          </li>
        </ol>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Niveles de premios (juego poceado)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-dim,#9aa0a6)" }}>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Aciertos</th>
              <th style={{ padding: "4px 0", fontWeight: 600 }}>Premio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>8</b> (1er premio)
              </td>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>50%</b> del pozo destinado a premios (o se acumula si no hay ganadores)
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>7</b> (2do premio)
              </td>
              <td style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                <b>30%</b> del pozo
              </td>
            </tr>
            <tr>
              <td style={{ padding: "6px 0" }}>
                <b>6</b> (3er premio)
              </td>
              <td style={{ padding: "6px 0" }}>
                <b>20%</b> del pozo
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>Dónde jugar</div>
        <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55 }}>
          Acercate a cualquier <b>agencia oficial de la Lotería de Santa Fe</b> autorizada y
          solicitá una jugada de Poceada Federal.
        </p>
      </div>

      <div className="brinco-card">
        <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}>
          Pronósticos en esta modalidad
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.55, color: "var(--text-dim,#9aa0a6)" }}>
          La app todavía <b>no genera jugadas</b> para la Poceada Federal: requiere la fuente
          oficial de datos de la Lotería de Santa Fe (y la alternancia mensual con Entre Ríos),
          que aún no está incorporada al pipeline. Por eso esta página publica las reglas
          oficiales, pero no números pronosticados. Los pronósticos de la app siguen siendo para
          la Quiniela de la Ciudad, la Poceada y el Brinco.
        </p>
        <div className="brinco-aviso">{AVISO}</div>
      </div>
    </div>
  )
}
