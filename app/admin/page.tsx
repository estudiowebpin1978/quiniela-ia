"use client"
import { useState, useEffect, useCallback } from "react"

interface User {
  id: string
  email: string
  role: string
  premium_until: string | null
  created_at?: string
}

interface PendingRequest {
  email: string
  plan: string
  days: number
  amount: number
  timestamp: number
}

const WA_CHANNEL = "https://whatsapp.com/channel/0029VbB7O9B9cDDUtBY9GU1F"
const WA_BASE = "https://wa.me/"
const PLANS = [
  { label: "Semanal", days: 7, amount: 3500, color: "#a855f7" },
  { label: "Mensual", days: 30, amount: 10000, color: "#22c55e" },
]

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [msg, setMsg] = useState("")
  const [token, setToken] = useState("")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [quickEmail, setQuickEmail] = useState("")
  const [tab, setTab] = useState<"dashboard" | "users" | "pending" | "scraper">("dashboard")

  useEffect(() => {
    const proj = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").split("//")[1]?.split(".")[0] || "project"
    const raw = localStorage.getItem("sb-" + proj + "-auth-token")
    if (!raw) { window.location.href = "/login"; return }
    try {
      const s = JSON.parse(raw)
      if (!s?.access_token) { window.location.href = "/login"; return }
      setToken(s.access_token)
      load(s.access_token)
      loadPending()
    } catch { window.location.href = "/login" }
  }, [])

  function loadPending() {
    try {
      const raw = localStorage.getItem("quiniela-ia-pending-payments")
      if (raw) {
        const data = JSON.parse(raw)
        const now = Date.now()
        const valid = data.filter((r: PendingRequest) => now - r.timestamp < 7 * 86400000)
        localStorage.setItem("quiniela-ia-pending-payments", JSON.stringify(valid))
        setPending(valid)
      }
    } catch {}
  }

  async function load(tk: string) {
    setLoading(true); setErr("")
    try {
      const r = await fetch("/api/admin", { headers: { Authorization: "Bearer " + tk } })
      const d = await r.json()
      if (!r.ok) { setErr(r.status === 401 ? "No tenes permisos de admin" : d.error); setLoading(false); return }
      setUsers(d.users || [])
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }

  async function activatePremium(userId: string, email: string, days: number, plan: string) {
    setBusy(userId + days); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ userId, action: "premium", days })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`✓ Premium ${plan} (${days}d) activado para ${email}`)
      removePending(email)
      load(token)
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function activateFree(userId: string, email: string) {
    setBusy(userId + "free"); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ userId, action: "free" })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`Premium removido de ${email}`)
      load(token)
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  async function quickActivate() {
    if (!quickEmail || !token) return
    setBusy("quick"); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", { headers: { Authorization: "Bearer " + token } })
      const d = await r.json()
      const user = (d.users || []).find((u: User) => u.email?.toLowerCase() === quickEmail.toLowerCase().trim())
      if (!user) { setErr(`No se encontró usuario con email: ${quickEmail}`); setBusy(null); return }
      await activatePremium(user.id, user.email, 30, "Mensual")
      setQuickEmail("")
    } catch (e: any) { setErr(e.message) } finally { setBusy(null) }
  }

  function removePending(email: string) {
    const updated = pending.filter(p => p.email !== email)
    setPending(updated)
    localStorage.setItem("quiniela-ia-pending-payments", JSON.stringify(updated))
  }

  function addPendingManual() {
    if (!quickEmail) return
    const newReq: PendingRequest = {
      email: quickEmail.trim().toLowerCase(),
      plan: "Mensual",
      days: 30,
      amount: 10000,
      timestamp: Date.now()
    }
    const updated = [...pending.filter(p => p.email !== newReq.email), newReq]
    setPending(updated)
    localStorage.setItem("quiniela-ia-pending-payments", JSON.stringify(updated))
    setQuickEmail("")
    setMsg("Solicitud agregada a la cola")
  }

  function sendWhatsAppConfirmation(email: string, plan: string, days: number) {
    const msg = encodeURIComponent(`✅ *Quiniela IA*\n\nHola! Tu acceso *Premium ${plan}* (${days} días) ha sido activado.\n\nYa podés acceder a los análisis de 3 y 4 cifras.\n\n🔗 ${window.location.origin}/predictions\n\n_Quiniela IA - Análisis Estadístico con IA_`)
    window.open(`${WA_BASE}?text=${msg}`, "_blank")
  }

  function daysLeft(until: string | null): { text: string; urgent: boolean; expired: boolean } | null {
    if (!until) return null
    const d = Math.ceil((new Date(until).getTime() - Date.now()) / 86400000)
    if (d <= 0) return { text: "VENCIDO", urgent: true, expired: true }
    if (d <= 3) return { text: `${d}d restantes`, urgent: true, expired: false }
    if (d <= 7) return { text: `${d}d restantes`, urgent: false, expired: false }
    return { text: `${d}d restantes`, urgent: false, expired: false }
  }

  const filtered = users.filter(u => u.email?.toLowerCase().includes(search.toLowerCase()))
  const premiumUsers = users.filter(u => u.role === "premium" && u.premium_until && new Date(u.premium_until) > new Date())
  const expiringUsers = premiumUsers.filter(u => {
    const d = daysLeft(u.premium_until)
    return d && (d.urgent || d.expired)
  })
  const freeUsers = users.filter(u => u.role === "free" || !u.role)
  const adminUsers = users.filter(u => u.role === "admin")

  return (
    <div style={{ minHeight: "100vh", background: "#06080f", color: "#e2e8f0", fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        .pg{max-width:960px;margin:0 auto;padding:24px 16px 60px}
        .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.07)}
        .brand{display:flex;align-items:center;gap:10px}
        .bico{width:38px;height:38px;background:linear-gradient(135deg,#c9a84c,#7a6430);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
        .bnm{font-size:19px;font-weight:900;color:#c9a84c}
        .bk{padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#64748b;font-size:12px;text-decoration:none}
        .bk:hover{border-color:#c9a84c;color:#c9a84c}
        .tabs{display:flex;gap:4px;margin-bottom:20px;background:rgba(255,255,255,.03);border-radius:12px;padding:4px;border:1px solid rgba(255,255,255,.06)}
        .tab{flex:1;padding:10px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
        .tab.active{background:linear-gradient(135deg,#c9a84c,#7a6430);color:#fff}
        .tab:hover:not(.active){background:rgba(255,255,255,.05)}
        .sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
        .sc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px 12px;text-align:center}
        .sv{font-size:28px;font-weight:900;color:#c9a84c}
        .sv.g{color:#86efac}
        .sv.r{color:#fca5a5}
        .sv.b{color:#60a5fa}
        .sl{font-size:11px;color:#64748b;margin-top:3px}
        .sec{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:20px;margin-bottom:20px}
        .st{font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:16px;display:flex;align-items:center;gap:8px}
        .msg{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:12px 16px;color:#86efac;font-size:13px;margin-bottom:16px}
        .err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px 16px;color:#fca5a5;font-size:13px;margin-bottom:16px}
        .card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin-bottom:12px}
        .btn{padding:8px 16px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:inherit}
        .btn:active{transform:scale(.97)}
        .btn-p{background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;box-shadow:0 4px 12px rgba(168,85,247,.3)}
        .btn-g{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 4px 12px rgba(34,197,94,.3)}
        .btn-r{background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.3)}
        .btn-w{background:rgba(37,211,102,.15);color:#25D366;border:1px solid rgba(37,211,102,.3)}
        .btn-o{background:rgba(255,255,255,.06);color:#94a3b8;border:1px solid rgba(255,255,255,.1)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .input{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#fff;font-size:13px;padding:10px 12px;outline:none;font-family:inherit}
        .input:focus{border-color:#c9a84c}
        .input::placeholder{color:#475569}
        .badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600}
        .badge-p{background:rgba(168,85,247,.15);color:#c4b5fd}
        .badge-g{background:rgba(34,197,94,.15);color:#86efac}
        .badge-r{background:rgba(239,68,68,.15);color:#fca5a5}
        .badge-y{background:rgba(245,158,11,.15);color:#fbbf24}
        .badge-o{background:rgba(100,116,139,.15);color:#94a3b8}
        .row{display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid rgba(255,255,255,.04)}
        .row:last-child{border-bottom:none}
        .avatar{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;flex-shrink:0}
        .plan-btns{display:flex;gap:6px;flex-wrap:wrap}
        .sp{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:640px){.sg{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div className="pg">
        <div className="top">
          <div className="brand"><div className="bico">⚙️</div><span className="bnm">Panel Admin</span></div>
          <a href="/predictions" className="bk">← Volver a la app</a>
        </div>

        {msg && <div className="msg">✓ {msg}</div>}
        {err && <div className="err">✗ {err}</div>}

        <div className="tabs">
          <button className={"tab" + (tab === "dashboard" ? " active" : "")} onClick={() => setTab("dashboard")}>📊 Dashboard</button>
          <button className={"tab" + (tab === "pending" ? " active" : "")} onClick={() => setTab("pending")}>⏳ Pagos {pending.length > 0 && `(${pending.length})`}</button>
          <button className={"tab" + (tab === "users" ? " active" : "")} onClick={() => setTab("users")}>👥 Usuarios</button>
          <button className={"tab" + (tab === "scraper" ? " active" : "")} onClick={() => setTab("scraper")}>🔄 Scraper</button>
        </div>

        {tab === "dashboard" && (
          <>
            <div className="sg">
              <div className="sc"><div className="sv">{users.length}</div><div className="sl">Total</div></div>
              <div className="sc"><div className="sv g">{premiumUsers.length}</div><div className="sl">Premium</div></div>
              <div className="sc"><div className="sv r">{expiringUsers.length}</div><div className="sl">Por vencer</div></div>
              <div className="sc"><div className="sv b">{freeUsers.length}</div><div className="sl">Free</div></div>
            </div>

            <div className="sec">
              <div className="st">⚡ Activación rápida</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input className="input" placeholder="Email del usuario..." value={quickEmail} onChange={e => setQuickEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && quickActivate()} style={{ flex: 1 }} />
                <button className="btn btn-p" onClick={quickActivate} disabled={busy === "quick" || !quickEmail}>
                  {busy === "quick" ? <span className="sp" /> : "⚡ 30d"}
                </button>
                <button className="btn btn-o" onClick={addPendingManual} disabled={!quickEmail}>
                  + Cola
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Escribí el email y hacé click en "30d" para activar Premium mensual al instante.
              </div>
            </div>

            {expiringUsers.length > 0 && (
              <div className="sec" style={{ border: "1px solid rgba(239,68,68,.2)" }}>
                <div className="st" style={{ color: "#fca5a5" }}>⚠️ Premium por vencer ({expiringUsers.length})</div>
                {expiringUsers.map(u => {
                  const d = daysLeft(u.premium_until)
                  return (
                    <div className="row" key={u.id}>
                      <div className="avatar" style={{ background: d?.expired ? "rgba(239,68,68,.2)" : "rgba(245,158,11,.2)" }}>
                        {d?.expired ? "🔴" : "🟡"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                        <div style={{ fontSize: 11, color: d?.expired ? "#fca5a5" : "#fbbf24" }}>
                          {d?.expired ? "VENCIDO" : `Vence en ${Math.ceil((new Date(u.premium_until!).getTime() - Date.now()) / 86400000)} días`}
                          {" · "}
                          {new Date(u.premium_until!).toLocaleDateString("es-AR")}
                        </div>
                      </div>
                      <div className="plan-btns">
                        <button className="btn btn-p" disabled={busy === u.id + "7"} onClick={() => activatePremium(u.id, u.email, 7, "Semanal")}>
                          {busy === u.id + "7" ? <span className="sp" /> : "+7d"}
                        </button>
                        <button className="btn btn-g" disabled={busy === u.id + "30"} onClick={() => activatePremium(u.id, u.email, 30, "Mensual")}>
                          {busy === u.id + "30" ? <span className="sp" /> : "+30d"}
                        </button>
                        <button className="btn btn-w" onClick={() => sendWhatsAppConfirmation(u.email, "renovación", 30)}>
                          📲
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {pending.length > 0 && (
              <div className="sec" style={{ border: "1px solid rgba(168,85,247,.2)" }}>
                <div className="st" style={{ color: "#c4b5fd" }}>⏳ Pagos pendientes ({pending.length})</div>
                {pending.map((p, i) => (
                  <div className="row" key={i}>
                    <div className="avatar" style={{ background: "rgba(168,85,247,.2)" }}>💰</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.email}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.plan} · ${p.amount.toLocaleString("es-AR")} · {new Date(p.timestamp).toLocaleDateString("es-AR")}</div>
                    </div>
                    <div className="plan-btns">
                      <button className="btn btn-g" disabled={busy === `pending-${i}`} onClick={() => {
                        const user = users.find(u => u.email?.toLowerCase() === p.email)
                        if (user) activatePremium(user.id, p.email, p.days, p.plan)
                        else setErr(`No se encontró usuario: ${p.email}`)
                      }}>
                        {busy === `pending-${i}` ? <span className="sp" /> : "✓ Activar"}
                      </button>
                      <button className="btn btn-r" onClick={() => removePending(p.email)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "pending" && (
          <div className="sec">
            <div className="st">⏳ Cola de pagos pendientes</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.6 }}>
              Cuando un usuario te envíe comprobante de pago por WhatsApp, agregalo acá y activale el Premium con un click.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input className="input" placeholder="Email del usuario..." value={quickEmail} onChange={e => setQuickEmail(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-o" onClick={addPendingManual} disabled={!quickEmail}>+ Agregar a cola</button>
            </div>
            {pending.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13 }}>No hay pagos pendientes</div>
              </div>
            ) : (
              pending.map((p, i) => (
                <div className="card" key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.email}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(p.timestamp).toLocaleString("es-AR")}</div>
                    </div>
                    <span className="badge badge-y">{p.plan} · ${p.amount.toLocaleString("es-AR")}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-g" style={{ flex: 1 }} disabled={busy === `pending-${i}`} onClick={() => {
                      const user = users.find(u => u.email?.toLowerCase() === p.email)
                      if (user) activatePremium(user.id, p.email, p.days, p.plan)
                      else setErr(`No se encontró usuario: ${p.email}`)
                    }}>
                      {busy === `pending-${i}` ? <span className="sp" /> : `✓ Activar ${p.days}d`}
                    </button>
                    <button className="btn btn-w" onClick={() => sendWhatsAppConfirmation(p.email, p.plan, p.days)}>
                      📲 WhatsApp
                    </button>
                    <button className="btn btn-r" onClick={() => removePending(p.email)}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "users" && (
          <div className="sec">
            <div className="st">👥 Todos los usuarios ({filtered.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <input className="input" placeholder="Buscar por email..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <button className="btn btn-o" onClick={() => load(token)}>↻ Actualizar</button>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}><span className="sp" /> Cargando...</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>No hay usuarios{search ? " con ese email" : ""}</div>
            ) : (
              filtered.map(u => {
                const d = daysLeft(u.premium_until)
                const bg = u.role === "admin" ? "rgba(201,168,76,.15)" : u.role === "premium" ? "rgba(168,85,247,.15)" : "rgba(100,116,139,.1)"
                return (
                  <div className="row" key={u.id}>
                    <div className="avatar" style={{ background: bg, fontSize: 14 }}>
                      {u.role === "admin" ? "★" : u.role === "premium" ? "✓" : "○"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                        <span className={`badge ${u.role === "admin" ? "badge-y" : u.role === "premium" ? "badge-p" : "badge-o"}`}>
                          {u.role === "admin" ? "★ ADMIN" : u.role === "premium" ? "✓ PREMIUM" : "FREE"}
                        </span>
                        {d && <span className={`badge ${d.expired ? "badge-r" : d.urgent ? "badge-y" : "badge-g"}`}>{d.text}</span>}
                      </div>
                    </div>
                    <div className="plan-btns">
                      <button className="btn btn-p" style={{ fontSize: 11 }} disabled={busy === u.id + "7"} onClick={() => activatePremium(u.id, u.email, 7, "Semanal")}>
                        {busy === u.id + "7" ? <span className="sp" /> : "+7d"}
                      </button>
                      <button className="btn btn-g" style={{ fontSize: 11 }} disabled={busy === u.id + "30"} onClick={() => activatePremium(u.id, u.email, 30, "Mensual")}>
                        {busy === u.id + "30" ? <span className="sp" /> : "+30d"}
                      </button>
                      <button className="btn btn-w" style={{ fontSize: 11 }} onClick={() => sendWhatsAppConfirmation(u.email, "Premium", 30)}>
                        📲
                      </button>
                      {u.role !== "free" && (
                        <button className="btn btn-r" style={{ fontSize: 11 }} disabled={busy === u.id + "free"} onClick={() => activateFree(u.id, u.email)}>
                          {busy === u.id + "free" ? <span className="sp" /> : "✕"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {tab === "scraper" && (
          <ScraperSection token={token} />
        )}
      </div>
    </div>
  )
}

function ScraperSection({ token }: { token: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [scraperDate, setScraperDate] = useState(new Date().toISOString().split("T")[0])

  async function runScraper(turno: string) {
    setBusy(turno); setMsg("")
    try {
      const params = new URLSearchParams({ save: "true" })
      if (scraperDate) params.set("date", scraperDate)
      const r = await fetch(`/api/cron-scrape?${params}`, { headers: { Authorization: "Bearer " + token } })
      const d = await r.json()
      if (d.ok || d.guardados !== undefined) { setMsg(`OK - ${d.guardados || 0} turnos guardados`) }
      else { setMsg("Error: " + JSON.stringify(d)) }
    } catch (e: any) { setMsg("Error: " + e.message) }
    setBusy(null)
  }

  return (
    <div className="sec">
      <div className="st">🔄 Scraper de resultados</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "#94a3b8" }}>Fecha:</label>
        <input className="input" type="date" value={scraperDate} onChange={e => setScraperDate(e.target.value)} style={{ width: 160 }} />
      </div>
      {msg && <div className="msg" style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"].map(t => (
          <button key={t} className="btn btn-o" disabled={busy === t} onClick={() => runScraper(t)}
            style={{ padding: "12px 8px", textAlign: "center" }}>
            {busy === t ? <span className="sp" /> : t}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 12, textAlign: "center" }}>
        Scrapea resultados oficiales de la fuente y los guarda en la base de datos
      </div>
    </div>
  )
}
