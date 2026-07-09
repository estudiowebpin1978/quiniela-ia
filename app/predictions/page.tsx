/**
 * Página principal de análisis estadístico de Quiniela IA.
 * 
 * Funcionalidades:
 * - Selección de turno (Previa, Primera, Matutina, Vespertina, Nocturna)
 * - Generación de análisis con 30 factores + ML
 * - Mapa de calor de frecuencias
 * - Tendencias y estadísticas
 * - Guardado de análisis y comparación con resultados reales
 * - Sistema de logros/badges
 * - Notificaciones push de nuevos resultados
 * - Integración premium (3 y 4 cifras)
 */

"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { usePushNotifications } from "@/components/PushNotifications";
import PaywallModal from "@/components/PaywallModal";
import WhatsAppFAB from "@/components/WhatsAppFAB";
import FooterDisclaimer from "@/components/FooterDisclaimer";
import GamificationBadge from "@/components/GamificationBadge";
import HistorialAciertos from "@/components/HistorialAciertos";
import ExpiryBanner from "@/components/ExpiryBanner";
import AgeGate from "@/components/AgeGate";
import { ToastProvider, useToast } from "@/components/Toast";
import { saveAuth, getAccessToken, clearAuth, getAuth, isGuest, clearGuest } from "@/lib/auth";
import { esFeriado, esDiaSinSorteo, motivoDiaSinSorteo, todosLosFeriados } from "@/lib/feriados";
import NumberGrid from "@/components/predictions/NumberGrid";
import HeatmapGrid from "@/components/predictions/HeatmapGrid";
import TrendBars from "@/components/predictions/TrendBars";
import ShareButtons from "@/components/predictions/ShareButtons";
import ReviewsCarousel from "@/components/predictions/ReviewsCarousel";
import PayCTA from "@/components/predictions/PayCTA";
import { useSound } from "@/lib/sound/audio-manager";
import { useSettings } from "@/components/ui/Settings";
import { ConfettiEffect, GlowOrbs, NeonBackground } from "@/components/ui/Effects";

const EMOJIS: Record<string, string> = {
  "00": "🥚", "01": "💧", "02": "🧒", "03": "⛪", "04": "🛏️", "05": "🐱", "06": "🐶", "07": "🔫", "08": "🔥", "09": "🏞️",
  "10": "🥛", "11": "🏏", "12": "💂", "13": "🍀", "14": "🥴", "15": "👧", "16": "💍", "17": "😭", "18": "🩸", "19": "🐟",
  "20": "🥳", "21": "👩", "22": "🤪", "23": "🦋", "24": "🐴", "25": "🐔", "26": "⛪", "27": "🪮", "28": "⛰️", "29": "🧔",
  "30": "🌹", "31": "💡", "32": "💎", "33": "✝️", "34": "👤", "35": "🐦", "36": "🌰", "37": "🌳", "38": "🪨", "39": "🌧️",
  "40": "👨‍⚖️", "41": "🔪", "42": "👟", "43": "🐸", "44": "🚓", "45": "🍷", "46": "🍅", "47": "⚰️", "48": "🗣️", "49": "🥩",
  "50": "🍞", "51": "🪚", "52": "🤱", "53": "⛵", "54": "🐄", "55": "🎶", "56": "📉", "57": "🧙‍♂️", "58": "🌊", "59": "🪴",
  "60": "🇻🇦", "61": "🔫", "62": "🌊", "63": "👰", "64": "😭", "65": "🥘", "66": "🕸️", "67": "🐍", "68": "🧒", "69": "👺",
  "70": "💀", "71": "💩", "72": "😲", "73": "🏥", "74": "🧔🏿", "75": "🤡", "76": "🔥", "77": "🦵", "78": "💃", "79": "🥷",
  "80": "🏆", "81": "⚽", "82": "🎱", "83": "🎾", "84": "⚾", "85": "🏐", "86": "🏉", "87": "🎳", "88": "🪀", "89": "🏓",
  "90": "📺", "91": "📻", "92": "🎤", "93": "🎼", "94": "🎷", "95": "🎸", "96": "🎺", "97": "🎻", "98": "🥁", "99": "🪗",
};

function getEmoji(num: string): string {
  const n = String(num).padStart(2, "0");
  return EMOJIS[n] || "❓";
}

const CONTACT = "estudiowebpin@gmail.com";
const WA = "https://api.whatsapp.com/send?phone=5493412500029";
const APP_URL = "https://quiniela-ia-two.vercel.app";
const SORTEOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"];
const HORAS: Record<string, string> = {
  Previa: "10:15",
  Primera: "12:00",
  Matutina: "15:00",
  Vespertina: "18:00",
  Nocturna: "21:00",
};
type RankingItem = {
  numero: string;
  score: number;
  prob: number;
};

type PredData = {
  numeros_2: string[];
  numeros_3: string[];
  numeros_4: string[];
  redoblona: string;
  ranking: RankingItem[];
  numeros?: any[];
  diasAnalisis?: number;
  totalSorteos?: number;
  stats?: {
    numeroMasFrecuente?: { numero: string; frecuencia: number; significado: string };
    numeroMayorRetraso?: { numero: string; retraso: number; significado: string };
  };
  heatmap: { n: number; f: number; s: string; pct: number }[];
};

function PageInner() {
  const toast = useToast();
  const sound = useSound();
  const { settings } = useSettings();
  const [showConfetti, setShowConfetti] = useState(false);
  const [pr, setPr] = useState(false);
  const [em, setEm] = useState("");
  const [tab, setTab] = useState<"pred" | "rdbl" | "freq" | "trend" | "mis" | "acc" | "hist">("pred");
  const [so, setSo] = useState("Nocturna");
  const [dg, setDg] = useState(2);
  const [ld, setLd] = useState(false);
  const [dn, setDn] = useState(false);
  const [er, setEr] = useState("");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [backtestData, setBacktestData] = useState<any>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [dt, setDt] = useState<PredData | null>(null);
  const [misPreds, setMisPreds] = useState<any[]>([]);
  const [numDetail, setNumDetail] = useState<any>(null);
  const [numHistory, setNumHistory] = useState<any>(null);
  const [numHistoryLoading, setNumHistoryLoading] = useState(false);

  // Fetch number history when detail opens
  useEffect(() => {
    if (numDetail?.numero != null) {
      setNumHistoryLoading(true);
      fetch(`/api/number-history?number=${numDetail.numero}&turno=${so}`)
        .then(r => r.json())
        .then(data => { setNumHistory(data); setNumHistoryLoading(false); })
        .catch(() => setNumHistoryLoading(false));
    } else {
      setNumHistory(null);
    }
  }, [numDetail, so]);
  const [newDraws, setNewDraws] = useState(false);
  const [lastDrawDate, setLastDrawDate] = useState("");
  const [misLoading, setMisLoading] = useState(false);
  const [primerVisita, setPrimerVisita] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [controlando, setControlando] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [apCalc, setApCalc] = useState(250);
  const [rdblCalc, setRdblCalc] = useState(1000);
  const [totalBet, setTotalBet] = useState(5000);
  const [analisisData, setAnalisisData] = useState<any>(null);
  const [analisisLoading, setAnalisisLoading] = useState(false);
  const [resultadoControl, setResultadoControl] = useState<any>(null);
  const [aiInsight, setAiInsight] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [confianzaTurnos, setConfianzaTurnos] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("confianzaTurnos") || "{}"); } catch { return {}; }
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [userRole, setUserRole] = useState<"free" | "premium" | "admin">("free");
  const [userId, setUserId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [premExpiry, setPremExpiry] = useState<{ premium_until: string | null; daysRemaining: number | null }>({ premium_until: null, daysRemaining: null });
  const [guestMode, setGuestMode] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { subscribed: pushSubscribed, supported: pushSupported, loading: pushLoading, toggle: togglePush } = usePushNotifications();

  useEffect(() => {
    localStorage.setItem("confianzaTurnos", JSON.stringify(confianzaTurnos));
  }, [confianzaTurnos]);

  const misSummary = useMemo(() => {
    const totalSaved = misPreds.length;
    const totalAciertos = misPreds.reduce((sum: any, p: any) => sum + (p.aciertos?.length || 0), 0);
    const totalWithHits = misPreds.filter((p: any) => p.aciertos?.length > 0).length;
    const totalWithResult = misPreds.filter((p: any) => p.resultado?.length).length;
    const successRate = totalSaved ? Math.round((totalWithHits / totalSaved) * 100) : 0;
    const avgHits = totalSaved ? Number((totalAciertos / totalSaved).toFixed(2)) : 0;
    const hitsByTurno = misPreds.reduce((acc: any, p: any) => {
      if (p.aciertos?.length) acc[p.turno] = (acc[p.turno] || 0) + 1;
      return acc;
    }, {});
    const bestTurno = Object.entries(hitsByTurno).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "—";
    const now = new Date();
    const thisWeek = misPreds.filter(p => {
      if (!p.fecha) return false;
      const d = new Date(p.fecha + "T00:00:00");
      const diff = (now.getTime() - d.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    });
    const thisWeekHits = thisWeek.filter(p => p.aciertos?.length > 0).length;
    const thisWeekRate = thisWeek.length ? Math.round((thisWeekHits / thisWeek.length) * 100) : 0;
    return { totalSaved, totalAciertos, totalWithHits, totalWithResult, successRate, avgHits, bestTurno, thisWeek: thisWeek.length, thisWeekHits, thisWeekRate };
  }, [misPreds]);

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall as any);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall as any);
    };
  }, []);

  useEffect(() => {
    if (tab === "mis" && tkRef.current) {
      cargarMisPreds(tkRef.current);
    }
  }, [tab]);

  async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
    setShowInstall(false);
  }

  const tkRef = useRef("");
  const isAdminRef = useRef(false);

  useEffect(() => {
    const auth = getAuth();
    if (isGuest() && !auth) {
      setGuestMode(true);
      return;
    }
    if (!auth) {
      window.location.href = "/login";
      return;
    }

    let email = auth.user?.email || "";
    if (!email) {
      try {
        const payload = JSON.parse(atob(auth.access_token.split(".")[1]));
        email = payload.email || "";
      } catch {}
    }

    const adminEmails = ["estudiowebpin@gmail.com"];
    const admin = adminEmails.includes(email.toLowerCase());
    isAdminRef.current = admin;

    tkRef.current = auth.access_token;
    setEm(email);

    if (admin) {
      setUserRole("admin");
      setPr(true);
    }

    fetch("/api/auth/me", { headers: { Authorization: "Bearer " + auth.access_token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.isPremium) setPr(true);
        if (d?.role) {
          setUserRole(isAdminRef.current ? "admin" : d.role as "free" | "premium" | "admin");
        }
        if (d?.userId) setUserId(d.userId);
        if (d?.premium_until) setPremExpiry({ premium_until: d.premium_until, daysRemaining: d.daysRemaining });
      })
      .catch(() => {});
    // Handle payment success/failure from Ualá redirect
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");
    if (paymentStatus === "success") {
      setTimeout(() => { toast("¡Pago acreditado! Tu acceso premium se activó automáticamente."); }, 1000);
      window.history.replaceState({}, "", "/predictions");
      // Poll for premium activation (webhook may take a few seconds)
      let attempts = 0;
      const pollPremium = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch("/api/payment-status", { headers: { Authorization: "Bearer " + auth.access_token } });
          const d = await r.json();
          if (d.isPremium) {
            setPr(true);
            if (d.premium_until) setPremExpiry({ premium_until: d.premium_until, daysRemaining: d.daysRemaining });
            clearInterval(pollPremium);
            toast("Premium activado. ¡Bienvenido!");
          } else if (attempts >= 6) {
            clearInterval(pollPremium);
            toast("Si tu pago fue acreditado, el acceso se activará en unos minutos. Refrescá la página si persiste.");
          }
        } catch {}
      }, 3000);
    } else if (paymentStatus === "failed") {
      setTimeout(() => { toast("El pago no se completó. Intentá de nuevo."); }, 1000);
      window.history.replaceState({}, "", "/predictions");
    }
    const savedLastDate = localStorage.getItem("quiniela-ia-ultimo-sorteo-visto");
    if (savedLastDate) setLastDrawDate(savedLastDate);
    cargarMisPreds(auth.access_token);
    setStats({ totalSorteos: "--", pct: "--", racha: "--", mensaje: "Presiona 'Generar Análisis' para comenzar" }); 
    setStatsLoading(false);
    const visited = localStorage.getItem("quiniela-ia-tour-visto");
    if (!visited) {
      setPrimerVisita(true);
      setShowHowItWorks(true);
      localStorage.setItem("quiniela-ia-tour-visto", "true");
    }
    const HORARIOS_POLL: Record<string, number> = { Previa: 10, Primera: 12, Matutina: 15, Vespertina: 18, Nocturna: 21 }
    const TURNOS_LIST = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

    const pollInterval = setInterval(async () => {
      const artNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
      const horaActual = artNow.getHours()
      const hoy = hoyArgentina()

      let turnoToCheck: string | null = null
      for (const t of TURNOS_LIST) {
        const horario = HORARIOS_POLL[t]
        if (horaActual >= horario && horaActual < horario + 2) {
          turnoToCheck = t
          break
        }
      }

      if (!turnoToCheck) {
        const sorted = TURNOS_LIST.map(t => ({ t, h: HORARIOS_POLL[t] }))
          turnoToCheck = sorted.find(s => s.h > horaActual)?.t || "Nocturna"
      }

      try {
        const r = await fetch(`/api/resultado?date=${hoy}&turno=${turnoToCheck}&t=${Date.now()}`)
        const d = await r.json()
        if (d?.found && d?.numbers?.length) {
          const latestKey = `${hoy}-${turnoToCheck.toLowerCase()}`
          setLastDrawDate(prev => {
            if (prev && prev !== latestKey) {
              setNewDraws(true)
              toast(`Nuevo sorteo ${turnoToCheck} cargado. Análisis actualizado.`, "success")
              setTimeout(() => gen(), 500)
            }
            return prev || latestKey
          })
          if (!lastDrawDate) localStorage.setItem("quiniela-ia-ultimo-sorteo-visto", latestKey)
        }
      } catch {}

      const tk = getAccessToken()
      if (tk) cargarMisPreds(tk)
    }, 60000)
    return () => clearInterval(pollInterval)
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let x = 0,
      aid = 0;
    const step = () => {
      x += 0.4;
      if (x >= el.scrollWidth / 2) x = 0;
      el.style.transform = `translateX(-${x}px)`;
      aid = requestAnimationFrame(step);
    };
    aid = requestAnimationFrame(step);
    return () => cancelAnimationFrame(aid);
  }, []);

  async function pedirNotificaciones() {
    if (!pushSupported) {
      toast("Tu navegador no soporta notificaciones push", "error");
      return;
    }
    await togglePush();
  }

