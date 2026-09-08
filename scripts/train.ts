/**
 * scripts/train.ts — Entrenamiento del Motor Híbrido Quiniela IA
 * Ejecutado por GitHub Actions cada semana
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TURNOS = ['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'];

async function train() {
  console.log('🚀 Entrenando modelo híbrido...');
  for (const turno of TURNOS) {
    const { data: draws } = await supabase
      .from('draws')
      .select('numeros')
      .eq('turno', turno)
      .order('fecha', { ascending: false })
      .limit(100);

    if (!draws || draws.length < 10) {
      console.log(`⚠️ Datos insuficientes para ${turno}`);
      continue;
    }

    const frec = new Array(100).fill(0);
    draws.forEach((d: any) => {
      (d.numeros || []).forEach((n: number) => frec[n]++);
    });

    const media = frec.reduce((a, b) => a + b) / 100;
    const varianza = frec.reduce((sum, f) => sum + Math.pow(f - media, 2), 0) / 100;
    const zScores = frec.map(f => (f - media) / Math.sqrt(varianza || 1));

    const pesos = new Array(30).fill(1);

    for (let i = 0; i < 100; i++) {
      // Each number i gets its own weights — no more cyclic overwrites
      if (i < 10) {
        pesos[i] = Math.max(0, Math.min(10, (zScores[i] * 0.5 + 1)));
      } else if (i < 20) {
        pesos[i] = Math.max(0, Math.min(10, (frec[i] * 0.1 + 1)));
      } else if (i < 30) {
        pesos[i] = Math.max(0, Math.min(10, (draws.slice(0, 10).some((d: any) => d.numeros?.includes(i)) ? 1.5 : 0.8)));
      }
    }

    await supabase.from('engine_weights').upsert(
      { turno, pesos, actualizado_en: new Date().toISOString() },
      { onConflict: 'turno' }
    );
    console.log(`✅ ${turno} — pesos actualizados`);
  }
  console.log('🏁 Entrenamiento completado');
}

train().catch(console.error);
