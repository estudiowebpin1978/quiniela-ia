"use client"
import { useEffect } from "react"
import { isLoggedIn } from "@/lib/auth"

export default function Home() {
  useEffect(() => {
    if (isLoggedIn()) {
      window.location.href = "/predictions"
    } else {
      window.location.href = "/login"
    }
  }, [])
  return null
}
