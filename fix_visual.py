c = open("app/predictions/page.tsx", encoding="utf-8").read()

old_style = """      *{box-sizing:border-box;margin:0;padding:0}
      :root{--red:#ff2d55;--cyan:#20d5ec;--dark:#06080f;--card:#0e0b1a;--t:#e2e8f0;--dim:#64748b}
      body{background:var(--dark);color:var(--t);font-family:'Inter',sans-serif;min-height:100vh}
      .app{min-height:100vh;background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(255,45,85,.08),transparent 50%),var(--dark)}"""

new_style = """      *{box-sizing:border-box;margin:0;padding:0}
      :root{--red:#ff2d55;--cyan:#20d5ec;--dark:#06080f;--card:#0e0b1a;--t:#f1f5f9;--dim:#94a3b8}
      body{background:var(--dark);color:var(--t);font-family:'Inter',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
      .app{min-height:100vh;background:radial-gradient(ellipse 80% 40% at 50% -5%,rgba(255,45,85,.12),transparent 50%),radial-gradient(ellipse 60% 30% at 80% 80%,rgba(32,213,236,.05),transparent 50%),var(--dark)}"""

if old_style in c:
    c = c.replace(old_style, new_style, 1)
    print("OK bg")

# Mejorar nav
old_nav = ".nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.96);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06);padding:11px 16px;display:flex;align-items:center;justify-content:space-between}"
new_nav = ".nav{position:sticky;top:0;z-index:100;background:rgba(6,8,15,.98);backdrop-filter:blur(24px);border-bottom:1.5px solid rgba(255,45,85,.15);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 20px rgba(255,45,85,.08)}"
if old_nav in c:
    c = c.replace(old_nav, new_nav, 1)
    print("OK nav")

# Mejorar hero title
old_h1 = ".hero h1{font-size:clamp(24px,6vw,44px);font-weight:900;background:linear-gradient(135deg,#ff6b81,#ff2d55,#cc0033);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px;line-height:1.1}"
new_h1 = ".hero h1{font-size:clamp(26px,7vw,48px);font-weight:900;background:linear-gradient(135deg,#fff5f7,#ff6b81,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px;line-height:1.1;letter-spacing:-1px}"
if old_h1 in c:
    c = c.replace(old_h1, new_h1, 1)
    print("OK h1")

# Mejorar hero p
old_hp = ".hero p{color:var(--dim);font-size:12px;max-width:320px;margin:0 auto 16px;line-height:1.6}"
new_hp = ".hero p{color:#94a3b8;font-size:13px;max-width:340px;margin:0 auto 16px;line-height:1.7;font-weight:400}"
if old_hp in c:
    c = c.replace(old_hp, new_hp, 1)
    print("OK hero p")

# Mejorar stats cards
old_sc = ".sc{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 6px;text-align:center}"
new_sc = ".sc{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 8px;text-align:center;backdrop-filter:blur(10px)}"
if old_sc in c:
    c = c.replace(old_sc, new_sc, 1)
    print("OK sc")

old_sv = ".sv{font-size:18px;font-weight:900;color:#ff2d55}"
new_sv = ".sv{font-size:20px;font-weight:900;background:linear-gradient(135deg,#ff6b81,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent}"
if old_sv in c:
    c = c.replace(old_sv, new_sv, 1)
    print("OK sv")

old_sl = ".sl{font-size:9px;color:var(--dim);margin-top:2px}"
new_sl = ".sl{font-size:10px;color:#64748b;margin-top:3px;font-weight:500;letter-spacing:.3px}"
if old_sl in c:
    c = c.replace(old_sl, new_sl, 1)
    print("OK sl")

# Mejorar sorteo buttons
old_sb = ".sb{padding:11px 2px 8px;border-radius:12px;background:linear-gradient(180deg,#1e1e2e,#12121e);color:#475569;border:1.5px solid rgba(255,255,255,.07);box-shadow:0 4px 0 #050508;cursor:pointer;font-family:'Inter',sans-serif;font-weight:700;font-size:10px;text-align:center;transition:.1s;display:flex;flex-direction:column;align-items:center;gap:3px;user-select:none}"
new_sb = ".sb{padding:12px 2px 9px;border-radius:13px;background:linear-gradient(180deg,#1a1a2e,#0d0d1f);color:#64748b;border:1.5px solid rgba(255,255,255,.08);box-shadow:0 5px 0 #03030a,0 6px 15px rgba(0,0,0,.4);cursor:pointer;font-family:'Inter',sans-serif;font-weight:700;font-size:11px;text-align:center;transition:.12s;display:flex;flex-direction:column;align-items:center;gap:4px;user-select:none;letter-spacing:.2px}"
if old_sb in c:
    c = c.replace(old_sb, new_sb, 1)
    print("OK sb")

old_sb_on = ".sb.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;border-color:#ff2d55;box-shadow:0 4px 0 #800020,0 5px 16px rgba(255,45,85,.4)}"
new_sb_on = ".sb.on{background:linear-gradient(180deg,#ff2d55,#cc0033);color:#fff;border-color:rgba(255,107,129,.6);box-shadow:0 5px 0 #800020,0 6px 20px rgba(255,45,85,.5)}"
if old_sb_on in c:
    c = c.replace(old_sb_on, new_sb_on, 1)
    print("OK sb.on")

