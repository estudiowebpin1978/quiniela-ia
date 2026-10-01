"use client"

import { ReactNode } from "react"
import { SettingsProvider } from "@/components/ui/Settings"
import InstallApp from "@/components/InstallApp"

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      {children}
      <InstallApp />
    </SettingsProvider>
  )
}