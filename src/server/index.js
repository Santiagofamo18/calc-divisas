import express from "express";
import pg from "pg";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

// Manual .env loader (since we cannot change package.json scripts)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts
        .join("=")
        .trim()
        .replace(/^["']|["']$/g, "");
      process.env[key.trim()] = value;
    }
  });
}

// Helper to get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

const LOCAL_IP = getLocalIP();
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = process.env.DB_PORT || 5433;
const DB_NAME = process.env.DB_NAME || "monedas";
const DB_USER = process.env.DB_USER || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD || "postgres";
const PORT = process.env.PORT || 3000;

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/ping", (req, res) => res.send("pong"));

// Database connection
const pool = new Pool({
  host: DB_HOST,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT), // Ensure port is a number
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error("Error al conectar a la base de datos:", err.stack);
  }
  release();
});

app.get("/api/monedas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT codigo FROM monedas ORDER BY codigo",
    );
    res.json(rows.map((row) => row.codigo));
  } catch (err) {
    console.error("Error fetching monedas:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasas-cambio", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (codigo_moneda)
              codigo_moneda,
              valor_media,
              num_apis,
              fecha
       FROM historico_medias
       ORDER BY codigo_moneda, fecha DESC`,
    );

    const tasas = {};
    const numApis = {};
    rows.forEach((row) => {
      tasas[row.codigo_moneda] = parseFloat(row.valor_media);
      numApis[row.codigo_moneda] = row.num_apis;
    });

    res.json({ tasas, numApis });
  } catch (err) {
    console.error("Error fetching tasas-cambio:", err);
    res.status(500).json({ error: err.message });
  }
});



app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on:`);
  console.log(`  - Local:   http://localhost:${PORT}`);
  console.log(`  - Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`Configured for DB: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
});
