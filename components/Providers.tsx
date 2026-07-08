"use client"

import { ReactNode } from "react"
import { SettingsProvider } from "@/components/ui/Settings"

export default function Providers({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>
}