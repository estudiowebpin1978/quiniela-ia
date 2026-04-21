const https = require("https");

const SB = "wazkylxgqckjfkcmfotl.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs";

const PREDICCIONES = [
  { fecha: "2026-04-18", turno: "nocturna", numeros_2: ["32", "31", "48", "42", "84", "22", "15", "91", "38", "77"], estado: "pendiente" },
  { fecha: "2026-04-17", turno: "vespertina", numeros_2: ["45", "67", "23", "89", "11", "56", "34", "78", "90", "12"], estado: "pendiente" },
  { fecha: "2026-04-16", turno: "matutina", numeros_2: ["18", "27", "36", "45", "54", "63", "72", "81", "90", "99"], estado: "pendiente" },
  { fecha: "2026-04-15", turno: "primera", numeros_2: ["01", "13", "25", "37", "49", "51", "63", "75", "87", "99"], estado: "pendiente" },
  { fecha: "2026-04-14", turno: "nocturna", numeros_2: ["02", "15", "28", "31", "44", "57", "60", "73", "86", "99"], estado: "pendiente" },
  { fecha: "2026-04-13", turno: "vespertina", numeros_2: ["05", "19", "33", "47", "51", "65", "79", "83", "97", "00"], estado: "pendiente" },
  { fecha: "2026-04-12", turno: "matutina", numeros_2: ["08", "21", "34", "47", "50", "63", "76", "89", "92", "05"], estado: "pendiente" },
  { fecha: "2026-04-11", turno: "previa", numeros_2: ["11", "24", "37", "40", "53", "66", "79", "82", "95", "08"], estado: "pendiente" },
  { fecha: "2026-04-10", turno: "nocturna", numeros_2: ["14", "27", "30", "43", "56", "69", "72", "85", "98", "01"], estado: "pendiente" },
  { fecha: "2026-04-09", turno: "vespertina", numeros_2: ["17", "20", "33", "46", "59", "62", "75", "88", "91", "04"], estado: "pendiente" },
];

function insert(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: SB,
      path: "/rest/v1/predicciones",
      method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        "Content-Length": body.length
      }
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) {
          console.log("Error inserting:", res.statusCode, d);
          reject(new Error(d));
        } else {
          resolve(d || "OK");
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function seed() {
  console.log("Insertando predicciones de demo...");
  for (const p of PREDICCIONES) {
    try {
      await insert(p);
      console.log(`  Insertado: ${p.fecha} ${p.turno}`);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  console.log("\nDemo completado!");
}

seed().catch(console.error);