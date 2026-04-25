import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  
  if (secret !== "quiniela_ia_cron_2024_seguro") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const response = await axios.get(
      "https://www.ruta1000.com.ar/timberos_top/wap.php",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 30000,
      }
    );
    
    return NextResponse.json({
      ok: true,
      htmlLength: (response.data as string).length,
      first200: (response.data as string).substring(0, 200),
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message,
    }, { status: 500 });
  }
}