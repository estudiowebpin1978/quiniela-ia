const https = require("https");

const SB = "wazkylxgqckjfkcmfotl.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs";

const EMAILS = [
  "nataliabenitez885@gmail.com",
  "zarzakeylavalentina@gmail.com",
  "gpstoyota2024@gmail.com",
  "jonatanroza125@gmail.com",
  "roomill3108@gmail.com",
  "adrianebarros1989@gmail.com",
  "moreiradaniel676@gmail.com",
  "kiaraabigailcarrizo@gmail.com",
  "margaritarojas1984@gmail.com",
  "nazarenovega211@gmail.com",
  "roxana311@live.com",
  "estefabaldo351@gmail.com",
  "milagros.rueda.99@gmail.com",
  "hernandeaguirre1@gmail.com",
  "milagrosbenegas872@gmail.com",
  "tinchochichon41@gmail.com",
  "remisesrosarionorte@gmail.com",
  "georchina348@gmail.com",
  "deep666web@gmail.com"
];

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: SB,
      path: path,
      method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
        "Content-Length": body.length
      }
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function createUsers() {
  console.log("Creando usuarios free en Supabase Auth...\n");
  
  for (const email of EMAILS) {
    const password = "Quiniela2024Free";
    try {
      const res = await post("/auth/v1/admin/users", {
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          plan: "free"
        }
      });
      
      if (res.status === 201 || res.status === 200) {
        console.log(`✓ ${email} - Creado`);
      } else if (res.body.includes("already exists")) {
        console.log(`~ ${email} - Ya existe`);
      } else {
        console.log(`✗ ${email} - Error: ${res.status}`);
      }
    } catch (e) {
      console.log(`✗ ${email} - ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log("\nUsuarios creados!");
  console.log("\nContraseña para todos: Quiniela2024Free");
}

createUsers().catch(console.error);