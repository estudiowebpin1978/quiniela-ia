import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import PredictionPageContent from "../../[fecha]/PredictionPageContent";

// ISR: revalidate every 5 minutes as fallback safety net
export const revalidate = 300;

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
    description: `Predicción para el turno ${turnoLabels[turno] || turno} de la Quiniela Nacional del ${formattedDate}. Análisis de 30 factores estadísticos.`,
    openGraph: {
      title: `Quiniela IA | ${turnoLabels[turno] || turno} ${formattedDate}`,
      description: `Números probables para ${turnoLabels[turno] || turno} del ${formattedDate}`,
      type: "website",
    },
  };
}

export async function generateStaticParams() {
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
}

export default async function PronosticoFechaTurnoPage({ params }: Props) {
  const { fecha, turno } = await params;
  const supabase = getSupabaseAdmin();

  const { data: draws } = await supabase
    .from("draws")
    .select("*")
    .eq("date", fecha)
    .order("turno", { ascending: true });

  if (!draws || draws.length === 0) {
    notFound();
  }

  return <PredictionPageContent fecha={fecha} draws={draws} />;
}