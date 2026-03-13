import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get('sorteo') ?? 'Todos';
  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/"/g,'').trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').replace(/"/g,'').trim();
  if (!SB_URL || !S@_KEY) return NextResponse.json({ error: 'Variables no configuradas' }, { status: 500 });
  const since = new Date(Date.now() - 365*86400000).toISOString().split('T')[0];
  let url = `${SB_URL}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`;
  if (sorteo !== 'Todos') url += `&turno=eq.${encodeURIComponent(sorteo)}`;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }, signal: controller.signal });
    if (!res.ok) return NextResponse.json({ error: `DB error: ${await res.text()}` }, { status: 500 });
    const rows = await res.json();
    if (!rows?.length) return NextResponse.json({ predictions:[], predictions3d:[], predictions4d:[], redoblona:[], frequencyData:[], totalDraws:0, sorteo, message:'Sin datos' });
    const freq = Array(100).fill(0);
    const first = Array(100).fill(0);
    const redoblonaCount: Record<number,number> = {};
    for (const row of rows) {
      const nums: number[] = Array.isArray(row.numbers) ? row.numbers : [];
      const seen = new Set<number>();
      nums.forEach((n,i) => {
        const t = Number(n) % 100;
        freq[t]++;
        if (i === 0) first[t]++;
        if (seen.has(t)) redoblonaCount[t] = (redoblonaCount[t] ?? 0) + 1;
        seen.add(t);
      });
    }
    const total = freq.reduce((a,b) => a+b, 0) || 1;
    const frequencyData = freq.map((count,num) => ({ num, total_appearances: count, first_place_count: first[num], frequency_ratio: count/total }));
    const scored = frequencyData.map(r => ({ num: r.num, score: r.total_appearances + r.first_place_count * 3 })).sort((a,b) => b.score - a.score);
    const top5 = scored.slice(0,5);
    const pad = (n:number, l=2) => String(n).padStart(l,'0');
    const redoblona = Object.entries(redoblonaCount).map(([n,c]) => ({ num: pad(parseInt(n)), redoblonaCount:c, totalFreq: freq[parseInt(n)] })).sort((a,b) => b.redoblonaCount - a.redoblonaCount).slice(0,5);
    return NextResponse.json({ predictions: top5.map(x => pad(x.num)), predictions3d: top5.map((x,i) => pad(((i*3+1)%10)*100 + x.num, 3)), predictions4d: top5.map((x,i) => pad(((i*7+13)%100)*100 + x.num, 4)), redoblona, frequencyData, totalDraws: rows.length, sorteo, generatedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = (e as Error)?.name === 'AbortError' ? 'Timeout' : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}