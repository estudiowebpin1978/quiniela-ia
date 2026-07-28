import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-client";
import PredictionPageContent from "./PredictionPageContent";

interface Props {
  params: Promise<{ fecha: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fecha } = await params;
  const dateObj = new Date(fecha + "T00:00:00");
  const formattedDate = dateObj.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    title: `Pronóstico Quiniela Nacional ${formattedDate}`,
    description: `Predicciones estadísticas para la Quiniela Nacional (Ciudad y Provincia) del ${formattedDate}. Análisis de 30 factores para 2, 3 y 4 cifras en todos los turnos.`,
    openGraph: {
      title: `Quiniela IA | Pronóstico ${formattedDate}`,
      description: `Números probables para la Quiniela Nacional del ${formattedDate}`,
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
    .limit(90);

  if (!draws) return [];

  return draws.map((draw) => ({
    fecha: draw.date,
  }));
}

export default async function PronosticoFechaPage({ params }: Props) {
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

  return <PredictionPageContent fecha={fecha} draws={draws} />;
}