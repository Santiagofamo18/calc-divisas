import express from "express";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { InfluxDB } from "@influxdata/influxdb-client";

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

// InfluxDB configuration
const url = process.env.INFLUXDB_URL || "http://localhost:8086";
const token = process.env.INFLUXDB_TOKEN || "my-token";
const org = process.env.INFLUXDB_ORG || "my-org";
const bucket = process.env.INFLUXDB_BUCKET || "my-bucket";

const influxClient = new InfluxDB({ url, token });
const queryApi = influxClient.getQueryApi(org);

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
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "divisas")
        |> filter(fn: (r) => r._field == "Valor_media")
        |> keep(columns: ["Codigo_moneda"])
        |> distinct(column: "Codigo_moneda")
    `;

    const monedas = [];

    await new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          if (obj._value) monedas.push(obj._value);
        },
        error: reject,
        complete: resolve,
      });
    });

    res.json({ monedas: monedas.sort() });

  } catch (err) {
    console.error("Error fetching divisas from InfluxDB:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/monedas — alias compatible para la vista frontend
app.get("/api/monedas", async (req, res) => {
  try {
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "divisas")
        |> filter(fn: (r) => r._field == "Valor_media")
        |> keep(columns: ["Codigo_moneda"])
        |> distinct(column: "Codigo_moneda")
    `;

    const monedas = [];

    await new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          if (obj._value) monedas.push(obj._value);
        },
        error: reject,
        complete: resolve,
      });
    });

    res.json(monedas.sort());

  } catch (err) {
    console.error("Error fetching monedas from InfluxDB:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasas-cambio — alias compatible para la vista frontend
app.get("/api/tasas-cambio", async (req, res) => {
  try {
    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "divisas")
        |> last()
        |> pivot(rowKey: ["_time", "Codigo_moneda"], columnKey: ["_field"], valueColumn: "_value")
        |> keep(columns: ["_time", "Codigo_moneda", "Valor_media", "Num_apis"])
    `;

    const tasas = {};
    const numApis = {};

    await new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          if (obj.Codigo_moneda) {
            tasas[obj.Codigo_moneda] = obj.Valor_media !== undefined ? Number(obj.Valor_media) : null;
            numApis[obj.Codigo_moneda] = obj.Num_apis !== undefined ? Number(obj.Num_apis) : 0;
          }
        },
        error: reject,
        complete: resolve,
      });
    });

    res.json({ tasas, numApis });

  } catch (err) {
    console.error("Error fetching tasas de cambio from InfluxDB:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasa-cambio — información completa de todas las monedas
// GET /api/tasa-cambio?codigo=USD — información de una moneda concreta
app.get("/api/tasa-cambio", async (req, res) => {
  try {
    const { codigo } = req.query;

    const filtroMoneda = codigo
      ? `|> filter(fn: (r) => r.Codigo_moneda == "${codigo.toUpperCase()}")`
      : "";

    const fluxQuery = `
      from(bucket: "${bucket}")
        |> range(start: -30d)
        |> filter(fn: (r) => r._measurement == "divisas")
        ${filtroMoneda}
        |> last()
        |> pivot(rowKey: ["_time", "Codigo_moneda"], columnKey: ["_field"], valueColumn: "_value")
        |> keep(columns: ["_time", "Codigo_moneda", "Valor_media", "Num_apis"])
    `;

    const resultados = [];

    await new Promise((resolve, reject) => {
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const obj = tableMeta.toObject(row);
          resultados.push({
            codigo_moneda: obj.Codigo_moneda,
            valor_media: obj.Valor_media !== undefined ? Number(obj.Valor_media) : null,
            num_apis: obj.Num_apis !== undefined ? Number(obj.Num_apis) : null,
            fecha: obj._time,
          });
        },
        error: reject,
        complete: resolve,
      });
    });

    if (codigo && resultados.length === 0) {
      return res.status(404).json({ error: `Moneda '${codigo.toUpperCase()}' no encontrada` });
    }

    res.json({
      base: "EUR",
      total: resultados.length,
      datos: resultados.sort((a, b) => a.codigo_moneda.localeCompare(b.codigo_moneda)),
    });

  } catch (err) {
    console.error("Error fetching tasa-cambio from InfluxDB:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("API running on:");
  console.log(`  - Local:   http://localhost:${PORT}`);
  console.log(`  - Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`InfluxDB: ${url}`);
  console.log(`Org: ${org}`);
  console.log(`Bucket: ${bucket}`);
});