function mostrarNotifResultado(turno: string, numeros: string[], aciertos: string[]) {
    if (aciertos && aciertos.length > 0) {
      sound.win();
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = aciertos && aciertos.length > 0
      ? "Coincidencia: " + aciertos.length + " número(s)! " + aciertos.join(", ") + " en " + turno
      : "Resultados del " + turno + " disponibles.";
    new Notification("Quiniela IA", { body, icon: "/icon-192.png" });
  }

  async function gen() {
    setLd(true);
    setEr("");
    setDn(false);
    setDt(null);
    try {
      const predDate = fechaSorteo(so);
      const hoy = hoyArgentina();
      const artNow = ahoraArgentina();
      const diaSemana = artNow.getDay();
      const esFeriadoHoy = esFeriado(hoy);
      const esDomingo = diaSemana === 0;
      const esSabadoPrevia = diaSemana === 6 && so === "Previa";
      const noHaySorteoHoy = esFeriadoHoy || esDomingo || esSabadoPrevia;

      if (noHaySorteoHoy && predDate === hoy) {
        const motivo = esFeriadoHoy ? "feriado" : esDomingo ? "domingo" : "sábado (no hay Previa)";
        setEr(`Hoy es ${motivo}, no hay sorteo ${so.toLowerCase()}. Elegí otro turno o esperá al próximo sorteo.`);
        setLd(false);
        return;
      }

      const url = "/api/predictions?sorteo=" + encodeURIComponent(so) + "&date=" + predDate + "&t=" + Date.now();
      const r = await fetch(url, {
        headers: { Authorization: "Bearer " + tkRef.current },
      });
      if (!r.ok) {
        throw new Error("Error del servidor: " + r.status);
      }
      const d = await r.json();
      if (!d) {
        throw new Error("No hay datos");
      }
      if (d.error) {
        throw new Error(d.error);
      }
      const predData = d.pred || d;
      setDt({ ...predData, heatmap: d.heatmap, ranking: d.numeros });
      setDn(true);
      sound.success();
      // Gamification: record analysis + community trend
      if (tkRef.current) {
        fetch("/api/gamification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + tkRef.current },
          body: JSON.stringify({ action: "analysis", turno: so }),
        }).then(() => { window.dispatchEvent(new Event("gamification-update")) }).catch(() => {})
        fetch("/api/community", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turno: so,
            topNumbers: (d.numeros || []).slice(0, 10).map((n: any) => n.num || n.numero),
          }),
        }).catch(() => {})
      }
      if (d.confidence) setConfianzaTurnos(p => ({ ...p, [so]: d.confidence }));
      if (d.aiInsight) setAiInsight(d.aiInsight);
    } catch (e: any) {
      setEr(e?.message || String(e));
    } finally {
      setLd(false);
    }
  }

  function logout() {
    clearAuth();
    window.location.href = "/login";
  }

  // Horarios de cada sorteo (hora Argentina, el sorteo ya pasó si la hora actual >= cutoff)
  const HORARIOS_SORTEOS: Record<string, number> = {
    Previa: 10, Primera: 12, Matutina: 15, Vespertina: 18, Nocturna: 21
  }

  function ahoraArgentina(): Date {
    const now = new Date()
    return new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
  }

  function hoyArgentina(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
  }

  function proximoSorteo(sorteo: string): string {
    const fs = fechaSorteo(sorteo)
    const d = new Date(fs + "T12:00:00-03:00")
    const label = d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
    return sorteo + " del " + label;
  }

  function diaSemanaART(d: Date): number {
    return d.getDay()
  }

  function nextValidDate(sorteo: string): string {
    const artNow = ahoraArgentina()
    const feriados = todosLosFeriados()
    for (let i = 1; i <= 7; i++) {
      const d = new Date(artNow.getTime() + i * 86400000);
      const dia = diaSemanaART(d);
      const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
      if (dia === 0) continue;
      if (sorteo === "Previa" && dia === 6) continue;
      if (feriados.includes(fecha)) continue;
      return fecha
    }
    return hoyArgentina()
  }

  function fechaSorteo(sorteo: string): string {
    const ahora = ahoraArgentina()
    const horaActual = ahora.getHours()
    const diaActual = ahora.getDay()
    const fechaActual = hoyArgentina()
    const feriados = todosLosFeriados()
    
    // Check if the draw for today has already passed
    const horarioSorteo = HORARIOS_SORTEOS[sorteo] || 12
    if (horaActual >= horarioSorteo) {
      // Draw already happened today -> predict for next valid day
      return nextValidDate(sorteo)
    }
    
    // Check holidays, weekends
    if (feriados.includes(fechaActual)) return nextValidDate(sorteo)
    if (diaActual === 0) return nextValidDate(sorteo)
    if (sorteo === "Previa" && diaActual === 6) return nextValidDate(sorteo)
    
    return fechaActual
  }

  async function cargarMisPreds(token: string) {
    setMisLoading(true);
    let apiPreds: any[] | null = null;
    if (token) {
      try {
        const r = await fetch("/api/mis-predicciones", { headers: { Authorization: "Bearer " + token } });
        const d = await r.json();
        if (d.predictions?.length) apiPreds = d.predictions;
      } catch {}
    }

    // Merge 3/4 cifras from localStorage into API predictions
    let storedPreds: any[] = [];
    try { const s = localStorage.getItem("misPreds"); if (s) storedPreds = JSON.parse(s); } catch {}
    const localMap = new Map(storedPreds.map((p: any) => [(p.date || p.fecha) + "|" + (p.turno || ""), p]))

    if (apiPreds) {
      for (const p of apiPreds) {
        const key = (p.date || p.fecha || "") + "|" + (p.turno || "")
        const local = localMap.get(key)
        // Extract 2-cifras from numeros (handles both flat array and structured object)
        if (Array.isArray(p.numeros)) {
          // flat array from free user — already correct
        } else if (p.numeros?.["2"]) {
          // structured object from premium — API already extracted pred2/3/4 into numeros/numeros_3/numeros_4
        }
        if (local) {
          if (!p.numeros_3?.length && local.numeros_3) p.numeros_3 = local.numeros_3
          if (!p.numeros_4?.length && local.numeros_4) p.numeros_4 = local.numeros_4
        }
      }
      const prevAciertos = misPreds.reduce((sum: number, p: any) => sum + (p.aciertos?.length || 0), 0)
      const newAciertos = apiPreds.reduce((sum: number, p: any) => sum + (p.aciertos?.length || 0), 0)
      if (newAciertos > prevAciertos) {
        const diff = newAciertos - prevAciertos
        toast(`¡${diff} nuevo${diff > 1 ? "s" : ""} acierto${diff > 1 ? "s" : ""} detectado${diff > 1 ? "s" : ""}!`, "success")
        sound.win();
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
      setMisPreds(apiPreds)
      localStorage.setItem("misPreds", JSON.stringify(apiPreds))
      setMisLoading(false)
      return
    }

    // Fallback: localStorage + client-side comparison
    if (storedPreds.length > 0) {
      const enriched = await Promise.all(storedPreds.map(async (p: any) => {
        if (p.resultado && p.resultado.length > 0) return p
        const fechaVal = (p.date || p.fecha || "").trim()
        const turnoVal = (p.turno || "").trim()
        if (!fechaVal || !turnoVal) return p
        try {
          const r = await fetch(`/api/resultado?date=${fechaVal}&turno=${encodeURIComponent(turnoVal)}`)
          const draw = await r.json()
          if (draw?.found && draw?.numbers?.length) {
            const reales = draw.numbers.map((n: any) => String(Number(n) % 100).padStart(2, "0"))
            const pred2 = Array.isArray(p.numeros) ? p.numeros : (p.numeros?.["2"] || [])
            const pred3 = !Array.isArray(p.numeros) ? (p.numeros?.["3"] || []) : (p.numeros_3 || [])
            const pred4 = !Array.isArray(p.numeros) ? (p.numeros?.["4"] || []) : (p.numeros_4 || [])
            const predichos = pred2.map((n: string) => String(n).padStart(2, "0"))
            const aciertos = predichos.filter((n: string) => reales.includes(n)).map((n: string) => ({ numero: n, puesto: reales.indexOf(n) + 1 }))
            return { ...p, numeros: pred2, numeros_3: pred3, numeros_4: pred4, resultado: reales, aciertos, acerto: aciertos.length > 0 }
          }
        } catch (e) { }
        return p
      }))
      setMisPreds(enriched)
      const newHits = enriched.filter((p: any) => p.acerto).length
      const prevHits = misPreds.filter((p: any) => p.acerto).length
      if (newHits > prevHits) {
        const diff = newHits - prevHits
        toast(`¡${diff} predicción${diff > 1 ? "es" : ""} acertada${diff > 1 ? "s" : ""}!`, "success")
      }
    } else {
      setMisPreds([]);
    }
    setMisLoading(false);
  }

  async function controlarJugada() {
    if (!dt?.numeros_2?.length) {
      return;
    }
    setControlando(true);
    setResultadoControl(null);
    try {
      const hoy = hoyArgentina();
      const r2 = await fetch(`/api/resultado?date=${hoy}&turno=${encodeURIComponent(so)}`);
      const drawData = await r2.json();
      if (!drawData?.found || !drawData?.numbers?.length) {
        setResultadoControl({
          error: `Todavia no hay resultado para ${so} del ${hoy}. Los resultados se cargan automaticamente hasta 30 min despues del sorteo.`,
        });
        return;
      }
      const reales = drawData.numbers.map((n: any) => String(Number(n) % 100).padStart(2, "0"));
      const predichos = cur.slice(0, 10).map((p: any) => p.numero);
      const aciertos = predichos.filter((n: string) => reales.includes(n)).map((n: string) => ({ numero: n, puesto: reales.indexOf(n) + 1 }));
      setResultadoControl({ aciertos, predichos, reales, fecha: hoy, turno: so });
      mostrarNotifResultado(so, reales, aciertos.map((a: any) => a.numero));
    } catch (e: any) {
      setResultadoControl({ error: "Error: " + e.message });
    }
    setControlando(false);
  }

  async function guardarPrediccion(silent = false) {
    if (guestMode) {
      toast("Creá una cuenta gratis para guardar tus análisis", "info");
      return;
    }
    if (!cur?.length) {
      return;
    }
    setGuardando(true);
    const fechaSorteoStr = fechaSorteo(so);
    const nums = cur.slice(0, 10).map((p: any) => p.numero);

    // Check if already saved locally for this turno
    const storedRaw = localStorage.getItem("misPreds");
    let todas = storedRaw ? JSON.parse(storedRaw) : [];
    const yaExiste = todas.some((p: any) => p.fecha === fechaSorteoStr && p.turno === so);
    if (yaExiste) {
      setGuardando(false);
      toast("Ya guardaste un análisis para este turno", "info");
      return;
    }

    const nums3Save = (pr || userRole === "admin") ? nums3.slice(0, 5) : [];
    const nums4Save = (pr || userRole === "admin") ? nums4.slice(0, 5) : [];

    const nuevaPred: any = {
      id: "local_" + Date.now(),
      fecha: fechaSorteoStr,
      turno: so,
      numeros: (pr || userRole === "admin") ? { "2": nums, "3": nums3Save, "4": nums4Save } : nums,
      created_at: new Date().toISOString(),
      resultado: null,
      aciertos: [],
      acerto: false,
    };
    if (pr || userRole === "admin") {
      nuevaPred.numeros_3 = nums3Save;
      nuevaPred.numeros_4 = nums4Save;
    }

    // Intentar guardar en Supabase
    let cloudSaved = false
    if (tkRef.current) {
      try {
        const res = await fetch("/api/mis-predicciones", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + tkRef.current },
          body: JSON.stringify({ date: fechaSorteoStr, turno: so, numeros: (pr || userRole === "admin") ? { "2": nums, "3": nums3Save, "4": nums4Save } : nums }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setGuardando(false);
          toast("Ya guardaste un análisis para este turno", "info");
          return;
        }
        if (res.ok) {
          cloudSaved = true
          // Gamification: record save
          fetch("/api/gamification", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + tkRef.current },
            body: JSON.stringify({ action: "save", turno: so }),
          }).then(() => { window.dispatchEvent(new Event("gamification-update")) }).catch(() => {})
        }
      } catch (e) {
      }
    }

    // Guardar siempre en localStorage si no existe
    todas = [nuevaPred, ...todas].slice(0, 30);
    localStorage.setItem("misPreds", JSON.stringify(todas));
    setMisPreds(todas);

    if (!silent) {
      setGuardadoOk(true);
      sound.coin();
      setTimeout(() => setGuardadoOk(false), 3000);
    }
    setGuardando(false);
  }

  function copiar() {
    if (!dt?.numeros_2?.length) {
      return;
    }
    const lineas = cur.slice(0, 10).map((p: any, i: number) => "#" + (i + 1) + " " + p.numero + " - " + p.significado).join("\n");
    const rdblLine = dt?.redoblona ? "\nRedoblona: " + dt.redoblona : "";
    const txt = "QUINIELA IA ANÁLISIS - " + proximoSorteo(so) + "\n\n" + lineas + rdblLine + "\n\n" + APP_URL;
    navigator.clipboard
      .writeText(txt)
      .then(() => toast("Copiado al portapapeles", "success"))
      .catch(() => {
        const el = document.createElement("textarea");
        el.value = txt;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        toast("Copiado al portapapeles", "success");
      });
  }

  function share(p: string) {
    const txt = encodeURIComponent("Probá Quiniela IA - Análisis estadístico basado en datos reales");
    const url = encodeURIComponent(APP_URL);
    if (p === "copy") {
      navigator.clipboard.writeText(APP_URL).then(() => toast("Link copiado al portapapeles", "success"));
      return;
    }
    const urls: any = {
      whatsapp: `https://wa.me/?text=${txt}%20${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?text=${txt}&url=${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${txt}`,
    };
    window.open(urls[p], "_blank");
  }

  // Preparar datos para mostrar según dígito seleccionado
  const nums2 = dt?.numeros_2 || [];
  const nums3 = dt?.numeros_3 || [];
  const nums4 = dt?.numeros_4 || [];
  const rdbl = dt?.redoblona || "";
  const rankingData = dt?.ranking || dt?.numeros || [];
  const ranking = rankingData;

  // Para mostrar en la cuadrícula con significado (usa datos del API)
  const cur =
    dg === 2
      ? nums2.map((n, idx) => ({ numero: n, significado: rankingData.find((r: any) => r.numero === n)?.significado || "" }))
      : dg === 3
      ? nums3.map((n, idx) => ({ numero: n, significado: rankingData.find((r: any) => r.numero === n)?.significado || "" }))
      : nums4.map((n, idx) => ({ numero: n, significado: "" }));

  return (
    <>
      <AgeGate />
      <NeonBackground intensity={settings.particlesEnabled ? "low" : "off"} />
      <GlowOrbs />
      <ConfettiEffect active={showConfetti} />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        :root{--red:#FE2C55;--cyan:#25F4EE;--green:#22c55e;--bg:#010101;--bg2:#0d0d0d;--bg3:#141b2f;--card:#0d0d0d;--surface:rgba(13,13,13,.9);--text:#FFFFFF;--dim:#94a3b8;--border:rgba(255,255,255,.08);--nav-bg:rgba(6,8,15,.98);--panel-bg:rgba(255,255,255,.04);--panel-border:rgba(255,255,255,.08);--shadow:rgba(0,0,0,.32)}
        body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:hidden}
        .app{min-height:100vh;background:radial-gradient(ellipse 100% 80% at 50% -10%,rgba(99,102,241,.15),transparent 60%),radial-gradient(ellipse 60% 40% at 20% 80%,rgba(236,72,153,.1),transparent 50%),var(--bg)}
        .nav{position:sticky;top:0;z-index:100;background:rgba(15,15,25,.85);backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,255,255,.08);padding:10px 18px;display:flex;align-items:center;justify-content:space-between}
        .card-bg{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:24px}
        .nl{display:flex;align-items:center;gap:10px;cursor:pointer}
        .ni{width:40px;height:40px;background:linear-gradient(145deg,#ff3366,#ec4899);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 0 #be123c,0 8px 20px rgba(236,72,153,.4)}
        .nm{font-size:20px;font-weight:900;background:linear-gradient(135deg,#f472b6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .nr{display:flex;align-items:center;gap:8px}
        .pp{background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;font-size:9px;font-weight:800;padding:4px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(168,85,247,.4)}
        .ne{font-size:12px;color:var(--dim);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .nav-admin{padding:6px 12px;border-radius:10px;border:1px solid rgba(236,72,153,.4);background:rgba(236,72,153,.1);color:#f472b6;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none}
        .nav-out{padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);font-size:12px;cursor:pointer;font-family:inherit}
        .wr{max-width:520px;margin:0 auto;padding:16px 16px 80px}
        .hero{text-align:center;padding:12px 0 20px}
        .hero h1{font-size:clamp(34px,9vw,60px);font-weight:900;background:linear-gradient(180deg,#fff 0%,#f472b6 50%,#ec4899 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;padding:0;margin-bottom:8px;line-height:1.05;letter-spacing:-1px;filter:drop-shadow(0 4px 20px rgba(236,72,153,.3))}
        .hero p{color:#94a3b8;font-size:14px;max-width:380px;margin:0 auto 16px;line-height:1.5;font-weight:500}
        .sts{display:flex;gap:12px;justify-content:center}
        .sc{background:linear-gradient(180deg,rgba(99,102,241,.15),rgba(99,102,241,.05));border:1px solid rgba(99,102,241,.3);border-radius:20px;padding:18px 24px;text-align:center;color:var(--text);box-shadow:0 6px 0 rgba(0,0,0,.4),0 8px 24px rgba(99,102,241,.2);transition:.2s}
        .sc:hover{transform:translateY(-3px);box-shadow:0 10px 0 rgba(0,0,0,.4),0 12px 32px rgba(99,102,241,.3)}
        .sv{font-size:26px;font-weight:900;background:linear-gradient(180deg,#a855f7,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .sl{font-size:11px;color:#a5b4fc;margin-top:6px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
        .sorteo-label{font-size:12px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:3px;margin-bottom:10px;text-align:center}
        .sorteo-btns{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}
        .sb{padding:18px 8px 16px;border-radius:20px;background:linear-gradient(180deg,#1e1e3a,#0f0f1f);color:#94a3b8;border:2px solid rgba(255,255,255,.1);box-shadow:0 8px 0 #050510,0 10px 28px rgba(0,0,0,.6);cursor:pointer;font-family:'Inter',sans-serif;font-weight:900;font-size:14px;text-align:center;transition:.15s;display:flex;flex-direction:column;align-items:center;gap:8px;user-select:none;letter-spacing:.5px}
        .sb .sh{font-size:12px;font-weight:700;opacity:.9;color:#64748b}
        .sb:active{transform:translateY(6px);box-shadow:none}
        .sb.on{background:linear-gradient(180deg,#a855f7,#8b5cf6);color:#fff;border-color:rgba(167,139,250,.95);box-shadow:0 8px 0 #5b21b6,0 12px 36px rgba(139,92,246,.5);font-size:15px}
        .sb.on .sh{opacity:1;color:#fff;font-weight:800;font-size:13px}
        .sb .sc{font-size:11px;font-weight:800;color:#a78bfa;background:rgba(167,139,250,.12);padding:2px 8px;border-radius:10px;min-width:36px;margin-top:-2px}
        .sb.on .sc{color:#fff;background:rgba(255,255,255,.18)}
        .sb:hover:not(.on){background:linear-gradient(180deg,#2d2b4a,#1e1e3a);color:#a855f7;border-color:rgba(167,139,250,.4);transform:translateY(-2px)}
        .btn3d{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;border:none;border-radius:20px;font-family:'Inter',sans-serif;font-weight:900;cursor:pointer;transition:all .15s;user-select:none;-webkit-tap-highlight-color:transparent;width:100%;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px}
        .btn3d:active{transform:translateY(6px)!important;box-shadow:none!important;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .btn-gen{padding:24px 32px;font-size:20px;letter-spacing:1px;background:linear-gradient(180deg,#f472b6,#ec4899);color:#fff;box-shadow:0 10px 0 #be185d,0 14px 40px rgba(236,72,153,.5),inset 0 2px 0 rgba(255,255,255,.3),inset 0 -2px 0 rgba(0,0,0,.15)}
        .btn-gen:hover{background:linear-gradient(180deg,#fb7185,#f43f5e);transform:translateY(-3px);box-shadow:0 14px 0 #be185d,0 18px 50px rgba(236,72,153,.6)}
        .btn-prem{padding:18px 28px;font-size:15px;background:linear-gradient(180deg,#a855f7,#8b5cf6);color:#fff;box-shadow:0 8px 0 #6d28d9,0 12px 36px rgba(139,92,246,.5),inset 0 1px 0 rgba(255,255,255,.3)}
        .btn-copy{padding:16px 28px;font-size:14px;background:linear-gradient(180deg,#4f46e5,#3730a3);color:#fff;border:2px solid rgba(129,140,248,.4);box-shadow:0 8px 0 #1e1b4b,0 12px 32px rgba(79,70,229,.4),inset 0 1px 0 rgba(255,255,255,.15)}
        .btn-save{padding:16px 28px;font-size:14px;background:linear-gradient(180deg,#10b981,#059669);color:#fff;border:2px solid rgba(52,211,153,.4);box-shadow:0 8px 0 #047857,0 12px 36px rgba(16,185,129,.4),inset 0 1px 0 rgba(255,255,255,.25)}
        .dtabs{display:flex;gap:10px;margin-bottom:12px}
        .dk{flex:1;padding:16px 8px;text-align:center;border-radius:16px;font-family:'Inter',sans-serif;font-weight:900;font-size:14px;cursor:pointer;position:relative;transition:.12s;user-select:none;border:none;box-shadow:0 6px 0 rgba(0,0,0,.5)}
        .dk:active{transform:translateY(5px);box-shadow:none}
        .dk-2{background:linear-gradient(180deg,#ec4899,#db2777);color:#fff;box-shadow:0 6px 0 #9d174d}
        .dk-3{background:linear-gradient(180deg,#22d3ee,#06b6d4);color:#042f3d;box-shadow:0 6px 0 #0e7490}
        .dk-4{background:linear-gradient(180deg,#fbbf24,#f59e0b);color:#451a03;box-shadow:0 6px 0 #b45309}
        .dk.on{filter:brightness(1.1);box-shadow:0 3px 0 rgba(0,0,0,.5)}
        .dk:not(.on){opacity:.5}
        .pbdg{position:absolute;top:-10px;right:4px;background:#fff;color:#1e1b4b;font-size:8px;font-weight:900;padding:3px 8px;border-radius:10px}
        .g5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
        .cd{background:linear-gradient(180deg,#1e1e3a,#0f0f1f);border:2px solid rgba(255,255,255,.1);border-radius:24px;padding:22px 6px 18px;text-align:center;position:relative;box-shadow:0 10px 0 rgba(0,0,0,.5),0 14px 36px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.08);transition:.2s;cursor:default}
        .cd:hover{transform:translateY(-6px);border-color:rgba(167,139,250,.6);box-shadow:0 16px 0 rgba(0,0,0,.5),0 20px 48px rgba(139,92,246,.3),inset 0 1px 0 rgba(255,255,255,.12)}
        .cr2{position:absolute;top:8px;left:8px;font-size:11px;color:var(--dim);font-weight:900}
        .ce{font-size:24px;margin-bottom:2px}
        .cn{font-size:clamp(24px,6vw,36px);font-weight:900;background:linear-gradient(180deg,#a855f7,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:4px;letter-spacing:-1px;text-shadow:0 4px 12px rgba(139,92,246,.4)}
        .cs{font-size:10px;color:#c4b5fd;font-weight:700;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.4px}
        .lk{position:relative}
        .lo{position:absolute;inset:0;background:#0a0a0f;backdrop-filter:none;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px 14px;text-align:center;border-radius:12px;border:2px solid rgba(167,139,250,.4)}
        .lo h3{font-size:15px;color:var(--text);font-weight:700}
        .lo p{font-size:11px;color:var(--dim);max-width:200px;line-height:1.5}
        .uc{display:inline-block;background:linear-gradient(135deg,#20d5ec,#00a8c8);color:#001a20;border-radius:10px;padding:9px 16px;font-size:12px;font-weight:800;text-decoration:none;margin-bottom:4px}
        .tbs{display:flex;gap:5px;margin-bottom:12px;overflow-x:auto;padding-bottom:2px}
        .tb{flex:1;min-width:72px;padding:11px 4px;text-align:center;border-radius:12px;border:none;font-family:'Inter',sans-serif;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap;transition:.1s;user-select:none;display:flex;flex-direction:column;align-items:center;gap:3px;box-shadow:0 4px 0 rgba(0,0,0,.4)}
        .tb:active{transform:translateY(3px);box-shadow:none}
        .tb-pred{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
        .tb-pred.on{background:linear-gradient(180deg,#FE2C55,#cc0030);color:#fff;border-color:#FE2C55;box-shadow:0 4px 0 #800020}
        .tb-rdbl{background:linear-gradient(180deg,#1e1e2e,#12121e);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
        .tb-rdbl.on{background:linear-gradient(180deg,#25F4EE,#00c0b8);color:#000;border-color:#25F4EE;box-shadow:0 4px 0 #007070}
        .tb-freq{background:linear-gradient(180deg,#1e1e3a,#12121f);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
        .tb-freq.on{background:linear-gradient(180deg,#a855f7,#7c3aed);color:#fff;border-color:#a855f7;box-shadow:0 6px 0 #5b21b6}
        .tb-trend{background:linear-gradient(180deg,#1e1e3a,#12121f);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
        .tb-trend.on{background:linear-gradient(180deg,#f59e0b,#d97706);color:#1a0e00;border-color:#f59e0b;box-shadow:0 6px 0 #b45309}
        .tb-mis{background:linear-gradient(180deg,#1e1e3a,#12121f);color:#64748b;border:1.5px solid rgba(255,255,255,.08)}
        .tb-mis.on{background:linear-gradient(180deg,#10b981,#059669);color:#fff;border-color:#10b981;box-shadow:0 6px 0 #047857}
        .tb .tb-ico{font-size:18px}
        .tb .tb-lbl{font-size:11px}
        .ibox{background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.15);border-radius:16px;padding:14px 16px;font-size:13px;color:#a5b4fc;line-height:1.7;margin-top:10px}
        .ibox strong{color:#c4b5fd}
        .rdbl{background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.2);border-radius:20px;padding:16px;margin-bottom:12px}
        .heatmap-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}
        .heatmap-cell{aspect-ratio:1;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s}
        .heatmap-cell:hover{transform:scale(1.15);z-index:10}
        .hm-num{font-size:10px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9)}
        .rpair{font-size:42px;font-weight:900;background:linear-gradient(135deg,#22d3ee,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-align:center;letter-spacing:10px;margin:14px 0}
        .rg{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px}
        .rc{background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);border-radius:14px;padding:14px 6px;text-align:center;transition:.15s}
        .rc:hover{border-color:rgba(139,92,246,.5);transform:translateY(-3px)}
        .rn{font-size:26px;font-weight:900;color:#a855f7}
        .rk{font-size:9px;color:#a855f7;opacity:.8;margin-top:4px}
        .rv{font-size:9px;color:var(--dim);margin-top:4px}
        .trend-chart{background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:20px;padding:16px;margin-bottom:12px}
        .trend-info{padding:12px;margin-bottom:12px}
        .trend-info-title{font-size:16px;font-weight:800;color:#fbbf24;margin-bottom:6px}
        .trend-info-desc{font-size:12px;color:#94a3b8}
        .trend-bars{display:flex;flex-direction:column;gap:10px;margin:18px 0}
        .trend-bar-row{display:flex;align-items:center;gap:10px}
        .trend-bar-label{font-size:14px;font-weight:900;color:#fff;width:36px}
        .trend-bar-track{flex:1;height:22px;background:rgba(255,255,255,.08);border-radius:11px;overflow:hidden}
        .trend-bar-fill{height:100%;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:9px;transition:width .3s}
        .trend-bar-value{font-size:11px;color:#f59e0b;width:48px;text-align:right}
        .trend-bar-meaning{font-size:10px;color:#64748b;width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .trend-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
        .trend-stat-card{background:rgba(0,0,0,.2);border-radius:10px;padding:12px 8px;text-align:center}
        .trend-stat-value{font-size:14px;font-weight:900;color:#fff;margin-bottom:4px}
        .trend-stat-label{font-size:10px;color:#64748b}
        .trend-metric{background:rgba(245,158,11,.1);border-radius:12px;padding:14px;text-align:center;margin-top:10px}
        .trend-metric-title{font-size:12px;color:#f59e0b;font-weight:700;margin-bottom:6px}
        .trend-metric-value{font-size:24px;font-weight:900;color:#fff;margin-bottom:4px}
        .trend-metric-desc{font-size:10px;color:#64748b}
        .cabeza-badge{position:absolute;top:4px;right:4px;background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a0e00;font-size:7px;font-weight:900;padding:2px 6px;border-radius:8px;letter-spacing:.5px}
        .acum-badge{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);background:rgba(34,197,94,.9);color:#fff;font-size:7px;font-weight:800;padding:1px 5px;border-radius:6px}
        .heatmap-stats{background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:10px;margin-top:8px;text-align:center}
        .heatmap-stat-row{display:flex;justify-content:space-between;font-size:11px;margin:4px 0}
        .heatmap-stat-label{color:#94a3b8}
        .heatmap-stat-value{color:#22c55e;font-weight:800}
        .tips{background:rgba(255,45,85,.04);border:1px solid rgba(255,45,85,.15);border-radius:14px;padding:12px;margin-bottom:12px}
        .tips-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
        .tip-box{border-radius:10px;padding:10px 6px;border:1px solid}
        .tip-n{padding:2px 5px;border-radius:4px;font-size:10px;font-weight:800}
        .shr{margin-top:16px;padding:14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:14px;text-align:center}
        .shr-t{font-size:12px;font-weight:700;color:var(--t);margin-bottom:8px}
        .shr-b{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
        .sbt{padding:8px 14px;border:none;border-radius:9px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 3px 0 rgba(0,0,0,.4);transition:.08s;user-select:none}
        .sbt:active{transform:translateY(2px);box-shadow:none}
        .sbt.wa{background:#25D366;color:#fff}.sbt.fb{background:#1877F2;color:#fff}.sbt.tw{background:#000;color:#fff}.sbt.tg{background:#0088cc;color:#fff}.sbt.cp{background:rgba(255,255,255,.08);color:var(--t);border:1px solid rgba(255,255,255,.1)}
        .rev{margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.06)}
        .rev-o{overflow:hidden;position:relative}
        .rev-o::before,.rev-o::after{content:'';position:absolute;top:0;bottom:0;width:50px;z-index:2;pointer-events:none}
        .rev-o::before{left:0;background:linear-gradient(to right,var(--dark),transparent)}
        .rev-o::after{right:0;background:linear-gradient(to left,var(--dark),transparent)}
        .rev-tr{display:flex;gap:10px;width:max-content}
        .rev-c{width:240px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;flex-shrink:0}
        .rev-s{color:#ff2d55;font-size:11px;margin-bottom:5px}
        .rev-t{font-size:11px;color:var(--t);font-style:italic;line-height:1.5;margin-bottom:5px}
        .rev-a{font-size:10px;color:var(--dim)}
        .rev-a strong{color:var(--t)}
        .pay-box{margin-top:16px;background:linear-gradient(135deg,rgba(37,244,238,.05),rgba(0,192,184,.03));border:1.5px solid rgba(37,244,238,.2);border-radius:18px;padding:20px 18px;text-align:center;box-shadow:0 8px 32px rgba(32,213,236,.08)}
        .pay-title{font-size:22px;font-weight:900;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px}
        .pay-price{font-size:42px;font-weight:900;color:#f59e0b;text-shadow:0 4px 0 #b45309,0 6px 12px rgba(245,158,11,.4);margin-bottom:16px;transform:rotate(-2deg);display:inline-block}
        .pay-price-outer{position:relative;display:inline-block}
        .pay-price-outer::before{content:'';position:absolute;inset:-4px;border:3px solid #f59e0b;border-radius:16px;transform:rotate(2deg)}
        .pay-alias{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;font-size:20px;font-weight:800;color:#fff;letter-spacing:1px;padding:16px 28px;margin-bottom:12px;box-shadow:0 6px 20px rgba(99,102,241,.4),inset 0 1px 0 rgba(255,255,255,.2);cursor:pointer;transition:transform .1s}
        .pay-alias:active{transform:scale(.98)}
        .pay-features{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
        .pay-feature{font-size:13px;color:var(--text)}
        .pay-feature span{margin-right:8px}
        .pay-cta{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;background:#25D366;color:#fff;border-radius:12px;font-size:14px;font-weight:700}
        .ft{margin-top:16px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);text-align:center}
        .ft p{font-size:10px;color:var(--dim);line-height:1.5}
        .ft a{color:#ff6b81;text-decoration:none}
        .credit{font-size:9px;color:#475569;margin-top:4px;letter-spacing:.3px}
        .credit strong{color:#64748b}
        .dc{margin-top:4px;font-size:9px;color:#374151;line-height:1.5;text-align:center}
        .calc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}
        .calc-card{border-radius:12px;padding:12px 10px;text-align:center}
        .calc-card-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
        .calc-card-v{font-size:16px;font-weight:900;margin-bottom:3px}
        .calc-card-s{font-size:9px;opacity:.7;line-height:1.5}
        .sp{width:26px;height:26px;border:2px solid rgba(255,255,255,.1);border-top-color:#ff2d55;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%{opacity:1}50%{opacity:.5}100%{opacity:1}}
        .ld-box{text-align:center;padding:40px 20px;color:var(--dim);font-size:13px}
        .eb{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);border-radius:8px;padding:10px 12px;font-size:12px;color:#fca5a5;margin-bottom:12px}
        .ht{font-size:12px;color:var(--dim);text-align:center;padding:24px 0;line-height:2}
        .ht strong{color:#ff6b81}
        .sec{font-size:11px;font-weight:800;color:var(--dim);text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 10px;display:flex;align-items:center;gap:8px}
        .sec::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.05)}
        .saved-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:16px}
        .saved-summary-card{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:4px;box-shadow:0 12px 30px rgba(0,0,0,.05)}
        .saved-summary-label{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--dim);font-weight:800}
        .saved-summary-value{font-size:24px;font-weight:900;color:var(--text)}
        .saved-card{background:var(--surface);border:1.5px solid var(--panel-border);border-radius:16px;padding:16px;margin-bottom:14px;position:relative;transition:transform .2s,box-shadow .2s}
        .saved-card:hover{transform:translateY(-2px);box-shadow:0 14px 28px rgba(0,0,0,.08)}
        .saved-card-success{background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(34,197,94,.05));border-color:rgba(34,197,94,.35);box-shadow:0 8px 24px rgba(34,197,94,.12)}
        .saved-card-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
        .saved-card-title{font-size:13px;font-weight:800;color:var(--text)}
        .saved-card-status{font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px}
        .saved-card-status.hit{color:#166534;background:rgba(34,197,94,.18);border:1px solid rgba(34,197,94,.25)}
        .saved-card-status.miss{color:#475569;background:rgba(255,255,255,.08);border:1px solid rgba(148,163,184,.2)}
        .saved-numbers{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
        .saved-number{padding:6px 10px;border-radius:10px;font-size:11px;font-weight:800;background:rgba(255,255,255,.08);color:var(--dim);border:1px solid rgba(255,255,255,.1)}
        .saved-number.hit{background:rgba(34,197,94,.22);color:#155e75;border:1.5px solid rgba(34,197,94,.35);box-shadow:0 2px 8px rgba(34,197,94,.1)}
        .saved-results{font-size:11px;color:#15803d;font-weight:700;padding:12px 14px;background:rgba(34,197,94,.08);border-radius:12px;border:1px solid rgba(34,197,94,.16);line-height:1.6}
        .saved-success-icon{position:absolute;top:14px;right:14px;font-size:18px}
        @media(max-width:600px){.saved-summary{grid-template-columns:repeat(2,minmax(120px,1fr))}}
        @media(max-width:400px){.g5{grid-template-columns:repeat(5,1fr);gap:4px}.cd{padding:6px 2px 4px;min-height:70px}.tips-grid{grid-template-columns:1fr}.cd .cn{font-size:18px}.cd .cs{font-size:8px}.cd .cr2{font-size:8px}.cd .ce{font-size:16px}.sts{grid-template-columns:repeat(2,1fr);gap:8px}.sv{font-size:18px!important;padding:6px!important}.sl{font-size:8px}.header h1{font-size:20px}.header p{font-size:10px}.tbs{gap:3px}.tb{min-width:60px;padding:8px 2px;font-size:9px}.tabs{flex-direction:column}.dk{font-size:11px;padding:8px 4px}}
      `}</style>
      <div className="app">
        <nav className="nav">
          <div className="nl" onClick={() => window.scrollTo(0, 0)}>
            <div className="ni">📊</div>
            <span className="nm">Quiniela IA</span>
          </div>
          <div className="nr">
            {newDraws && <span style={{ background: "#22c55e", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, animation: "pulse 2s infinite" }}>🆕 Resultados nuevos</span>}
            {!isOnline && <span style={{ background: "#ef4444", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>📴 Offline</span>}
            {(pr || userRole === "admin") && <span className="pp">{userRole === "admin" ? "👑 ADMIN" : "⭐ PREMIUM"}</span>}
            {!guestMode && <GamificationBadge compact />}
            {em && <span className="ne">{em.split("@")[0]}</span>}
            {userRole === "admin" && <a href="/admin" className="nav-admin">⚙️ Admin</a>}
            <button
              onClick={pedirNotificaciones}
              disabled={pushLoading}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                border: pushSubscribed ? "1px solid rgba(34,197,94,.5)" : "1px solid rgba(37,244,238,.2)",
                background: pushSubscribed ? "rgba(34,197,94,.15)" : "transparent",
                color: pushSubscribed ? "#4ade80" : "#25F4EE",
                fontSize: 11,
                cursor: pushLoading ? "wait" : "pointer",
                fontFamily: "inherit",
                opacity: pushSupported ? 1 : 0.4,
              }}
              title={pushSubscribed ? "Notificaciones activadas" : "Tocar para activar notificaciones push"}
            >
              {pushLoading ? "⏳" : pushSubscribed ? "🔔✅" : pushSupported ? "🔔" : "🔕"}
            </button>
            {showInstall && (
              <button onClick={installApp} style={{ padding: "6px 12px", borderRadius: 8, background: "linear-gradient(135deg,#ff3366,#ff6b81)", color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", boxShadow: "0 4px 12px rgba(255,51,102,.4)" }}>
                📲 Instalar App
              </button>
            )}
            <button className="nav-out" onClick={logout}>
              Salir
            </button>
          </div>
        </nav>
        {pr && premExpiry.daysRemaining !== null && premExpiry.daysRemaining <= 7 && (
          <div style={{
            margin: "8px 12px 0", padding: "10px 14px", borderRadius: 12,
            background: premExpiry.daysRemaining === 0
              ? "linear-gradient(135deg,rgba(239,68,68,.15),rgba(239,68,68,.05))"
              : "linear-gradient(135deg,rgba(250,204,21,.12),rgba(250,204,21,.04))",
            border: premExpiry.daysRemaining === 0
              ? "1.5px solid rgba(239,68,68,.35)"
              : "1.5px solid rgba(250,204,21,.3)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{premExpiry.daysRemaining === 0 ? "⏰" : "⚠️"}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  {premExpiry.daysRemaining === 0
                    ? "Tu suscripción Premium ha vencido"
                    : `Tu suscripción Premium vence en ${premExpiry.daysRemaining} día${premExpiry.daysRemaining === 1 ? "" : "s"}`}
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                  {premExpiry.daysRemaining === 0
                    ? "Renová ahora para seguir accediendo a análisis de 3 y 4 cifras."
                    : "Renová antes del vencimiento para mantener el acceso."}
                </div>
              </div>
            </div>
            <a href={WA} target="_blank" rel="noopener noreferrer"
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: premExpiry.daysRemaining === 0 ? "#ef4444" : "#eab308",
                color: premExpiry.daysRemaining === 0 ? "#fff" : "#000",
                textDecoration: "none", whiteSpace: "nowrap",
                boxShadow: premExpiry.daysRemaining === 0 ? "0 4px 12px rgba(239,68,68,.3)" : "0 4px 12px rgba(250,204,21,.3)"
              }}
            >
              {premExpiry.daysRemaining === 0 ? "Renovar ahora →" : "Renovar Premium →"}
            </a>
          </div>
        )}
        <div className="wr">
          <div className="hero">
            <h1>Quiniela IA <span onClick={() => setShowHowItWorks(true)} style={{cursor:"pointer",fontSize:14}}>ℹ️</span></h1>
                <p>Análisis estadístico con 30 factores + Machine Learning. Datos oficiales actualizados.</p>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 8, textAlign: "center" }}>🎯 Elegí el sorteo que querés analizar:</div>
          <div className="sorteo-btns">
            {SORTEOS.map((s) => (
              <button key={s} className={"sb" + (so === s ? " on" : "")} onClick={() => { sound.pop(); setSo(s); }}>
                <span>{s === "Vespertina" ? "Vesp" : s === "Primera" ? "1era" : s === "Matutina" ? "Mat" : s === "Nocturna" ? "Noct" : s}</span>
                <span className="sh">{HORAS[s]}</span>
                {confianzaTurnos[s] != null && <span className="sc">{confianzaTurnos[s]}%</span>}
              </button>
            ))}
          </div>
          <button className="btn3d btn-gen" onClick={() => { sound.whoosh(); gen(); }} disabled={ld} style={{ opacity: ld ? 0.6 : 1 }}>
            {ld ? "⏳ Analizando datos..." : "⚡ Generar Análisis Ahora"}
          </button>
          <div style={{ display: "grid", gap: 10, margin: "16px 0 18px" }}>
            <button
              onClick={() => {
                setTab("mis");
                cargarMisPreds(tkRef.current);
              }}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 13,
                border: "1.5px solid rgba(34,197,94,.5)",
                background: "linear-gradient(135deg,rgba(34,197,94,.18),rgba(34,197,94,.08))",
                color: "#15803d",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "'Inter',sans-serif",
                boxShadow: "0 6px 0 rgba(0,100,50,.25),0 8px 20px rgba(34,197,94,.2)",
                transition: ".12s",
              }}
            >
              📋 Mis Análisis
            </button>
            <button
              onClick={() => setShowCalc(!showCalc)}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 13,
                border: "1.5px solid rgba(180,83,9,.5)",
                background: "linear-gradient(135deg,rgba(180,83,9,.16),rgba(180,83,9,.06))",
                color: "#92400e",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "'Inter',sans-serif",
                boxShadow: "0 6px 0 rgba(120,53,15,.2),0 8px 20px rgba(180,83,9,.18)",
                transition: ".12s",
              }}
            >
              {showCalc ? "▲ Cerrar" : "📊 Datos Históricos"}
            </button>
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>🔔 Activa la campanita para recibir avisos de resultados y coincidencias.</div>
          </div>
          {showCalc && (
            <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: "rgba(139,92,246,.06)", border: "1px solid rgba(139,92,246,.15)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>📊 Tu precisión personal</div>
              {misSummary.totalSaved > 0 ? (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: "#a855f7" }}>{misSummary.successRate}%</span>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>coincidencias en {misSummary.totalSaved} análisis · {misSummary.totalAciertos} números coincidentes</span>
                  </div>
                  {misSummary.thisWeek > 0 && (
                    <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>Esta semana: {misSummary.thisWeek} análisis · {misSummary.thisWeekHits} con coincidencias ({misSummary.thisWeekRate}%)</div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--dim)" }}>Guardá análisis para ver tu precisión personal.</div>
              )}
            </div>
          )}
          {showCalc && backtestData && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#22c55e", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📈 Backtesting {so} (Walk-forward)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                <div style={{textAlign:"center",padding:"6px",background:"rgba(0,0,0,.2)",borderRadius:8}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#a855f7"}}>{backtestData.metrics_top_1?.hitAt1?.toFixed(1) || 0}%</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>Hit@1 (Cabeza)</div>
                </div>
                <div style={{textAlign:"center",padding:"6px",background:"rgba(0,0,0,.2)",borderRadius:8}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#6366f1"}}>{backtestData.metrics_top_5?.hitAt5?.toFixed(1) || 0}%</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>Hit@5 (Top 5)</div>
                </div>
                <div style={{textAlign:"center",padding:"6px",background:"rgba(0,0,0,.2)",borderRadius:8}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#ec4899"}}>{backtestData.metrics_top_10?.hitAt10?.toFixed(1) || 0}%</div>
                  <div style={{fontSize:9,color:"#94a3b8"}}>Hit@10 (Top 10)</div>
                </div>
              </div>
              <div style={{fontSize:9,color:"#64748b",marginTop:6,textAlign:"center"}}>
                {backtestData.metrics_top_10?.totalDraws || 0} sorteos · Promedio {backtestData.metrics_top_10?.avgHitsPerDraw || 0} coincidencias/sorteo
              </div>
            </div>
          )}
          {resultadoControl && (
            <div
              style={{
                background: resultadoControl.error
                  ? "rgba(239,68,68,.07)"
                  : resultadoControl.aciertos?.length > 0
                  ? "rgba(34,197,94,.08)"
                  : "rgba(255,255,255,.03)",
                border: "1.5px solid " + (resultadoControl.error ? "rgba(239,68,68,.2)" : resultadoControl.aciertos?.length > 0 ? "rgba(34,197,94,.3)" : "rgba(255,255,255,.08)"),
                borderRadius: 14,
                padding: "16px",
                marginBottom: 12,
              }}
            >
              {resultadoControl.error ? (
                <div style={{ fontSize: 13, color: "#fca5a5", textAlign: "center" }}>{resultadoControl.error}</div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: resultadoControl.aciertos?.length > 0 ? "#86efac" : "#94a3b8",
                      marginBottom: 10,
                      textAlign: "center",
                    }}
                  >
                    {resultadoControl.aciertos?.length > 0 ? "📊 Coincidencia: " + resultadoControl.aciertos.length + " número(s)" : "Sin coincidencias esta vez"}
                  </div>
                  {resultadoControl.aciertos?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 10 }}>
                      {resultadoControl.aciertos.map((a: any, i: number) => (
                        <div
                          key={i}
                          style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.4)", borderRadius: 10, padding: "6px 12px", textAlign: "center" }}
                        >
                          <div style={{ fontSize: 20, fontWeight: 900, color: "#86efac" }}>{a.numero}</div>
                          <div style={{ fontSize: 9, color: "#4ade80" }}>Puesto {a.puesto}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#475569", textAlign: "center" }}>
                    Sorteo: {resultadoControl.turno} del {resultadoControl.fecha}
                  </div>
                </>
              )}
            </div>
          )}
          {pr && premExpiry.premium_until && (
            <ExpiryBanner premiumUntil={premExpiry.premium_until} />
          )}
          {er && (
            <div className="eb" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span>Error: {er}</span>
              <button onClick={() => { setRetryCount(c => c + 1); gen(); }} style={{ padding: "8px 16px", borderRadius: 8, background: "#ff3366", color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>
                Reintentar
              </button>
            </div>
          )}
          {!dn && !ld && (
            <div className="ht">
              👆 Seleccioná el sorteo de arriba y apretá
              <br />
              <strong>⚡ Generar Análisis Ahora</strong>
              <br />
              <span style={{ fontSize: 11, color: "#475569" }}>Motor estadístico con datos reales actualizados</span>
            </div>
          )}
          {ld && (
            <div style={{padding:"16px 0"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
                {[1,2,3,4,5].map(i=>(
                  <div key={i} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:14,padding:14,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <div className="skeleton" style={{width:20,height:12,borderRadius:4}}/>
                    <div className="skeleton" style={{width:40,height:32,borderRadius:8}}/>
                    <div className="skeleton" style={{width:50,height:10,borderRadius:4}}/>
                    <div className="skeleton" style={{width:"80%",height:4,borderRadius:2}}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div className="sp" />
                <div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Analizando datos históricos...</div>
                <div style={{fontSize:10,color:"#475569"}}>15 motores · 30 factores · Monte Carlo</div>
              </div>
            </div>
          )}
          {dn && !ld && (
            <>
              <div
                style={{
                  background: "rgba(255,45,85,.06)",
                  border: "1px solid rgba(255,45,85,.18)",
                  borderRadius: 10,
                  padding: "9px 14px",
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, color: "#ff6b81", fontWeight: 700, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    Para: <span style={{ color: "#fff" }}>{proximoSorteo(so)}</span>
                  </div>
                </div>
                <button
                  onClick={copiar}
                  style={{
                    padding: "5px 12px",
                    background: "rgba(255,45,85,.1)",
                    border: "1px solid rgba(255,45,85,.25)",
                    borderRadius: 8,
                    color: "#ff6b81",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Copiar
                </button>
              </div>

              {guestMode && (
                <div style={{
                  background: "linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08))",
                  border: "1.5px solid rgba(99,102,241,.3)",
                  borderRadius: 14, padding: "12px 16px", marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 10
                }}>
                  <div style={{ fontSize: 20 }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#c4b5fd" }}>Modo invitado — Solo 2 cifras</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Creá una cuenta gratis para guardar análisis y ver historial</div>
                  </div>
                  <a href="/login" style={{
                    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: "#fff", fontSize: 11, fontWeight: 800, padding: "8px 14px",
                    borderRadius: 10, textDecoration: "none", whiteSpace: "nowrap"
                  }}>Crear cuenta</a>
                </div>
              )}

              <div className="tbs">
                <button className={"tb tb-pred" + (tab === "pred" ? " on" : "")} onClick={() => { sound.pop(); setTab("pred"); }}>
                  <span className="tb-ico">🎯</span>
                  <span className="tb-lbl">Análisis</span>
                </button>
                <button className={"tb tb-rdbl" + (tab === "rdbl" ? " on" : "")} onClick={() => { sound.pop(); setTab("rdbl"); }}>
                  <span className="tb-ico">📊</span>
                  <span className="tb-lbl">Correlación</span>
                </button>
                <button className={"tb tb-freq" + (tab === "freq" ? " on" : "")} onClick={() => { sound.pop(); setTab("freq"); }}>
                  <span className="tb-ico">🔥</span>
                  <span className="tb-lbl">Frecuencias</span>
                </button>
                <button className={"tb tb-trend" + (tab === "trend" ? " on" : "")} onClick={() => { sound.pop(); setTab("trend"); }}>
                  <span className="tb-ico">📈</span>
                  <span className="tb-lbl">Tendencias</span>
                </button>
                <button className={"tb tb-mis" + (tab === "mis" ? " on" : "")} onClick={() => { if (guestMode) { toast("Creá una cuenta para guardar y ver tus análisis", "info"); return; } sound.pop(); setTab("mis"); }}>
                  <span className="tb-ico">{guestMode ? "🔒" : "📋"}</span>
                  <span className="tb-lbl">Mis Análisis</span>
                </button>
                <button className={"tb tb-acc" + (tab === "acc" ? " on" : "")} onClick={() => { if (guestMode) { toast("Creá una cuenta para ver tu precisión", "info"); return; } sound.pop(); setTab("acc"); }}>
                  <span className="tb-ico">{guestMode ? "🔒" : "🎯"}</span>
                  <span className="tb-lbl">Precisión</span>
                </button>
                <button className={"tb" + (tab === "hist" ? " on" : "")} onClick={() => setTab("hist")} style={tab === "hist" ? { background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", boxShadow: "0 4px 12px rgba(59,130,246,0.4)" } : {}}>
                  <span className="tb-ico">📜</span>
                  <span className="tb-lbl">Historial</span>
                </button>
              </div>

              <div style={{background:"rgba(99,102,241,0.06)",border:"1px solid rgba(99,102,241,0.12)",borderRadius:8,padding:"6px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:12}}>ℹ️</span>
                <span style={{fontSize:10,color:"#94a3b8",lineHeight:1.4}}>
                  <strong style={{color:"#a5b4fc"}}>Análisis estadístico</strong>, no predicción garantizada. Los sorteos son aleatorios e independientes.
                </span>
              </div>

              {tab === "pred" && (
                <>
                  <div className="sec">Motor de 30 factores + Bayesian uncertainty</div>
                  <div className="dtabs">
                    <button className={"dk dk-2" + (dg === 2 ? " on" : "")} onClick={() => setDg(2)}>
                      2 cifras
                    </button>
                    <button className={"dk dk-3" + (dg === 3 ? " on" : "")} onClick={() => { if (guestMode) { toast("Creá una cuenta para acceder a 3 cifras", "info"); return; } setDg(3) }}>
                      <span className="pbdg">{guestMode ? "🔒" : "PRO"}</span>3 cifras
                    </button>
                    <button className={"dk dk-4" + (dg === 4 ? " on" : "")} onClick={() => { if (guestMode) { toast("Creá una cuenta para acceder a 4 cifras", "info"); return; } setDg(4) }}>
                      <span className="pbdg">{guestMode ? "🔒" : "PRO"}</span>4 cifras
                    </button>
                  </div>
                  <div className={dg > 2 && !pr ? "lk" : ""}>
                    <div style={{ position: "relative" }}>
                      <div
                        className="g5"
                        style={(guestMode || (userRole === "free" && dg > 2)) ? { filter: "blur(8px)", userSelect: "none", pointerEvents: "none" } : {}}
                      >
                        {cur.slice(0, 10).map((p: any, i: number) => {
                          const r = ranking?.find((r: any) => r.numero === p.numero);
                          const isCabeza = i === 0;
                          const post = r?.bayesianPosterior ? (r.bayesianPosterior * 100).toFixed(2) + "%" : "";
                          return (
                          <div className="cd" key={i} onClick={() => setNumDetail(r || p)} style={{cursor:"pointer", position:"relative"}}>
                            {isCabeza && <span className="cabeza-badge">CABEZA</span>}
                            <div className="cr2">#{i + 1}</div>
                            <div className="ce">{getEmoji(p.numero)}</div>
                            <div className="cn">{p.numero}</div>
                            <div className="cs">{p.significado}</div>
                            <div style={{
                              marginTop:6,height:3,borderRadius:2,
                              background:"rgba(255,255,255,.06)",
                              overflow:"hidden"
                            }}>
                              <div style={{
                                height:"100%",borderRadius:2,
                                width: r?.score ? Math.min(100, (r.score || 0) * 100) + "%" : "0%",
                                background:"linear-gradient(90deg,#a855f7,#ec4899)"
                              }}/>
                            </div>
                            <div style={{fontSize:9,color:"#a78bfa",marginTop:3,fontWeight:600}}>
                              {r?.score ? (r.score * 100).toFixed(0) + "%" : ""}
                            </div>
                            {post && <div style={{fontSize:7,color:"#22c55e",marginTop:2,fontWeight:700}}>Post: {post}</div>}
                          </div>
                        )})}
                      </div>
                      {userRole === "free" && dg > 2 && (
                        <div
                          style={{
                            position: "absolute", inset: 0,
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            background: "rgba(0,0,0,0.4)", borderRadius: 14,
                            cursor: "pointer", zIndex: 10
                          }}
                          onClick={() => guestMode ? window.location.href = "/login" : setShowPaywall(true)}
                        >
                          <div style={{ fontSize: 32, marginBottom: 8 }}>{guestMode ? "👤" : "🧠"}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{guestMode ? "Creá una cuenta para acceder" : "La IA ya procesó el análisis completo"}</div>
                          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>{guestMode ? "Es gratis y toma 30 segundos" : "Desbloqueá el análisis completo con Machine Learning"}</div>
                          <div style={{
                            background: guestMode ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#a855f7,#7c3aed)",
                            color: "#fff", fontSize: 13, fontWeight: 800,
                            padding: "10px 24px", borderRadius: 12,
                            boxShadow: guestMode ? "0 4px 16px rgba(99,102,241,0.4)" : "0 4px 16px rgba(168,85,247,0.4)"
                          }}>
                            {guestMode ? "✨ Crear cuenta gratis" : "🔓 Desbloquear Análisis"}
                          </div>
                          <div style={{ fontSize: 10, color: "#64748b", marginTop: 8 }}>Desde $3.500 ARS · Sin suscripción</div>
                        </div>
                      )}
                    </div>
                    {dg > 2 && !pr && (
                      <div className="lo">
                        <div style={{ fontSize: 32 }}>🔐</div>
                        <h3>Análisis {dg} dígitos</h3>
                        <p>El mismo motor de 30 factores predice números de {dg} cifras. Accedé con Premium.</p>
                        <div style={{fontSize:10,color:"#4ade80",marginTop:6}}>✓ Sin datos de tarjeta</div>
                        <div style={{fontSize:10,color:"#4ade80"}}>✓ Paga desde tu billetera virtual</div>
                        <div style={{fontSize:10,color:"#4ade80"}}>✓ Activación inmediata!</div>
                        <a href={WA} target="_blank" rel="noopener noreferrer" className="uc">
                          Activar Premium
                        </a>
                      </div>
                    )}
</div>

                  {rdbl && tab === "pred" && (pr || userRole === "admin") && (
                    <div className="rdbl" style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#25F4EE", marginBottom: 4, fontWeight: 700 }}>🎯 Par óptimo (Correlación)</div>
                      <div className="rpair">{rdbl}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>Analizá la correlación entre ambos números en el mismo sorteo.</div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {guestMode ? (
                      <a href="/login" className="btn3d btn-save" style={{ marginBottom: 0, textDecoration: "none", textAlign: "center" }} onClick={() => sound.click()}>
                        🔐 Crear cuenta gratis
                      </a>
                    ) : (
                      <button className="btn3d btn-save" style={{ marginBottom: 0 }} onClick={() => { sound.click(); guardarPrediccion(); }} disabled={guardando}>
                        {guardando ? "Guardando..." : guardadoOk ? "Guardado!" : "Guardar para comparar"}
                      </button>
                    )}
                    <button className="btn3d btn-copy" style={{ marginBottom: 0 }} onClick={() => { sound.click(); copiar(); }}>
                      Copiar
                    </button>
                  </div>
                </>
              )}
              {tab === "rdbl" && (
                <>
                  <div className="sec">Análisis de correlación</div>
                  <div style={{ minHeight: 160 }}>
                    {pr ? (
                      <>
                        {rdbl && (
                          <div className="rdbl">
                            <div style={{ fontSize: 12, color: "#25F4EE", marginBottom: 4, fontWeight: 700 }}>Par optimo recomendado</div>
                            <div className="rpair">{rdbl}</div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>Analizá la correlación entre ambos números en el mismo sorteo.</div>
                          </div>
                        )}
                        {dt?.numeros?.slice(0, 5).map((r: any, i: number) => (
                          <div className="rc" key={i}>
                            <div className="rn">{r.numero}</div>
                            <div className="rk">{r.significado || ""}</div>
                            <div className="rv">Score {r.score?.toFixed(2) || "0"}%</div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div
                        style={{
                          padding: 30,
                          background: "rgba(6,8,15,.95)",
                          backdropFilter: "blur(8px)",
                          borderRadius: 14,
                          border: "1px solid rgba(37,244,238,.2)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 10,
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 36 }}>🔐</div>
                        <div style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>Correlación Premium</div>
                        <div style={{ fontSize: 12, color: "#94a3b8", maxWidth: 200, lineHeight: 1.6 }}>El par óptimo se calcula con análisis de co-ocurrencia y correlación cross-turno. Exclusivo Premium.</div>
                        <div style={{fontSize:10,color:"#4ade80",marginTop:6}}>✓ Sin datos de tarjeta</div>
                        <div style={{fontSize:10,color:"#4ade80"}}>✓ Paga desde tu billetera virtual</div>
                        <div style={{fontSize:10,color:"#4ade80"}}>✓ Activación inmediata!</div>
                        <a href={WA} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#94a3b8", textDecoration: "none" }}>
                          Activar Premium
                        </a>
                        <div style={{ fontSize: 10, color: "#475569" }}>Alias: quiniela.ia — $10.000</div>
                      </div>
                    )}
                  </div>
                </>
              )}
              {tab === "freq" && (
                <>
                  <div className="sec">Mapa de calor - Frecuencia</div>
                  {dt?.heatmap && dt.heatmap.length > 0 ? (
                    <div className="heatmap-grid">
                      {dt?.heatmap?.map((h: any, i: number) => {
                        const intensity = Math.min(1, h.f / 10);
                        return (
                          <div
                            key={i}
                            className="heatmap-cell"
                            style={{
                              backgroundColor: `rgba(254, 44, 85, ${intensity})`,
                              opacity: h.f > 0 ? 1 : 0.3,
                            }}
                            title={`${h.n.toString().padStart(2, '0')} - ${h.s} (Frecuencia: ${h.f})`}
                          >
                            <span className="hm-num">{h.n}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                      Cargando mapa de calor...
                    </div>
                    )}
                    
                    {dt?.heatmap && dt.heatmap.length > 0 && (
                      <div className="heatmap-stats">
                        <div style={{fontSize:10,fontWeight:800,color:"#22c55e",marginBottom:6}}>📈 Frecuencia acumulada (top 100)</div>
                        <div className="heatmap-stat-row">
                          <span className="heatmap-stat-label">Top 10 (%):</span>
                          <span className="heatmap-stat-value">
                            {((dt.heatmap.slice(0,10).reduce((a,b)=>a+(b.f||0),0) / dt.heatmap.reduce((a,b)=>a+(b.f||0),1)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="heatmap-stat-row">
                          <span className="heatmap-stat-label">Top 20 (%):</span>
                          <span className="heatmap-stat-value">
                            {((dt.heatmap.slice(0,20).reduce((a,b)=>a+(b.f||0),0) / dt.heatmap.reduce((a,b)=>a+(b.f||0),1)) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="heatmap-stat-row">
                          <span className="heatmap-stat-label">Sorteos analizados:</span>
                          <span className="heatmap-stat-value">{dt.totalSorteos || dt?.numeros?.length || 0}</span>
                        </div>
                      </div>
                    )}
                    
                  </>
              )}
              {tab === "trend" && (
                <>
                  <div className="sec">Análisis de Tendencias - Evolución en el tiempo</div>
                  <div className="trend-chart">
                    <div className="trend-info">
                      <div className="trend-info-title">Top Números con Mayor Tendencia</div>
                      <div className="trend-info-desc">Basado en {dt?.totalSorteos || 121} sorteos reales</div>
                    </div>
                    
                    <div className="trend-bars">
                      {dt?.numeros?.slice(0, 10).map((n: any, i: number) => (
                        <div key={i} className="trend-bar-row">
                          <div className="trend-bar-label">{n.numero}</div>
                          <div className="trend-bar-track">
                            <div 
                              className="trend-bar-fill" 
                              style={{ width: `${Math.min(100, (n.score || 0) * 100)}%` }}
                            />
                          </div>
                          <div className="trend-bar-value">{(n.score || 0).toFixed(3)}</div>
                          <div className="trend-bar-meaning">{n.significado || ""}</div>
                        </div>
                      ))}
                    </div>

                    <div className="trend-stats">
                      <div
                        className="trend-stat-card"
                        style={userRole === "free" ? { filter: "blur(6px)", userSelect: "none", position: "relative" } : {}}
                      >
                        <div className="trend-stat-value">{dt?.numeros_2?.slice(0, 5).join("-")}</div>
                        <div className="trend-stat-label">Top 5 cifras</div>
                      {userRole === "free" && dg > 2 && (
                          <div
                            style={{
                              position: "absolute", inset: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              background: "rgba(0,0,0,0.3)", borderRadius: 10, cursor: "pointer"
                            }}
                            onClick={() => setShowPaywall(true)}
                          >
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#a855f7" }}>PRO 🔒</span>
                          </div>
                        )}
                      </div>
                      <div className="trend-stat-card">
                        <div className="trend-stat-value">{dt?.stats?.numeroMasFrecuente?.numero}</div>
                        <div className="trend-stat-label">Más frecuente</div>
                      </div>
                      <div className="trend-stat-card">
                        <div className="trend-stat-value">{dt?.stats?.numeroMayorRetraso?.numero}</div>
                        <div className="trend-stat-label">Mayor retraso</div>
                      </div>
                    </div>

                    <div className="trend-metric">
                      <div className="trend-metric-title">Indicador de Tendencia Global</div>
                      <div className="trend-metric-value">
                        {dt?.numeros?.[0]?.tendencia > 0 ? "📈 Alcista" : "📉 Bajista"}
                      </div>
                      <div className="trend-metric-desc">
                        Basado en la diferencia entre frecuencia reciente vs histórica
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "mis" && (
            <>
              <div className="sec">Mis análisis guardados
                <button 
                  onClick={() => tkRef.current && cargarMisPreds(tkRef.current)}
                  style={{
                    marginLeft: 10,
                    padding: "4px 12px",
                    fontSize: 10,
                    background: "#a855f7",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer"
                  }}
                  disabled={misLoading}
                >
                  {misLoading ? "Actualizando..." : "🔄 Actualizar"}
                </button>
              </div>
              {misLoading ? (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div className="saved-summary">
                    {[1,2,3,4].map(i=>(
                      <div key={i} className="skeleton" style={{height:64,borderRadius:16}}/>
                    ))}
                  </div>
                  {[1,2,3].map(i=>(
                    <div key={i} className="skeleton" style={{height:80,borderRadius:14}}/>
                  ))}
                </div>
              ) : misPreds.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px", color: "#64748b", fontSize: 12 }}>
                  Aún no guardaste análisis.<br />Generá un análisis y apretá Guardar para comparar.
                </div>
              ) : (
                <>
                  <div className="saved-summary">
                    <div className="saved-summary-card">
                      <div className="saved-summary-label">Guardadas</div>
                      <div className="saved-summary-value">{misSummary.totalSaved}</div>
                    </div>
                    <div className="saved-summary-card">
                      <div className="saved-summary-label">Con resultado</div>
                      <div className="saved-summary-value">{misSummary.totalWithResult}</div>
                    </div>
                    <div className="saved-summary-card">
                      <div className="saved-summary-label">Análisis con coincidencia</div>
                      <div className="saved-summary-value">{misSummary.successRate}%</div>
                    </div>
                    <div className="saved-summary-card">
                      <div className="saved-summary-label">Aciertos totales</div>
                      <div className="saved-summary-value">{misSummary.totalAciertos}</div>
                    </div>
                  </div>
                  <div className="saved-summary" style={{ marginBottom: 20 }}>
                    <div className="saved-summary-card" style={{ gridColumn: "span 2" }}>
                      <div className="saved-summary-label">Esta semana</div>
                      <div className="saved-summary-value">{misSummary.thisWeek}</div>
                      <div style={{fontSize:10,color:"var(--dim)"}}>análisis · {misSummary.thisWeekHits} con coincidencias ({misSummary.thisWeekRate}%)</div>
                    </div>
                    <div className="saved-summary-card" style={{ gridColumn: "span 2" }}>
                      <div className="saved-summary-label">Mejor turno</div>
                      <div className="saved-summary-value">{misSummary.bestTurno}</div>
                      <div style={{fontSize:10,color:"var(--dim)"}}>con más coincidencias históricas</div>
                    </div>
                  </div>
                  {(() => {
                    const badges = [];
                    if (misPreds.length >= 1) badges.push({icon:"🙌",label:"Primer análisis",color:"#4ade80"});
                    if (misSummary.totalAciertos >= 1) badges.push({icon:"🎯",label:"Primera coincidencia",color:"#f59e0b"});
                    if (misPreds.length >= 10) badges.push({icon:"💎",label:"10 análisis",color:"#a855f7"});
                    if (misPreds.length >= 30) badges.push({icon:"🏆",label:"30 análisis",color:"#f472b6"});
                    if (misSummary.totalWithHits >= 3) badges.push({icon:"🔥",label:misSummary.totalWithHits + " con coincidencias",color:"#ef4444"});
                    if (misSummary.successRate >= 50) badges.push({icon:"⭐",label:"+50% coincidencias",color:"#f59e0b"});
                    if (badges.length === 0) return null;
                    return (
                      <div style={{marginBottom:16}}>
                        <div style={{fontSize:10,fontWeight:800,color:"var(--dim)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>🏅 Logros desbloqueados</div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                          {badges.map((b,i) => (
                            <span key={i} style={{
                              padding:"5px 10px",borderRadius:8,fontSize:11,fontWeight:700,
                              background: b.color + "18",
                              border: "1px solid " + b.color + "35",
                              color: b.color
                            }}>
                              {b.icon} {b.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {misPreds.map((p: any, i: number) => {
                    const tieneAciertos = p.aciertos && p.aciertos.length > 0;
                    const fecha = p.date || p.fecha;
                    const fechaValida = fecha && !isNaN(Date.parse(fecha));
                    const titulo = fechaValida ? `${p.turno} — ${new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : `${p.turno} — ${fecha || "Sin fecha"}`;
                    return (
                      <div key={i} className={`saved-card ${tieneAciertos ? "saved-card-success" : ""}`}>
                        <div className="saved-card-header">
                          <div className="saved-card-title">{titulo}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{p.numeros?.length || 0} nums</span>
                            {p.resultado && p.resultado.length > 0 ? (
                              <div className={`saved-card-status ${p.acerto ? "hit" : "miss"}`}>
                                {p.acerto ? `📊 ${p.aciertos.length} coincidencia(s)` : "Sin coincidencias"}
                              </div>
                            ) : (
                              <div className="saved-card-status miss">⏳ Esperando resultado</div>
                            )}
                          </div>
                        </div>
                        <div className="saved-numbers">
                          {p.numeros.map((n: string, j: number) => {
                            const ac = p.aciertos?.some((a: any) => a.numero === n);
                            return (
                              <span key={j} className={`saved-number ${ac ? "hit" : ""}`}>
                                {n}
                              </span>
                            );
                          })}
                        </div>
                        {(pr || userRole === "admin") && p.numeros_3?.length > 0 && (
                          <div style={{ marginTop: 8, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                            <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, marginBottom: 4 }}>🔢 3 CIFRAS {p.aciertos_3?.length > 0 && <span style={{color:"#22c55e"}}>✓ {p.aciertos_3.length} coincidencia{p.aciertos_3.length > 1 ? "s" : ""}</span>}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {p.numeros_3.map((n: string, j: number) => {
                                const hit3 = p.aciertos_3?.some((a: any) => a.numero === n);
                                return (
                                  <span key={j} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                                    background: hit3 ? "rgba(34,197,94,.2)" : "rgba(245,158,11,.12)",
                                    color: hit3 ? "#22c55e" : "#fbbf24",
                                    border: hit3 ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(245,158,11,.2)" }}>{n}</span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {(pr || userRole === "admin") && p.numeros_4?.length > 0 && (
                          <div style={{ marginTop: 8, padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                            <div style={{ fontSize: 10, color: "#a855f7", fontWeight: 700, marginBottom: 4 }}>🔢 4 CIFRAS {p.aciertos_4?.length > 0 && <span style={{color:"#22c55e"}}>✓ {p.aciertos_4.length} coincidencia{p.aciertos_4.length > 1 ? "s" : ""}</span>}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {p.numeros_4.map((n: string, j: number) => {
                                const hit4 = p.aciertos_4?.some((a: any) => a.numero === n);
                                return (
                                  <span key={j} style={{ padding: "3px 7px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                                    background: hit4 ? "rgba(34,197,94,.2)" : "rgba(168,85,247,.12)",
                                    color: hit4 ? "#22c55e" : "#c084fc",
                                    border: hit4 ? "1px solid rgba(34,197,94,.4)" : "1px solid rgba(168,85,247,.2)" }}>{n}</span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {p.resultado_original && p.resultado_original.length > 0 && (
                          <div className="saved-results" style={{marginTop:8}}>
                            <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>RESULTADOS OFICIALES ({p.resultado_original.length} números):</div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                              {p.resultado_original.map((n:any,idx:number) => {
                                const n4 = String(Number(n) % 10000).padStart(4, "0")
                                const n3 = String(Number(n) % 1000).padStart(3, "0")
                                const n2 = String(Number(n) % 100).padStart(2, "0")
                                const hit4 = p.aciertos_4?.some((a:any) => a.numero === n4)
                                const hit3 = p.aciertos_3?.some((a:any) => a.numero === n3)
                                const hit2 = p.aciertos_2?.some((a:any) => a.numero === n2)
                                const isHit = hit4 || hit3 || hit2
                                const hitType = hit4 ? "4" : hit3 ? "3" : hit2 ? "2" : null
                                return (
                                  <span key={idx} style={{
                                    padding:"4px 7px",borderRadius:6,fontSize:11,fontWeight:700,
                                    background: isHit
                                      ? hitType === "4" ? "rgba(34,197,94,0.25)"
                                      : hitType === "3" ? "rgba(96,165,250,0.2)"
                                      : "rgba(168,85,247,0.2)"
                                      : "rgba(255,255,255,0.05)",
                                    color: isHit
                                      ? hitType === "4" ? "#22c55e"
                                      : hitType === "3" ? "#60a5fa"
                                      : "#c4b5fd"
                                      : "#64748b",
                                    border: isHit
                                      ? hitType === "4" ? "1px solid rgba(34,197,94,0.5)"
                                      : hitType === "3" ? "1px solid rgba(96,165,250,0.4)"
                                      : "1px solid rgba(168,85,247,0.4)"
                                      : "1px solid rgba(255,255,255,0.08)"
                                  }}>
                                    {n4}
                                  </span>
                                );
                              })}
                            </div>
                            <div style={{display:"flex",gap:10,marginTop:6,fontSize:9,color:"#64748b"}}>
                              <span><span style={{color:"#c4b5fd"}}>●</span> 2 cifras</span>
                              <span><span style={{color:"#60a5fa"}}>●</span> 3 cifras</span>
                              <span><span style={{color:"#22c55e"}}>●</span> 4 cifras</span>
                            </div>
                          </div>
                        )}
                        {p.aciertos?.length > 0 && (
                          <div className="saved-results">
                            {p.aciertos.map((a: any) => (
                              <div key={a.numero} style={{color:"#22c55e",fontSize:11}}>
                                🎉 {a.numero} → Puesto {a.puesto}
                              </div>
                            ))}
                          </div>
                        )}
                        {p.aciertos_3?.length > 0 && (
                          <div className="saved-results">
                            {p.aciertos_3.map((a: any) => (
                              <div key={a.numero} style={{color:"#60a5fa",fontSize:11}}>
                                🎯 {a.numero} (3 cifras) → Puesto {a.puesto}
                              </div>
                            ))}
                          </div>
                        )}
                        {p.aciertos_4?.length > 0 && (
                          <div className="saved-results">
                            {p.aciertos_4.map((a: any) => (
                              <div key={a.numero} style={{color:"#22c55e",fontSize:11}}>
                                💎 {a.numero} (4 cifras) → Puesto {a.puesto}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </>
              )}
          {tab === "acc" && (
            <div style={{marginTop:12}}>
              <div className="sec">Precisión del Motor Predictivo</div>
              {!backtestData && !backtestLoading && (
                <button onClick={async () => {
                  setBacktestLoading(true)
                  try {
                    const r = await fetch(`/api/backtest?turno=${so}&days=90`)
                    const d = await r.json()
                    setBacktestData(d)
                   } catch {}
                  setBacktestLoading(false)
                }} style={{width:"100%",padding:14,borderRadius:12,border:"1.5px solid rgba(99,102,241,.4)",background:"rgba(99,102,241,.08)",color:"#818cf8",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:14}}>
                  📊 Calcular métricas de precisión
                </button>
              )}
              {backtestLoading && (
                <div style={{textAlign:"center",padding:30,color:"var(--dim)",fontSize:12}}>
                  <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                  Ejecutando walk-forward backtesting...
                </div>
              )}
              {backtestData && (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                    {[
                      { label: "Hit@1", value: backtestData.metrics_top_1?.hitAt1 || 0, color: "#a855f7", desc: "Acierto exacto" },
                      { label: "Hit@5", value: backtestData.metrics_top_5?.hitAt5 || 0, color: "#6366f1", desc: "Al menos 1 en top 5" },
                      { label: "Hit@10", value: backtestData.metrics_top_10?.hitAt10 || 0, color: "#ec4899", desc: "Al menos 1 en top 10" },
                    ].map((m, i) => (
                      <div key={i} style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:14,textAlign:"center"}}>
                        <div style={{fontSize:28,fontWeight:900,color:m.color}}>{m.value}%</div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--text)",marginTop:2}}>{m.label}</div>
                        <div style={{fontSize:9,color:"var(--dim)",marginTop:2}}>{m.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:14,marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--text)",marginBottom:8}}>Métricas detalladas (top 10)</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      {[
                        { label: "Sorteos analizados", val: backtestData.metrics_top_10?.totalDraws || 0 },
                        { label: "Promedio coincidencias/sorteo", val: backtestData.metrics_top_10?.avgHitsPerDraw || 0 },
                        { label: "Máx coincidencias en 1 sorteo", val: backtestData.metrics_top_10?.maxHits || 0 },
                        { label: "Precisión", val: (backtestData.metrics_top_10?.precision || 0) + "%" },
                        { label: "Recall", val: (backtestData.metrics_top_10?.recall || 0) + "%" },
                        { label: "Aciertos promedio", val: (backtestData.metrics_top_10?.avgHitsPerDraw || 0) },
                      ].map((item, i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                          <span style={{fontSize:10,color:"var(--dim)"}}>{item.label}</span>
                          <span style={{fontSize:10,fontWeight:700,color:"var(--text)"}}>{item.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:"var(--dim)",textAlign:"center",lineHeight:1.5}}>
                     Walk-forward validation con {backtestData.metrics_top_10?.totalDraws || 0} sorteos de {backtestData.total_draws} totales · Motor de 30 factores · Top 10 análisis
                  </div>
                  <button onClick={() => setBacktestData(null)} style={{width:"100%",padding:10,borderRadius:10,border:"1px solid rgba(255,255,255,.08)",background:"transparent",color:"var(--dim)",fontSize:10,cursor:"pointer",marginTop:10}}>
                    Recalcular
                  </button>
                </>
              )}
            </div>
          )}
          {tab === "hist" && (
            <div style={{marginTop:12}}>
              <div className="sec">📜 Historial de Sorteos - Transparencia Total</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.6 }}>
                Todos los resultados mostrados son <strong style={{ color: "#fff" }}>datos oficiales</strong> de la Quiniela Nacional.
                Podés verificar cada sorteo en las fuentes oficiales.
              </div>
              <HistorialAciertos predictions={misPreds} />
            </div>
          )}
          {!pr && (
            <div className="pay-box" style={{padding:"24px 20px"}}>
              <div style={{fontSize:36,textAlign:"center",marginBottom:8}}>🧠</div>
              <h3 className="pay-title" style={{marginBottom:6}}>ELEGÍ TU MEDIO DE PAGO PARA ACCEDER</h3>
              <div style={{fontSize:12,color:"var(--dim)",marginBottom:20,textAlign:"center",lineHeight:1.6}}>
                Desbloqueá análisis de <strong style={{color:"#a855f7"}}>3 y 4 cifras</strong> con Machine Learning
              </div>

              {/* Plan Semanal */}
              <div style={{borderRadius:14,overflow:"hidden",marginBottom:14,background:"linear-gradient(135deg,rgba(168,85,247,.1),rgba(99,102,241,.06))",border:"1px solid rgba(168,85,247,.25)",boxShadow:"0 4px 16px rgba(168,85,247,.15)"}}>
                <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Pase Semanal</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2}}>7 días de acceso</div>
                  </div>
                  <div style={{fontSize:22,fontWeight:900,color:"#a855f7"}}>$3.500</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 10px 10px"}}>
                  <button
                    onClick={() => setShowPaywall(true)}
                    style={{padding:"14px 10px",textAlign:"center",cursor:"pointer",border:"none",borderRadius:12,
                      background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                      boxShadow:"0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)",
                      transition:"all .15s",color:"#fff"}}
                    onMouseDown={e=>{e.currentTarget.style.transform="translateY(2px)";e.currentTarget.style.boxShadow="0 2px 0 #4338ca,0 3px 8px rgba(99,102,241,.2)"}}
                    onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)"}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)"}}
                  >
                    <div style={{fontSize:20,marginBottom:4}}>💳</div>
                    <div style={{fontSize:12,fontWeight:800}}>Tocá aquí para pagar</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.8)",marginTop:2}}>Crédito o débito</div>
                    <div style={{fontSize:10,color:"#4ade80",marginTop:1,fontWeight:600}}>Inmediato</div>
                  </button>
                  <button
                    onClick={() => {navigator.clipboard.writeText("quiniela.ia").then(() => toast("Alias copiado","success"))}}
                    style={{padding:"14px 10px",textAlign:"center",cursor:"pointer",border:"none",borderRadius:12,
                      background:"linear-gradient(135deg,#f59e0b,#d97706)",
                      boxShadow:"0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)",
                      transition:"all .15s",color:"#fff"}}
                    onMouseDown={e=>{e.currentTarget.style.transform="translateY(2px)";e.currentTarget.style.boxShadow="0 2px 0 #92400e,0 3px 8px rgba(245,158,11,.15)"}}
                    onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)"}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)"}}
                  >
                    <div style={{fontSize:20,marginBottom:4}}>🏦</div>
                    <div style={{fontSize:12,fontWeight:800}}>Transferencia</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.8)",marginTop:1}}>Tocá para copiar alias</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.7)",marginTop:1}}>En 24hs</div>
                  </button>
                </div>
              </div>

              {/* Plan Mensual */}
              <div style={{borderRadius:14,overflow:"hidden",marginBottom:16,position:"relative",background:"linear-gradient(135deg,rgba(34,197,94,.08),rgba(16,163,74,.04))",border:"1px solid rgba(34,197,94,.3)",boxShadow:"0 4px 16px rgba(34,197,94,.12)"}}>
                <div style={{position:"absolute",top:0,right:0,background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",fontSize:9,fontWeight:800,padding:"4px 10px",borderRadius:"0 14px 0 8px",letterSpacing:0.5,boxShadow:"0 2px 8px rgba(34,197,94,.4)"}}>AHORRÁ 40%</div>
                <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Pase Mensual</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2}}>30 días de acceso</div>
                  </div>
                  <div style={{fontSize:22,fontWeight:900,color:"#22c55e"}}>$10.000</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 10px 10px"}}>
                  <button
                    onClick={() => setShowPaywall(true)}
                    style={{padding:"14px 10px",textAlign:"center",cursor:"pointer",border:"none",borderRadius:12,
                      background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                      boxShadow:"0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)",
                      transition:"all .15s",color:"#fff"}}
                    onMouseDown={e=>{e.currentTarget.style.transform="translateY(2px)";e.currentTarget.style.boxShadow="0 2px 0 #4338ca,0 3px 8px rgba(99,102,241,.2)"}}
                    onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)"}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #4338ca,0 6px 16px rgba(99,102,241,.3),inset 0 1px 0 rgba(255,255,255,.2)"}}
                  >
                    <div style={{fontSize:20,marginBottom:4}}>💳</div>
                    <div style={{fontSize:12,fontWeight:800}}>Tocá aquí para pagar</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.8)",marginTop:2}}>Crédito o débito</div>
                    <div style={{fontSize:10,color:"#4ade80",marginTop:1,fontWeight:600}}>Inmediato</div>
                  </button>
                  <button
                    onClick={() => {navigator.clipboard.writeText("quiniela.ia").then(() => toast("Alias copiado","success"))}}
                    style={{padding:"14px 10px",textAlign:"center",cursor:"pointer",border:"none",borderRadius:12,
                      background:"linear-gradient(135deg,#f59e0b,#d97706)",
                      boxShadow:"0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)",
                      transition:"all .15s",color:"#fff"}}
                    onMouseDown={e=>{e.currentTarget.style.transform="translateY(2px)";e.currentTarget.style.boxShadow="0 2px 0 #92400e,0 3px 8px rgba(245,158,11,.15)"}}
                    onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)"}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 4px 0 #92400e,0 6px 16px rgba(245,158,11,.25),inset 0 1px 0 rgba(255,255,255,.15)"}}
                  >
                    <div style={{fontSize:20,marginBottom:4}}>🏦</div>
                    <div style={{fontSize:12,fontWeight:800}}>Transferencia</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.8)",marginTop:1}}>Tocá para copiar alias</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.7)",marginTop:1}}>En 24hs</div>
                  </button>
                </div>
              </div>

              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
                <span style={{fontSize:10,color:"#475569"}}>Alias: <strong style={{color:"#818cf8"}}>quiniela.ia</strong> · Pago único · Sin renovación</span>
                <div style={{flex:1,height:1,background:"rgba(255,255,255,.08)"}}/>
              </div>

              <button
                onClick={() => {navigator.clipboard.writeText("quiniela.ia").then(() => { window.open(WA, "_blank"); })}}
                style={{
                  width:"100%",padding:"14px",borderRadius:14,border:"none",
                  background:"linear-gradient(135deg,#25D366,#128C7E,#075E54)",color:"#fff",
                  fontSize:14,fontWeight:900,cursor:"pointer",
                  boxShadow:"0 6px 0 #064E3B,0 8px 24px rgba(37,211,102,.35),inset 0 2px 0 rgba(255,255,255,.15)",
                  transition:"all .15s"
                }}
                onMouseDown={e=>{e.currentTarget.style.transform="translateY(3px)";e.currentTarget.style.boxShadow="0 2px 0 #064E3B,0 3px 8px rgba(37,211,102,.2)"}}
                onMouseUp={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 6px 0 #064E3B,0 8px 24px rgba(37,211,102,.35),inset 0 2px 0 rgba(255,255,255,.15)"}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 6px 0 #064E3B,0 8px 24px rgba(37,211,102,.35),inset 0 2px 0 rgba(255,255,255,.15)"}}
              >
                📲 Enviar comprobante por WhatsApp
              </button>
            </div>
          )}
          <div className="shr">
            <div className="shr-t">Compartir Quiniela IA</div>
            <div className="shr-b">
              <button className="sbt wa" onClick={() => share("whatsapp")}>WhatsApp</button>
              <button className="sbt fb" onClick={() => share("facebook")}>Facebook</button>
              <button className="sbt tw" onClick={() => share("twitter")}>X</button>
              <button className="sbt tg" onClick={() => share("telegram")}>Telegram</button>
              <button className="sbt cp" onClick={() => share("copy")}>Copiar link</button>
            </div>
          </div>
          {showInstall && (
            <div style={{ background: "linear-gradient(135deg,rgba(255,51,102,.15),rgba(255,51,102,.05))", border: "1px solid rgba(255,51,102,.4)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>📲</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b81", marginBottom: 4 }}>Instalá Quiniela IA como App</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>Accedé desde tu pantalla de inicio, sin Play Store</div>
              <button onClick={installApp} style={{ padding: "10px 24px", borderRadius: 10, background: "linear-gradient(135deg,#ff3366,#ff6b81)", color: "#fff", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Instalar Ahora
              </button>
            </div>
          )}
          <div className="ft">
            <ReviewsCarousel />
          </div>
          <div className="ft">
            <div className="dc">
              Quiniela IA es una herramienta de análisis estadístico con fines de entretenimiento. No garantiza resultados. No vende boletos ni procesa apuestas. Línea de ayuda: <strong style={{color:"#a5b4fc"}}>0800-666-6006</strong>. Solo mayores de 18 años.
            </div>
            <div className="credit">
               © 2026 Quiniela IA · Desarrollado por <strong>EstudioWebPin</strong>
            </div>
          </div>
        </div>
      </div>
      {showHowItWorks && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={() => setShowHowItWorks(false)}>
          <div style={{background:"var(--card)",borderRadius:16,padding:24,maxWidth:400,width:"100%"}} onClick={e => e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:16,color:"var(--text)"}}>🔬 Cómo funciona</div>
            <div style={{fontSize:13,lineHeight:1.7,color:"var(--dim)"}}>
              <p style={{marginBottom:12}}><strong style={{color:"var(--text)"}}>1. Datos reales</strong><br/>Scrapeamos resultados oficiales de la Quiniela Nacional cada 15 min. Tenemos +200 sorteos históricos con todos los turnos completos.</p>
              <p style={{marginBottom:12}}><strong style={{color:"var(--text)"}}>2. 30 factores estadísticos</strong><br/>Cada número recibe un score basado en frecuencia histórica, ausencia, recencia exponencial, tendencia, ciclos, momentum, Markov, entropía, clusters, co-ocurrencia, espejos, vecinos y más. Nada es al azar.</p>
              <p style={{marginBottom:12}}><strong style={{color:"var(--text)"}}>3. Monte Carlo + Ensemble dinámico</strong><br/>5.000 simulaciones estadísticas combinan los 30 factores con análisis cross-turno. Los pesos se auto-calibran según el rendimiento histórico real.</p>
              <p style={{marginBottom:12}}><strong style={{color:"var(--text)"}}>4. ML: XGBoost + LightGBM</strong><br/>Modelos de Machine Learning entrenados offline con +200 sorteos reales. Extraen 25 features por número y aprenden patrones que el análisis manual no detecta.</p>
               <p style={{marginBottom:12}}><strong style={{color:"var(--text)"}}>5. Cero números aleatorios</strong><br/>No hay random. No hay "magia". Cada análisis es el resultado de cálculos matemáticos verificables sobre datos reales de la Quiniela Nacional.</p>
              <p><strong style={{color:"var(--text)"}}>6. Resultados contrastables</strong><br/>Guardá tus análisis y comparalos con los resultados oficiales automáticamente. Podés verificar cada coincidencia.</p>
            </div>
            <button onClick={() => setShowHowItWorks(false)} style={{marginTop:20,width:"100%",padding:"12px 20px",borderRadius:10,border:"none",background:"var(--red)",color:"#fff",fontWeight:700,cursor:"pointer"}}>Entendido</button>
          </div>
        </div>
      )}
      {numDetail && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}} onClick={() => {setNumDetail(null);setNumHistory(null)}}>
          <div style={{background:"var(--card)",borderRadius:16,padding:24,maxWidth:420,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e => e.stopPropagation()}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:48,marginBottom:4}}>{getEmoji(numDetail.numero)}</div>
              <div style={{fontSize:36,fontWeight:900,background:"linear-gradient(180deg,#a855f7,#6366f1)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{numDetail.numero}</div>
              <div style={{fontSize:14,color:"var(--dim)",marginTop:4}}>{numDetail.significado || "Sin significado"}</div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16,flexWrap:"wrap"}}>
              <div style={{background:"rgba(168,85,247,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#a855f7"}}>{numDetail.score ? (numDetail.score * 100).toFixed(0) : "—"}</div>
                <div style={{fontSize:9,color:"#a78bfa",fontWeight:700,textTransform:"uppercase"}}>Score</div>
              </div>
              <div style={{background:"rgba(99,102,241,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#818cf8"}}>{numDetail.confianza || "—"}</div>
                <div style={{fontSize:9,color:"#a5b4fc",fontWeight:700,textTransform:"uppercase"}}>Confianza</div>
              </div>
              <div style={{background:"rgba(34,197,94,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#4ade80"}}>{numDetail.frecuencia || numDetail.frecuencia === 0 ? numDetail.frecuencia : "—"}</div>
                <div style={{fontSize:9,color:"#86efac",fontWeight:700,textTransform:"uppercase"}}>Frecuencia</div>
              </div>
              {numDetail.bayesianConfidence != null && (
                <div style={{background:"rgba(236,72,153,.12)",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#f472b6"}}>{numDetail.bayesianConfidence}%</div>
                  <div style={{fontSize:9,color:"#f9a8d4",fontWeight:700,textTransform:"uppercase"}}>Bayesian</div>
                </div>
              )}
            </div>

            {/* Historical Data Section */}
            {numHistory && !numHistoryLoading && (
              <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"var(--dim)",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Historial del Número</div>
                
                {/* Trend indicator */}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1,background:numHistory.trend?.direction === "hot" ? "rgba(239,68,68,.12)" : numHistory.trend?.direction === "cold" ? "rgba(59,130,246,.12)" : "rgba(255,255,255,.04)",borderRadius:8,padding:"8px 10px",textAlign:"center",border: `1px solid ${numHistory.trend?.direction === "hot" ? "rgba(239,68,68,.2)" : numHistory.trend?.direction === "cold" ? "rgba(59,130,246,.2)" : "rgba(255,255,255,.06)"}`}}>
                    <div style={{fontSize:16,fontWeight:900,color:numHistory.trend?.direction === "hot" ? "#f87171" : numHistory.trend?.direction === "cold" ? "#60a5fa" : "#94a3b8"}}>{numHistory.trend?.direction === "hot" ? "🔥 CALIENTE" : numHistory.trend?.direction === "cold" ? "❄️ FRÍO" : "➡️ ESTABLE"}</div>
                    <div style={{fontSize:9,color:"var(--dim)"}}>Tendencia últimos 30 sorteos</div>
                  </div>
                  <div style={{flex:1,background:"rgba(255,255,255,.04)",borderRadius:8,padding:"8px 10px",textAlign:"center",border:"1px solid rgba(255,255,255,.06)"}}>
                    <div style={{fontSize:16,fontWeight:900,color:numHistory.stats?.vsExpected > 0 ? "#4ade80" : "#f87171"}}>{numHistory.stats?.vsExpected > 0 ? "+" : ""}{numHistory.stats?.vsExpected}%</div>
                    <div style={{fontSize:9,color:"var(--dim)"}}>vs esperado ({numHistory.stats?.expectedFrequency}%)</div>
                  </div>
                </div>

                {/* Gaps per turno */}
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:"var(--dim)",fontWeight:700,marginBottom:6}}>Ausencia por turno:</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {Object.entries(numHistory.gaps || {}).map(([t, g]) => (
                      <div key={t} style={{background:(g as number) > 10 ? "rgba(239,68,68,.1)" : "rgba(255,255,255,.04)",borderRadius:6,padding:"4px 8px",fontSize:10}}>
                        <span style={{fontWeight:700,color:"var(--text)"}}>{t.substring(0,4)}</span>{" "}
                        <span style={{color:(g as number) > 10 ? "#f87171" : "#94a3b8",fontWeight:700}}>{String(g)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent appearances */}
                {numHistory.appearances?.length > 0 && (
                  <div>
                    <div style={{fontSize:10,color:"var(--dim)",fontWeight:700,marginBottom:6}}>Últimas apariciones:</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {numHistory.appearances.slice(0, 12).map((a: any, i: number) => (
                        <div key={i} style={{background:"rgba(168,85,247,.1)",borderRadius:6,padding:"3px 8px",fontSize:9,color:"#c4b5fd"}}>
                          {a.date.substring(5)} <span style={{color:"#64748b"}}>{a.turno.substring(0,4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {numHistoryLoading && (
              <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12,marginBottom:12,textAlign:"center"}}>
                <div className="skeleton" style={{height:80,borderRadius:8,marginBottom:8}}/>
                <div className="skeleton" style={{height:40,borderRadius:8}}/>
              </div>
            )}

            <div style={{fontSize:11,color:"var(--dim)",lineHeight:1.8,borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:12}}>
              <strong style={{color:"var(--text)"}}>¿Por qué este número?</strong>
              <ul style={{margin:"8px 0 0",padding:"0 0 0 16px"}}>
                <li>Ranking <strong style={{color:"#a855f7"}}>#{numDetail.rank || "—"}</strong> en el análisis general</li>
                {numDetail.frecuencia != null && <li>Apareció <strong style={{color:"#4ade80"}}>{numDetail.frecuencia} veces</strong> en el histórico</li>}
                {numDetail.confianza != null && <li>Confianza del <strong style={{color:"#818cf8"}}>{numDetail.confianza}%</strong></li>}
                {numDetail.bayesianPosterior != null && <li>Posterior Bayesiano: <strong style={{color:"#f472b6"}}>{(numDetail.bayesianPosterior * 100).toFixed(3)}%</strong></li>}
                {numDetail.score != null && <li>Score compuesto: <strong style={{color:"#a855f7"}}>{(numDetail.score * 100).toFixed(1)}%</strong></li>}
                {numDetail.factores?.length > 0 && <li>Factores adicionales: {numDetail.factores.slice(0,3).join(", ")}{numDetail.factores.length > 3 ? "..." : ""}</li>}
              </ul>
            </div>
            <button onClick={() => {setNumDetail(null);setNumHistory(null)}} style={{marginTop:16,width:"100%",padding:"10px",borderRadius:10,border:"none",background:"rgba(255,255,255,.06)",color:"var(--text)",fontWeight:700,cursor:"pointer",fontSize:12}}>Cerrar</button>
          </div>
        </div>
      )}
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        userId={userId}
      />
      <WhatsAppFAB />
      <FooterDisclaimer />
    </>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <PageInner />
    </ToastProvider>
  );
}