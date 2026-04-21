const https = require("https");

const SB = "wazkylxgqckjfkcmfotl.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs";

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : undefined;
    const options = {
      hostname: SB,
      path: path,
      method: method,
      headers: {
        "apikey": KEY,
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        ...(body && { "Content-Length": body.length })
      }
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode >= 400) {
          console.log("Error:", res.statusCode, d);
          reject(new Error(d));
        } else {
          resolve(d || "OK");
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function setup() {
  console.log("1. Agregando columna user_id a predicciones...");
  
  try {
    await request("PATCH", "/rest/v1/predicciones?user_id=is.null", {
      user_id: "temp"
    });
    console.log("Columna user_id verificada/creada");
  } catch (e) {
    console.log("Intento alternativo...");
  }

  console.log("2. Creando tabla usuarios_free...");
  try {
    await request("POST", "/rest/v1/usuarios_free", {
      email: "nataliabenitez885@gmail.com",
      plan: "free"
    });
    console.log("Usuario 1 creado");
  } catch (e) {
    console.log("Tabla usuarios_free:", e.message);
  }

  console.log("\n3. Verificando tablas...");
  try {
    const res = await request("GET", "/rest/v1/predicciones?limit=1", null);
    console.log("predicciones:", res);
  } catch (e) {}

  console.log("\nSetup completo!");
}

setup().catch(console.error);