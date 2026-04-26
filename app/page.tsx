"use client"
import { useEffect } from "react"
export default function Home() {
  useEffect(() => {
    const proj = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").split("//")[1]?.split(".")[0] || "wazkylxgqckjfkcmfotl"
    const raw = localStorage.getItem("sb-" + proj + "-auth-token")
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s?.access_token) {
          window.location.href = "/predictions"
          return
        }
      } catch {}
    }
    window.location.href = "/login"
  }, [])
  return null
}
