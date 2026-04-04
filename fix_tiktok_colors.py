c = open("app/predictions/page.tsx", encoding="utf-8").read()

# Reemplazar paleta de colores a TikTok exacto
replacements = [
    # Background principal - negro puro TikTok
    ("background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(255,45,85,.12),transparent 50%),radial-gradient(ellipse 60% 30% at 80% 80%,rgba(32,213,236,.05),transparent 50%),var(--dark)",
     "background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(254,44,85,.08),transparent 50%),#010101"),

    # Root colors
    (":root{--red:#ff2d55;--cyan:#20d5ec;--dark:#06080f;--card:#0e0b1a;--t:#f1f5f9;--dim:#94a3b8}",
     ":root{--red:#FE2C55;--cyan:#25F4EE;--dark:#010101;--card:#0d0d0d;--t:#FFFFFF;--dim:#94a3b8}"),

    # Nav border
    ("border-bottom:1.5px solid rgba(255,45,85,.15);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 20px rgba(255,45,85,.08)}",
     "border-bottom:1px solid rgba(255,255,255,.08);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;}"),

    # Logo ni
    ("background:linear-gradient(135deg,#ff2d55,#cc0033);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 0 #800020}",
     "background:linear-gradient(135deg,#FE2C55,#aa0030);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 0 #700020}"),

    # App name gradient
    ("background:linear-gradient(135deg,#ff6b81,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}",
     "background:linear-gradient(135deg,#ff7090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}"),

    # Hero h1
    ("background:linear-gradient(135deg,#fff5f7,#ff6b81,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;line-height:1.1;letter-spacing:-1px}",
     "background:linear-gradient(135deg,#FFFFFF,#ff7090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;line-height:1.1;letter-spacing:-1px}"),

    # Sorteo button active
    (".sb.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:rgba(37,244,238,.8);box-shadow:0 5px 0 #006080,0 6px 20px rgba(32,213,236,.5);font-size:13px}",
     ".sb.on{background:linear-gradient(180deg,#25F4EE,#00c8c0);color:#000;border-color:rgba(37,244,238,.9);box-shadow:0 5px 0 #007070,0 6px 20px rgba(37,244,238,.4);font-size:13px}"),

    # Sorteo button bg
    (".sb{padding:13px 4px 10px;border-radius:13px;background:linear-gradient(180deg,#1a1a2e,#0d0d1f);",
     ".sb{padding:13px 4px 10px;border-radius:13px;background:linear-gradient(180deg,#1a1a1a,#0d0d0d);"),

    # Btn gen
    (".btn-gen{padding:18px 24px;font-size:16px;letter-spacing:.3px;background:linear-gradient(135deg,#ff2d55,#ff5c75);color:#fff;box-shadow:0 6px 0 #a0001e,0 8px 28px rgba(255,45,85,.45),inset 0 1px 0 rgba(255,255,255,.2)}",
     ".btn-gen{padding:18px 24px;font-size:16px;letter-spacing:.3px;background:linear-gradient(135deg,#FE2C55,#ff5070);color:#fff;box-shadow:0 6px 0 #900020,0 8px 28px rgba(254,44,85,.45),inset 0 1px 0 rgba(255,255,255,.15)}"),

    # Btn prem
    (".btn-prem{padding:14px 20px;font-size:13px;background:linear-gradient(135deg,#20d5ec,#00a8c8);color:#001a20;box-shadow:0 5px 0 #006080,0 7px 20px rgba(32,213,236,.35)}",
     ".btn-prem{padding:14px 20px;font-size:13px;background:linear-gradient(135deg,#25F4EE,#00c8c0);color:#000;box-shadow:0 5px 0 #007070,0 7px 20px rgba(37,244,238,.35)}"),

    # Number cards background
    (".cd{background:linear-gradient(145deg,#1e0f22,#100b18);border:1.5px solid rgba(255,45,85,.2);",
     ".cd{background:linear-gradient(145deg,#1a1a1a,#0f0f0f);border:1.5px solid rgba(254,44,85,.2);"),

    # Number gradient
    (".cn{font-size:clamp(24px,6vw,36px);font-weight:900;background:linear-gradient(135deg,#ffb3c1,#ff2d55);",
     ".cn{font-size:clamp(24px,6vw,36px);font-weight:900;background:linear-gradient(135deg,#ff9090,#FE2C55);"),

    # Rdbl section
    (".rdbl{background:rgba(32,213,236,.04);border:1px solid rgba(32,213,236,.18);border-radius:14px;padding:16px;margin-bottom:12px}",
     ".rdbl{background:rgba(37,244,238,.04);border:1px solid rgba(37,244,238,.2);border-radius:14px;padding:16px;margin-bottom:12px}"),

    # Rdbl pair color
    (".rpair{font-size:36px;font-weight:900;background:linear-gradient(135deg,#25f4ee,#20d5ec);",
     ".rpair{font-size:36px;font-weight:900;background:linear-gradient(135deg,#25F4EE,#69C9D0);"),

    # Tabs active
    (".tb-pred.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;border-color:#ff2d55;box-shadow:0 4px 0 #800020}",
     ".tb-pred.on{background:linear-gradient(180deg,#FE2C55,#cc0030);color:#fff;border-color:#FE2C55;box-shadow:0 4px 0 #800020}"),

    (".tb-rdbl.on{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;border-color:#20d5ec;box-shadow:0 4px 0 #006080}",
     ".tb-rdbl.on{background:linear-gradient(180deg,#25F4EE,#00c0b8);color:#000;border-color:#25F4EE;box-shadow:0 4px 0 #007070}"),

    # Pay box
    (".pay-box{margin-top:24px;background:linear-gradient(135deg,rgba(32,213,236,.06),rgba(0,168,200,.03));border:1.5px solid rgba(32,213,236,.2);",
     ".pay-box{margin-top:24px;background:linear-gradient(135deg,rgba(37,244,238,.05),rgba(0,192,184,.03));border:1.5px solid rgba(37,244,238,.2);"),

    # Pay alias
    (".pay-alias{padding:10px 14px;background:rgba(32,213,236,.08);border:1px solid rgba(32,213,236,.2);border-radius:10px;font-size:14px;font-weight:900;color:#20d5ec;letter-spacing:2px;margin-bottom:8px}",
     ".pay-alias{padding:10px 14px;background:rgba(37,244,238,.08);border:1px solid rgba(37,244,238,.2);border-radius:10px;font-size:14px;font-weight:900;color:#25F4EE;letter-spacing:2px;margin-bottom:8px}"),

    # Heatmap colors
    ('if(r>.75)return{bg:"rgba(255,45,85,.25)",bd:"rgba(255,45,85,.5)"};if(r>.55)return{bg:"rgba(32,213,236,.15)",bd:"rgba(32,213,236,.4)"}',
     'if(r>.75)return{bg:"rgba(254,44,85,.25)",bd:"rgba(254,44,85,.5)"};if(r>.55)return{bg:"rgba(37,244,238,.15)",bd:"rgba(37,244,238,.4)"}'),

    # SC stat values
    (".sv{font-size:20px;font-weight:900;background:linear-gradient(135deg,#ff6b81,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}",
     ".sv{font-size:20px;font-weight:900;background:linear-gradient(135deg,#ff9090,#FE2C55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}"),

    # SC cards bg
    (".sc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 8px;text-align:center;backdrop-filter:blur(10px)}",
     ".sc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 8px;text-align:center}"),

    # Tab sorteo bg
    (".sb:hover:not(.on){background:linear-gradient(180deg,#0d2a2e,#081a1e);color:#20d5ec;border-color:rgba(32,213,236,.2)}",
     ".sb:hover:not(.on){background:linear-gradient(180deg,#1a1a1a,#111);color:#25F4EE;border-color:rgba(37,244,238,.2)}"),

    # dk-2 btn
    (".dk-2{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;box-shadow:0 5px 0 #800020}",
     ".dk-2{background:linear-gradient(180deg,#FE2C55,#cc0030);color:#fff;box-shadow:0 5px 0 #800020}"),

    # dk-3 btn
    (".dk-3{background:linear-gradient(180deg,#20d5ec,#00a8c8);color:#001a20;box-shadow:0 5px 0 #006080}",
     ".dk-3{background:linear-gradient(180deg,#25F4EE,#00c0b8);color:#000;box-shadow:0 5px 0 #007070}"),
]

count = 0
for old, new in replacements:
    if old in c:
        c = c.replace(old, new, 1)
        count += 1
    else:
        print(f"No encontrado: {old[:50]}")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
print(f"OK - {count}/{len(replacements)} reemplazos aplicados")