# Mejorar btn-gen
old_gen = ".btn-gen{padding:17px 24px;font-size:16px;background:linear-gradient(135deg,#ff2d55,#ff6b81);color:#fff;box-shadow:0 6px 0 #a0001e,0 8px 24px rgba(255,45,85,.4)}"
new_gen = ".btn-gen{padding:18px 24px;font-size:16px;letter-spacing:.3px;background:linear-gradient(135deg,#ff2d55,#ff5c75);color:#fff;box-shadow:0 6px 0 #a0001e,0 8px 28px rgba(255,45,85,.45),inset 0 1px 0 rgba(255,255,255,.2)}"
if old_gen in c:
    c = c.replace(old_gen, new_gen, 1)
    print("OK btn-gen")

# Mejorar number cards
old_cd = ".cd{background:linear-gradient(145deg,#1a0f1e,#0e0b16);border:1.5px solid rgba(255,45,85,.18);border-radius:13px;padding:13px 3px 9px;text-align:center;position:relative;box-shadow:0 4px 0 #060108,0 6px 16px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);transition:.15s;cursor:default}"
new_cd = ".cd{background:linear-gradient(145deg,#1e0f22,#100b18);border:1.5px solid rgba(255,45,85,.2);border-radius:14px;padding:15px 3px 10px;text-align:center;position:relative;box-shadow:0 5px 0 #060108,0 8px 20px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);transition:.2s;cursor:default}"
if old_cd in c:
    c = c.replace(old_cd, new_cd, 1)
    print("OK cd")

# Mejorar numero font size
old_cn = ".cn{font-size:clamp(20px,4vw,30px);font-weight:900;background:linear-gradient(135deg,#ff9999,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:3px}"
new_cn = ".cn{font-size:clamp(22px,5vw,32px);font-weight:900;background:linear-gradient(135deg,#ffb3c1,#ff2d55);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;margin-bottom:4px;letter-spacing:-1px}"
if old_cn in c:
    c = c.replace(old_cn, new_cn, 1)
    print("OK cn")

# Mejorar significado
old_cs = ".cs{font-size:8px;color:#ff6b81;opacity:.8;padding:0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
new_cs = ".cs{font-size:9px;color:#ff9999;font-weight:500;padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}"
if old_cs in c:
    c = c.replace(old_cs, new_cs, 1)
    print("OK cs")

# Mejorar tabs
old_tb = ".tb{flex:1;min-width:80px;padding:9px 6px;text-align:center;border-radius:8px;border:none;background:transparent;color:#475569;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transition:.15s}"
new_tb = ".tb{flex:1;min-width:80px;padding:10px 6px;text-align:center;border-radius:9px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:'Inter',sans-serif;transition:.15s;letter-spacing:.2px}"
if old_tb in c:
    c = c.replace(old_tb, new_tb, 1)
    print("OK tb")

old_tb_on = ".tb.on{background:linear-gradient(135deg,rgba(255,45,85,.15),rgba(204,0,51,.1));color:#ff6b81;border:1px solid rgba(255,45,85,.25)}"
new_tb_on = ".tb.on{background:linear-gradient(135deg,rgba(255,45,85,.18),rgba(204,0,51,.12));color:#ff6b81;border:1px solid rgba(255,45,85,.3);font-weight:700}"
if old_tb_on in c:
    c = c.replace(old_tb_on, new_tb_on, 1)
    print("OK tb.on")

# Mejorar ibox
old_ibox = ".ibox{background:rgba(255,45,85,.04);border:1px solid rgba(255,45,85,.12);border-radius:9px;padding:9px 12px;font-size:10px;color:var(--dim);line-height:1.8;margin-top:10px}"
new_ibox = ".ibox{background:rgba(255,45,85,.05);border:1px solid rgba(255,45,85,.15);border-radius:10px;padding:10px 14px;font-size:11px;color:#94a3b8;line-height:1.8;margin-top:10px}"
if old_ibox in c:
    c = c.replace(old_ibox, new_ibox, 1)
    print("OK ibox")

# Mejorar redoblona pair
old_rpair = ".rpair{font-size:32px;font-weight:900;color:#20d5ec;text-align:center;letter-spacing:6px;margin:8px 0}"
new_rpair = ".rpair{font-size:36px;font-weight:900;background:linear-gradient(135deg,#25f4ee,#20d5ec);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-align:center;letter-spacing:8px;margin:10px 0}"
if old_rpair in c:
    c = c.replace(old_rpair, new_rpair, 1)
    print("OK rpair")

# Mejorar pay box
old_pay = ".pay-box{margin-top:24px;background:rgba(32,213,236,.04);border:1px solid rgba(32,213,236,.15);border-radius:16px;padding:20px 16px;text-align:center}"
new_pay = ".pay-box{margin-top:24px;background:linear-gradient(135deg,rgba(32,213,236,.06),rgba(0,168,200,.03));border:1.5px solid rgba(32,213,236,.2);border-radius:18px;padding:24px 18px;text-align:center;box-shadow:0 8px 32px rgba(32,213,236,.08)}"
if old_pay in c:
    c = c.replace(old_pay, new_pay, 1)
    print("OK pay")

# Mejorar footer credit
old_credit = ".credit{font-size:10px;color:#475569;margin-top:8px}"
new_credit = ".credit{font-size:11px;color:#475569;margin-top:10px;letter-spacing:.3px}"
if old_credit in c:
    c = c.replace(old_credit, new_credit, 1)
    print("OK credit")

open("app/predictions/page.tsx", "w", encoding="utf-8").write(c)
