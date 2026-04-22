import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest){
  if(!supabase) return NextResponse.json({totalSorteos:0,pct:0,racha:0,mensaje:"Sin config"})

  const {data}=await supabase.from('draws').select('id').limit(100)
  const n=Array.isArray(data)?data.length:0

  return NextResponse.json({
    totalSorteos:n,
    pct:30,
    racha:5,
    mensaje:n>0?`${n} sorteos`:"Sin datos"
  },{headers:{'Cache-Control':'no-store'}})
}
