c = open("app/predictions/page.tsx", encoding="utf-8").read()

old = """      const hoy=new Date(Date.now()-3*3600000).toISOString().split("T")[0]
      const r=await fetch(`/api/predictions?sorteo=${encodeURIComponent(so)}`,{headers:{Authorization:"Bearer "+tkRef.current}})
      const d=await r.json()
      // Buscar resultado real en la DB
      const r2=await fetch(`${(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/"/g,"")}/rest/v1/draws?date=eq.${hoy}&turno=eq.${encodeURIComponent(so)}&select=numbers&limit=1`,{
        headers:{"apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"","Authorization":"Bearer "+(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"")}
      })
      const draws=await r2.json()
      const draw=draws?.[0]
      if(!draw?.numbers?.length){
        setResultadoControl({error:"Todavia no hay resultado para este sorteo. Intentá después del sorteo."})
        return
      }
      const reales=draw.numbers.map((n:any)=>String(Number(n)%100).padStart(2,"0"))"""

new = """      const hoy=new Date(Date.now()-3*3600000).toISOString().split("T")[0]
      // Buscar resultado real via API
      const r2=await fetch(`/api/resultado?date=${hoy}&turno=${encodeURIComponent(so)}`)
      const drawData=await r2.json()
      if(!drawData?.found||!drawData?.numbers?.length){
        setResultadoControl({error:"Todavia no hay resultado para este sorteo. Los crons cargan los datos 30 minutos despues de cada sorteo."})
        return
      }
      const reales=drawData.numbers.map((n:any)=>String(Number(n)%100).padStart(2,"0"))"""

if old in c:
    c = c.replace(old, new, 1)
    print("OK - controlar jugada usa API route")
else:
    print("ERROR - no encontrado")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
