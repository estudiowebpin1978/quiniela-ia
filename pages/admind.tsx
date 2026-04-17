import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Admin() {
  const [efectividad, setEfectividad] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("predicciones")
        .select("*");

      const total = data?.length || 0;
      const aciertos =
        data?.filter((d) => d.estado === "acertado").length || 0;

      setEfectividad((aciertos / total) * 100);
    };

    load();
  }, []);

  return <h1>Efectividad: {efectividad.toFixed(2)}%</h1>;
}