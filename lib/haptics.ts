/**
 * Haptic feedback utility — shared across all components.
 * Uses navigator.vibrate() on supported devices.
 * Read setting from localStorage to respect user preference.
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "streak"

const PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [20],
  heavy: [30],
  success: [15, 50, 15],
  error: [30, 50, 30],
  streak: [10, 30, 10, 30, 10],
}

export function triggerHaptic(pattern: HapticPattern = "light"): void {
  try {
    const settings = JSON.parse(localStorage.getItem("quiniela-settings") || "{}")
    if (settings.hapticEnabled === false) return
    if (!navigator?.vibrate) return
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Fallback: try vibrate if no settings
    try { navigator?.vibrate(PATTERNS[pattern]) } catch { /* silent */ }
  }
}
