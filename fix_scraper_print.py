c = open("scripts/ingest_ruta1000.py", encoding="utf-8").read()
c = c.replace(
    "print(f\"  OK {turno} ({len(nums)} nums): {nums[:5]}\")",
    "print(f\"  OK {turno} ({len(nums)} nums): {nums}\")"
)
open("scripts/ingest_ruta1000.py", "w", encoding="utf-8").write(c)
print("OK")
