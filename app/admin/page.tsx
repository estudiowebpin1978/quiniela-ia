"use client"
import { useState, useEffect } from "react"

interface User {
  id: string
  email: string
  role: string
  premium_until: string | null
  created_at?: string
}

interface PendingPayment {
  email: string
  plan: string
  days: number
  amount: number
  timestamp: number
}

interface Transfer {
  id: string
  user_id: string
  plan: string
  amount: number
  status: string
  created_at: string
}

interface WebhookLog {
  id: string
  source: string
  order_id: string
  user_id: string
  status: string
  created_at: string
  payload?: string
}

const PLANS = [
  { label: "15 días", days: 15, amount: 7000 },
  { label: "30 días", days: 30, amount: 10000 },
]

type Tab = "dashboard" | "usuarios" | "pagos" | "transferencias"

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [token, setToken] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [quickEmail, setQuickEmail] = useState("")
  const [quickDays, setQuickDays] = useState(30)
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [transfersLoading, setTransfersLoading] = useState(false)
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem("quiniela-ia-auth")
    if (!raw) { window.location.href = "/login"; return }
    try {
      const s = JSON.parse(raw)
      if (!s?.access_token) { window.location.href = "/login"; return }
      setToken(s.access_token)
      loadUsers(s.access_token)
      loadPendingPayments()
    } catch { window.location.href = "/login" }
  }, [])

  async function loadUsers(tk?: string) {
    const t = tk || token
    if (!t) return
    setLoading(true); setErr("")
    try {
      const r = await fetch("/api/admin?t=" + Date.now(), { headers: { Authorization: "Bearer " + t } })
      const d = await r.json()
      if (!r.ok) { setErr(r.status === 401 ? "No tenés permisos de admin" : d.error); return }
      setUsers(d.users || [])
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setLoading(false) }
  }

  async function loadPendingPayments() {
    try {
      const raw = localStorage.getItem("quiniela-ia-pending-payments")
      if (raw) {
        const data = JSON.parse(raw)
        const now = Date.now()
        const valid = data.filter((r: PendingPayment) => now - r.timestamp < 7 * 86400000)
        localStorage.setItem("quiniela-ia-pending-payments", JSON.stringify(valid))
        setPendingPayments(valid)
      }
    } catch {}
  }

  async function loadTransfers() {
    if (!token) return
    setTransfersLoading(true)
    try {
      const r = await fetch("/api/admin/transfers?status=pending", { headers: { Authorization: "Bearer " + token } })
      const d = await r.json()
      setTransfers(d.transfers || [])
    } catch {} finally { setTransfersLoading(false) }
  }

  async function loadWebhookLogs() {
    if (!token) return
    setLogsLoading(true)
    try {
      const r = await fetch("/api/admin?webhook_logs=true", { headers: { Authorization: "Bearer " + token } })
      const d = await r.json()
      setWebhookLogs(d.webhook_logs || [])
    } catch {} finally { setLogsLoading(false) }
  }

  async function activatePremium(userId: string, email: string, days: number) {
    if (!token) return
    setBusy(userId + days); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ userId, action: "premium", days })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`Premium activado para ${email} (${days}d)`)
      removePendingPayment(email)
      loadUsers()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  async function removePremium(userId: string, email: string) {
    if (!token) return
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
      loadUsers()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  async function deleteUser(userId: string, email: string) {
    if (!confirm(`Eliminar usuario ${email}? Esta acción no se puede deshacer.`)) return
    if (!token) return
    setBusy(userId + "delete"); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ userId, action: "delete" })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg(`Usuario ${email} eliminado`)
      loadUsers()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  async function quickActivate() {
    if (!quickEmail || !token) return
    setBusy("quick"); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin", { headers: { Authorization: "Bearer " + token } })
      const d = await r.json()
      const user = (d.users || []).find((u: User) => u.email?.toLowerCase() === quickEmail.toLowerCase().trim())
      if (!user) { setErr(`No se encontró usuario: ${quickEmail}`); setBusy(null); return }
      await activatePremium(user.id, user.email, quickDays)
      setQuickEmail("")
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  function removePendingPayment(email: string) {
    const updated = pendingPayments.filter(p => p.email !== email)
    setPendingPayments(updated)
    localStorage.setItem("quiniela-ia-pending-payments", JSON.stringify(updated))
  }

  async function approveTransfer(transferId: string) {
    if (!token) return
    setBusy(transferId); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ transferId, action: "approve" })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg("Transferencia aprobada y premium activado")
      loadTransfers()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  async function rejectTransfer(transferId: string) {
    if (!token) return
    setBusy(transferId); setMsg(""); setErr("")
    try {
      const r = await fetch("/api/admin/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ transferId, action: "reject" })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setMsg("Transferencia rechazada")
      loadTransfers()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error") } finally { setBusy(null) }
  }

  function daysLeft(until: string | null): { text: string; color: string } | null {
    if (!until) return null
    const d = Math.ceil((new Date(until).getTime() - Date.now()) / 86400000)
    if (d <= 0) return { text: "VENCIDO", color: "#ef4444" }
    if (d <= 3) return { text: `${d}d`, color: "#ef4444" }
    if (d <= 7) return { text: `${d}d`, color: "#f59e0b" }
    return { text: `${d}d`, color: "#22c55e" }
  }

  const filtered = users.filter(u => u.email?.toLowerCase().includes(search.toLowerCase()))
  const premiumActive = users.filter(u => u.role === "premium" && u.premium_until && new Date(u.premium_until) > new Date())
  const expiringSoon = premiumActive.filter(u => {
    const d = daysLeft(u.premium_until)
    return d && (d.color === "#ef4444" || d.color === "#f59e0b")
  })
  const freeUsers = users.filter(u => u.role === "free" || !u.role)

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { background: #0a0a0f }
        .admin { max-width: 960px; margin: 0 auto; padding: 24px 16px 80px }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1e293b }
        .title { font-size: 20px; font-weight: 800; color: #f59e0b }
        .back { padding: 6px 12px; border-radius: 8px; border: 1px solid #1e293b; background: transparent; color: #94a3b8; font-size: 12px; text-decoration: none; font-weight: 600; cursor: pointer }
        .back:hover { border-color: #ec4899; color: #ec4899 }
        .tabs { display: flex; gap: 4px; margin-bottom: 20px; background: #111827; border-radius: 12px; padding: 4px; border: 1px solid #1e293b }
        .tab { flex: 1; padding: 10px 8px; border-radius: 8px; border: none; background: transparent; color: #64748b; font-size: 13px; font-weight: 700; cursor: pointer; transition: all .15s }
        .tab.active { background: linear-gradient(135deg, #ec4899, #be185d); color: #fff; box-shadow: 0 4px 12px rgba(236,72,153,.3) }
        .tab:hover:not(.active) { background: rgba(255,255,255,.05); color: #94a3b8 }
        .stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px }
        .stat { background: #111827; border: 1px solid #1e293b; border-radius: 14px; padding: 16px 12px; text-align: center }
        .stat-val { font-size: 28px; font-weight: 900; font-family: monospace }
        .stat-label { font-size: 11px; color: #64748b; margin-top: 3px; font-weight: 600 }
        .section { background: #111827; border: 1px solid #1e293b; border-radius: 16px; padding: 20px; margin-bottom: 20px }
        .section-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px }
        .msg { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); border-radius: 10px; padding: 12px 16px; color: #22c55e; font-size: 13px; margin-bottom: 16px }
        .err { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); border-radius: 10px; padding: 12px 16px; color: #ef4444; font-size: 13px; margin-bottom: 16px }
        .input { width: 100%; background: #0a0a0f; border: 1px solid #1e293b; border-radius: 8px; color: #e2e8f0; font-size: 13px; padding: 10px 12px; outline: none }
        .input:focus { border-color: #ec4899; box-shadow: 0 0 0 3px rgba(236,72,153,.15) }
        .input::placeholder { color: #475569 }
        .btn { padding: 8px 14px; border-radius: 8px; border: none; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .15s }
        .btn:active { transform: scale(.97) }
        .btn:disabled { opacity: .5; cursor: not-allowed }
        .btn-gold { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000 }
        .btn-pink { background: linear-gradient(135deg, #ec4899, #be185d); color: #fff }
        .btn-green { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff }
        .btn-red { background: rgba(239,68,68,.15); color: #ef4444; border: 1px solid rgba(239,68,68,.3) }
        .btn-outline { background: transparent; color: #94a3b8; border: 1px solid #1e293b }
        .btn-outline:hover { border-color: #ec4899; color: #ec4899 }
        .row { display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #1e293b }
        .row:last-child { border-bottom: none }
        .badge { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700 }
        .badge-admin { background: rgba(245,158,11,.15); color: #f59e0b }
        .badge-premium { background: rgba(236,72,153,.15); color: #ec4899 }
        .badge-free { background: rgba(100,116,139,.15); color: #64748b }
        .badge-ok { background: rgba(34,197,94,.15); color: #22c55e }
        .badge-err { background: rgba(239,68,68,.15); color: #ef4444 }
        .badge-warn { background: rgba(245,158,11,.15); color: #f59e0b }
        .empty { text-align: center; padding: 40px; color: #475569 }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.2); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite }
        @keyframes spin { to { transform: rotate(360deg) } }
        .actions { display: flex; gap: 6px; flex-wrap: wrap }
        .select { background: #0a0a0f; border: 1px solid #1e293b; border-radius: 8px; color: #e2e8f0; font-size: 13px; padding: 10px 12px; outline: none }
        .select:focus { border-color: #ec4899 }
        @media(max-width:640px) { .stats { grid-template-columns: repeat(2,1fr) } }
      `}</style>

      <div className="admin">
        <div className="header">
          <div className="title">Panel Admin</div>
          <a href="/predictions" className="back">← Volver</a>
        </div>

        {msg && <div className="msg">{msg}</div>}
        {err && <div className="err">{err}</div>}

        <div className="tabs">
          <button className={`tab${tab === "dashboard" ? " active" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={`tab${tab === "usuarios" ? " active" : ""}`} onClick={() => setTab("usuarios")}>Usuarios</button>
          <button className={`tab${tab === "pagos" ? " active" : ""}`} onClick={() => { setTab("pagos"); loadWebhookLogs() }}>Pagos</button>
          <button className={`tab${tab === "transferencias" ? " active" : ""}`} onClick={() => { setTab("transferencias"); loadTransfers() }}>Transferencias</button>
        </div>

        {tab === "dashboard" && (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-val" style={{ color: "#e2e8f0" }}>{users.length}</div>
                <div className="stat-label">Total users</div>
              </div>
              <div className="stat">
                <div className="stat-val" style={{ color: "#22c55e" }}>{premiumActive.length}</div>
                <div className="stat-label">Premium active</div>
              </div>
              <div className="stat">
                <div className="stat-val" style={{ color: "#f59e0b" }}>{expiringSoon.length}</div>
                <div className="stat-label">Expiring soon</div>
              </div>
              <div className="stat">
                <div className="stat-val" style={{ color: "#64748b" }}>{freeUsers.length}</div>
                <div className="stat-label">Free</div>
              </div>
            </div>

            <div className="section">
              <div className="section-title">Quick activate</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input className="input" placeholder="Email del usuario..." value={quickEmail} onChange={e => setQuickEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && quickActivate()} style={{ flex: 1 }} />
                <select className="select" value={quickDays} onChange={e => setQuickDays(Number(e.target.value))}>
                  {PLANS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
                </select>
                <button className="btn btn-gold" onClick={quickActivate} disabled={busy === "quick" || !quickEmail}>
                  {busy === "quick" ? <span className="spinner" /> : `Activate ${quickDays}d`}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                ${quickDays === 15 ? "7.000" : "10.000"} ARS — {quickDays} días de premium
              </div>
            </div>

            {pendingPayments.length > 0 && (
              <div className="section" style={{ borderColor: "rgba(245,158,11,.3)" }}>
                <div className="section-title" style={{ color: "#f59e0b" }}>Pending payments ({pendingPayments.length})</div>
                {pendingPayments.map((p, i) => (
                  <div className="row" key={i}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.email}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{p.plan} · ${p.amount.toLocaleString("es-AR")} · {new Date(p.timestamp).toLocaleDateString("es-AR")}</div>
                    </div>
                    <div className="actions">
                      <button className="btn btn-green" disabled={busy === `p-${i}`} onClick={() => {
                        const user = users.find(u => u.email?.toLowerCase() === p.email)
                        if (user) activatePremium(user.id, p.email, p.days)
                        else setErr(`No se encontró usuario: ${p.email}`)
                      }}>
                        {busy === `p-${i}` ? <span className="spinner" /> : "✓ Activate"}
                      </button>
                      <button className="btn btn-red" onClick={() => removePendingPayment(p.email)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {expiringSoon.length > 0 && (
              <div className="section" style={{ borderColor: "rgba(239,68,68,.3)" }}>
                <div className="section-title" style={{ color: "#ef4444" }}>Expiring premium ({expiringSoon.length})</div>
                {expiringSoon.map(u => {
                  const d = daysLeft(u.premium_until)
                  return (
                    <div className="row" key={u.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{u.email}</div>
                        <div style={{ fontSize: 11, color: d?.color || "#64748b" }}>
                          {d?.text} · Expires {u.premium_until ? new Date(u.premium_until).toLocaleDateString("es-AR") : "N/A"}
                        </div>
                      </div>
                      <div className="actions">
                        <button className="btn btn-pink" disabled={busy === u.id + "7"} onClick={() => activatePremium(u.id, u.email, 7)}>
                          {busy === u.id + "7" ? <span className="spinner" /> : "+7d"}
                        </button>
                        <button className="btn btn-green" disabled={busy === u.id + "30"} onClick={() => activatePremium(u.id, u.email, 30)}>
                          {busy === u.id + "30" ? <span className="spinner" /> : "+30d"}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === "usuarios" && (
          <div className="section">
            <div className="section-title">All users ({filtered.length})</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input className="input" placeholder="Search by email..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-outline" onClick={() => loadUsers()}>↻ Refresh</button>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty">No users found</div>
            ) : (
              filtered.map(u => {
                const d = daysLeft(u.premium_until)
                return (
                  <div className="row" key={u.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                      <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                        <span className={`badge ${u.role === "admin" ? "badge-admin" : u.role === "premium" ? "badge-premium" : "badge-free"}`}>
                          {u.role === "admin" ? "ADMIN" : u.role === "premium" ? "PREMIUM" : "FREE"}
                        </span>
                        {d && <span style={{ color: d.color, fontWeight: 600, fontSize: 11 }}>{d.text}</span>}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn btn-pink" style={{ fontSize: 11 }} disabled={busy === u.id + "7"} onClick={() => activatePremium(u.id, u.email, 7)}>
                        {busy === u.id + "7" ? <span className="spinner" /> : "+7d"}
                      </button>
                      <button className="btn btn-green" style={{ fontSize: 11 }} disabled={busy === u.id + "30"} onClick={() => activatePremium(u.id, u.email, 30)}>
                        {busy === u.id + "30" ? <span className="spinner" /> : "+30d"}
                      </button>
                      {u.role !== "free" && (
                        <button className="btn btn-red" disabled={busy === u.id + "free"} onClick={() => removePremium(u.id, u.email)}>
                          {busy === u.id + "free" ? <span className="spinner" /> : "✕ Remover"}
                        </button>
                      )}
                      <button className="btn btn-red" disabled={busy === u.id + "delete"} onClick={() => deleteUser(u.id, u.email)}>
                        {busy === u.id + "delete" ? <span className="spinner" /> : "🗑 Eliminar"}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {tab === "pagos" && (
          <div className="section">
            <div className="section-title">Webhook payment logs</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Recent card payments from webhook /api/admin?webhook_logs=true
            </div>
            <button className="btn btn-outline" onClick={loadWebhookLogs} style={{ marginBottom: 16 }} disabled={logsLoading}>
              {logsLoading ? <span className="spinner" /> : "↻ Refresh"}
            </button>
            {logsLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></div>
            ) : webhookLogs.length === 0 ? (
              <div className="empty">No webhook logs available</div>
            ) : (
              webhookLogs.map(log => (
                <div className="row" key={log.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{log.user_id?.slice(0, 8) || "N/A"}...</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {log.order_id || "N/A"} · {log.source || "N/A"} · {new Date(log.created_at).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <span className={`badge ${log.status === "processed" ? "badge-ok" : log.status === "rejected" ? "badge-err" : "badge-warn"}`}>
                    {log.status}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "transferencias" && (
          <div className="section">
            <div className="section-title">Pending transfers</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
              Users who paid via bank transfer and await approval.
            </div>
            <button className="btn btn-outline" onClick={loadTransfers} style={{ marginBottom: 16 }} disabled={transfersLoading}>
              {transfersLoading ? <span className="spinner" /> : "↻ Refresh"}
            </button>
            {transfersLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><span className="spinner" /></div>
            ) : transfers.length === 0 ? (
              <div className="empty">No pending transfers</div>
            ) : (
              transfers.map(t => (
                <div className="row" key={t.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>User: {t.user_id.slice(0, 8)}...</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {t.plan} · ${t.amount.toLocaleString("es-AR")} · {new Date(t.created_at).toLocaleString("es-AR")}
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-green" disabled={busy === t.id} onClick={() => approveTransfer(t.id)}>
                      {busy === t.id ? <span className="spinner" /> : "✓ Approve"}
                    </button>
                    <button className="btn btn-red" disabled={busy === t.id} onClick={() => rejectTransfer(t.id)}>
                      {busy === t.id ? <span className="spinner" /> : "✕ Reject"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
