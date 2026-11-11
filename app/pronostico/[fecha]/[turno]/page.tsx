import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import PredictionPageContent from "../../[fecha]/PredictionPageContent";

// SSR on demand: cada request consulta la DB. Devuelve HTTP 404 real cuando
// no se puede generar la página, y 200 cuando corresponde. Evita el quirk de
// ISR que servía 200 con contenido notFound.
export const revalidate = 0;
export const dynamic = "force-dynamic";
export const dynamicParams = true;

interface Props {
  params: Promise<{ fecha: string; turno: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha, turno } = await params;
  const dateObj = new Date(fecha + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const turnoLabels: Record<string, string> = {
    previa: "Previa",
    primera: "Primera",
    matutina: "Matutina",
    vespertina: "Vespertina",
    nocturna: "Nocturna",
  };

  return {
    title: `Pronóstico Quiniela ${turnoLabels[turno] || turno} ${formattedDate}`,
    description: `Predicción para el turno ${turnoLabels[turno] || turno} de la Quiniela de la Ciudad (ex Nacional) del ${formattedDate}. Análisis de 20 factores estadísticos + Machine Learning.`,
    openGraph: {
      title: `Quiniela IA | ${turnoLabels[turno] || turno} ${formattedDate}`,
      description: `Números probables para ${turnoLabels[turno] || turno} del ${formattedDate}`,
      type: "website",
    },
  };
}

export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data: draws } = await supabase
      .from("draws")
      .select("date, turno")
      .order("date", { ascending: false })
      .limit(90);

    if (!draws) return [];

    return draws.map((draw: { date: string; turno: string }) => ({
      fecha: draw.date,
      turno: draw.turno,
    }));
  } catch {
    return [];
  }
}

const TURNOS_VALIDOS = ["previa", "primera", "matutina", "vespertina", "nocturna"] as const

export default async function PronosticoFechaTurnoPage({ params }: Props) {
  const { fecha, turno } = await params
  const turnoCanonical = turno.toLowerCase()

  if (!TURNOS_VALIDOS.includes(turnoCanonical as (typeof TURNOS_VALIDOS)[number])) {
    notFound()
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    notFound()
  }

  const supabase = getSupabaseAdmin()

  const { data: draws } = await supabase
    .from("draws")
    .select("*")
    .eq("date", fecha)
    .ilike("turno", turnoCanonical)
    .order("turno", { ascending: true });

  if (!draws || draws.length === 0) {
    notFound();
  }

  return <PredictionPageContent fecha={fecha} draws={draws} />;
}