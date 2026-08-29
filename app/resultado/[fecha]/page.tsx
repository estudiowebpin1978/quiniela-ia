import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import Link from "next/link";
import { Button3D } from "@/components/ui/button-3d";
import { RealtimeResults } from "@/components/RealtimeResults";
import React from "react";

interface Props {
  params: Promise<{ fecha: string }>;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(dateStr: string) {
  return dateStr;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha } = await params;
  const formattedDate = formatDate(fecha);

  return {
    title: `Resultados Quiniela Nacional ${formattedDate}`,
    description: `Resultados oficiales de todos los turnos de la Quiniela Nacional (Ciudad y Provincia) del ${formattedDate}. Extracto completo con cabezas y 20 números.`,
    openGraph: {
      title: `Quiniela IA | Resultados ${formattedDate}`,
      description: `Extracto oficial completo de la Quiniela del ${formattedDate}`,
      type: "website",
    },
  };
}

export async function generateStaticParams() {
  const supabase = getSupabaseAdmin();
  const { data: draws } = await supabase
    .from("draws")
    .select("date")
    .order("date", { ascending: false })
    .limit(180);

  if (!draws) return [];

  return draws.map((draw) => ({
    fecha: draw.date,
  }));
}

interface DrawData {
  id: string;
  date: string;
  turno: string;
  numbers: number[];
  head_number: number | null;
}

const TURNOS_ORDER = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"];
const TURNOS_LABELS: Record<string, string> = {
  Previa: "Previa",
  Primera: "Primera",
  Matutina: "Matutina",
  Vespertina: "Vespertina",
  Nocturna: "Nocturna",
};

export default async function ResultadoFechaPage({ params }: Props) {
  const { fecha } = await params;
  const supabase = getSupabaseAdmin();

  const { data: draws } = await supabase
    .from("draws")
    .select("*")
    .eq("date", fecha)
    .order("turno", { ascending: true });

  if (!draws || draws.length === 0) {
    notFound();
  }

  const formattedDate = formatDate(fecha);

  const completedDraws = draws.filter((d: DrawData) => d.numbers && d.numbers.length > 0);
  const pendingDraws = draws.filter((d: DrawData) => !d.numbers || d.numbers.length === 0);

  const prevDate = new Date(fecha + "T00:00:00");
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(fecha + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <RealtimeResults currentDate={fecha} />
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <h1 className="font-mono font-bold text-xl text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                Quiniela IA
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Resultados Oficiales
              </p>
              <p className="font-mono text-sm text-emerald-400 capitalize">
                {formattedDate}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-mono text-2xl font-bold">Extracto Completo</h2>
              <p className="text-slate-500 text-sm mt-1">
                {completedDraws.length} de 5 turnos con resultados oficiales
              </p>
            </div>
            <Link href="/pronostico">
              <Button3D variant="secondary" size="md">
                Ver Pronósticos de Hoy
              </Button3D>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TURNOS_ORDER.map((turno) => {
              const draw = draws.find((d: DrawData) => d.turno === turno);
              const hasResults = draw?.numbers && draw.numbers.length > 0;

              return (
                <article
                  key={turno}
                  className={`glass-panel-3d p-6 transition-all hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] ${
                    hasResults ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-lg font-bold capitalize">
                      {TURNOS_LABELS[turno]}
                    </span>
                    {draw && draw.head_number != null && (
                      <span className="badge-3d bg-emerald-500/20 text-emerald-400 font-mono">
                        {draw.head_number.toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>

                  {hasResults ? (
                    <React.Fragment>
                      <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label={`Números sorteo ${turno}`}>
                        {draw!.numbers.slice(0, 20).map((num: number, idx: number) => (
                          <span
                            key={idx}
                            className="number-tile-3d w-10 h-10 text-xs"
                            style={{ animationDelay: `${idx * 30}ms` }}
                          >
                            {num.toString().padStart(2, "0")}
                          </span>
                        ))}
                      </div>
                      <p className="text-slate-500 text-sm">
                        20 números oficiales del sorteo
                      </p>
                    </React.Fragment>
                  ) : (
                    <div className="text-center py-6 text-slate-500">
                      <p className="mb-2">Sorteo pendiente</p>
                      <span className="text-xs">Resultados disponibles tras el sorteo oficial</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {completedDraws.length > 0 && (
            <div className="mt-8 glass-panel-3d p-6">
              <h3 className="font-mono text-lg font-bold mb-4">Análisis Rápido</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-slate-900/50 rounded-xl">
                  <p className="text-slate-500 text-sm">Cabezas del día</p>
                  <p className="font-mono text-2xl font-bold text-emerald-400 mt-1">
                    {completedDraws.map((d: DrawData) => d.head_number?.toString().padStart(2, "0")).join(" · ")}
                  </p>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-xl">
                  <p className="text-slate-500 text-sm">Número más repetido</p>
                  <p className="font-mono text-2xl font-bold text-cyan-400 mt-1">
                    {(() => {
                      const allNumbers = completedDraws.flatMap((d: DrawData) => d.numbers || []);
                      if (allNumbers.length === 0) return "—";
                      const freq: Record<number, number> = {};
                      allNumbers.forEach((n: number) => (freq[n] = (freq[n] || 0) + 1));
                      return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
                    })()}
                  </p>
                </div>
                <div className="p-4 bg-slate-900/50 rounded-xl">
                  <p className="text-slate-500 text-sm">Turnos completados</p>
                  <p className="font-mono text-2xl font-bold text-amber-400 mt-1">
                    {completedDraws.length} / 5
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <nav className="flex justify-center gap-4 mt-10" aria-label="Navegación de fechas">
          <Link href={`/resultado/${prevDate.toISOString().split("T")[0]}`}>
            <Button3D variant="ghost">
              Día Anterior
            </Button3D>
          </Link>
          <Link href={`/resultado/${nextDate.toISOString().split("T")[0]}`}>
            <Button3D variant="ghost">
              Día Siguiente
            </Button3D>
          </Link>
        </nav>
      </main>

      <footer className="border-t border-slate-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          <p>Datos oficiales de Lotería de la Ciudad y Lotería de la Provincia de Buenos Aires.</p>
          <p className="mt-1">
            <a href="/terminos" className="underline hover:text-white">Términos</a>{" "}
            ·{" "}
            <a href="/privacidad" className="underline hover:text-white">Privacidad</a>
          </p>
        </div>
      </footer>
    </div>
  );
}