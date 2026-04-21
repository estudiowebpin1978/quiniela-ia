const https = require("https");

const SB = "wazkylxgqckjfkcmfotl.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs";

function remove(date) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SB,
      path: `/rest/v1/predicciones?fecha=eq.${date}`,
      method: "DELETE",
      headers: {
        "apikey": KEY,
        "Authorization": `Bearer ${KEY}`
      }
    };
    const req = https.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        console.log(`Deleted ${date}: ${res.statusCode}`);
        resolve(res.statusCode);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function cleanup() {
  const dates = [
    "2026-04-17", "2026-04-16", "2026-04-15", "2026-04-14",
    "2026-04-13", "2026-04-12", "2026-04-11", "2026-04-10", "2026-04-09"
  ];
  
  for (const date of dates) {
    await remove(date);
  }
  
  console.log("\nDemo predictions cleaned!");
}

cleanup().catch(console.error);