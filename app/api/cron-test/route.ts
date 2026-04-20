import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const URL = "https://quinielanacional1.com.ar";
const HORAS_VALIDAS = [10, 12, 15, 18, 21];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const dateParam = req.nextUrl.searchParams.get("date");
  const force = req.nextUrl.searchParams.get("force");

  // Always return something visible in response so we can debug
  const debugInfo = {
    received_secret: secret ? "yes" : "no",
    received_date: dateParam,
    env_cron_secret: process.env.CRON_SECRET ? "set" : "not_set",
    match: secret === process.env.CRON_SECRET
  };

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ 
      error: "unauthorized", 
      debug: debugInfo 
    }, { status: 401 });
  }

  try {
    const ahora = new Date();
    const hora = ahora.getHours();
    const currentDate = ahora.toISOString().split("T")[0];

    // Check if we should run
    const shouldRun = dateParam || HORAS_VALIDAS.includes(hora);
    
    // Return what we're doing in the response
    return NextResponse.json({
      debug: {
        ...debugInfo,
        dateParam: dateParam || null,
        currentDate: currentDate,
        hora: hora,
        HORAS_VALIDAS: HORAS_VALIDAS,
        shouldRun: shouldRun,
        isDateParamTruthy: !!dateParam,
        isHoraValid: HORAS_VALIDAS.includes(hora)
      },
      message: shouldRun ? "WILL SCRAPE" : "WILL SKIP"
    });

  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}