import express from "express";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

// Manual .env loader
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key.trim()] = value;
    }
  });
}

// PostgreSQL configuration
const pgConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "password",
  database: process.env.POSTGRES_DB || "divisas_db",
};

const pool = new Pool(pgConfig);

// Server configuration
const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const LOCAL_IP = getLocalIP();
const app = express();

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Health check
app.get("/ping", (req, res) => {
  res.send("pong");
});

// GET /api/divisas — solo códigos de moneda disponibles
app.get("/api/divisas", async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT codigo_moneda
      FROM divisas
      WHERE fecha >= NOW() - INTERVAL '30 days'
      ORDER BY codigo_moneda ASC
    `;

    const result = await pool.query(query);
    const monedas = result.rows.map(row => row.codigo_moneda);

    res.json({ monedas });

  } catch (err) {
    console.error("Error fetching divisas from PostgreSQL:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/tasas-cambio", async (req, res) => {
  try {
    const { fecha } = req.query;

    const ejecutarQuery = async (dateFilter) => {
      const query = `
        SELECT fecha, codigo_moneda, valor_media, num_apis
        FROM divisas
        ${dateFilter}
        ORDER BY fecha DESC, codigo_moneda ASC
      `;

      const result = await pool.query(query);
      const tasas = {};
      const numApis = {};
      let fechaEncontrada = null;

      // Agrupar por moneda y tomar el último registro
      const monedas = new Map();
      for (const row of result.rows) {
        if (!monedas.has(row.codigo_moneda)) {
          monedas.set(row.codigo_moneda, row);
        }
      }

      monedas.forEach((row) => {
        tasas[row.codigo_moneda] = row.valor_media !== null ? Number(row.valor_media) : null;
        numApis[row.codigo_moneda] = row.num_apis !== null ? Number(row.num_apis) : 0;
        if (!fechaEncontrada) fechaEncontrada = row.fecha;
      });

      return { tasas, numApis, fechaEncontrada };
    };

    let resultado = { tasas: {}, numApis: {}, fechaEncontrada: null };

    if (fecha) {
      // Buscar para la fecha específica
      resultado = await ejecutarQuery(
        `WHERE DATE(fecha) = '${fecha}'`
      );
    }

    // Si no hay resultados, buscar en los últimos 30 días
    if (Object.keys(resultado.tasas).length === 0) {
      resultado = await ejecutarQuery(
        `WHERE fecha >= NOW() - INTERVAL '30 days'`
      );
    }

    // Si aún no hay resultados, buscar en el último año
    if (Object.keys(resultado.tasas).length === 0) {
      resultado = await ejecutarQuery(
        `WHERE fecha >= NOW() - INTERVAL '1 year'`
      );
    }

    res.json(resultado);

  } catch (err) {
    console.error("Error fetching tasas de cambio from PostgreSQL:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tasa-cambio", async (req, res) => {
  try {
    const { codigo } = req.query;

    let query = `
      SELECT fecha, codigo_moneda, valor_media, num_apis
      FROM divisas
      WHERE fecha >= NOW() - INTERVAL '30 days'
    `;

    if (codigo) {
      query += ` AND codigo_moneda = $1`;
    }

    query += ` ORDER BY fecha DESC, codigo_moneda ASC`;

    const result = codigo
      ? await pool.query(query, [codigo.toUpperCase()])
      : await pool.query(query);

    const resultados = result.rows.map(row => ({
      codigo_moneda: row.codigo_moneda,
      valor_media: row.valor_media !== null ? Number(row.valor_media) : null,
      num_apis: row.num_apis !== null ? Number(row.num_apis) : null,
      fecha: row.fecha,
    }));

    if (codigo && resultados.length === 0) {
      return res.status(404).json({ error: `Moneda '${codigo.toUpperCase()}' no encontrada` });
    }

    res.json({
      base: "EUR",
      total: resultados.length,
      datos: resultados.sort((a, b) => a.codigo_moneda.localeCompare(b.codigo_moneda)),
    });

  } catch (err) {
    console.error("Error fetching tasa-cambio from PostgreSQL:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("API running on:");
  console.log(`  - Local:   http://localhost:${PORT}`);
  console.log(`  - Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`PostgreSQL: ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
});