import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "./config.js";

const client = new pg.Client({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const sql = await readFile(path.resolve("schema.sql"), "utf8");
await client.query(sql);
await client.end();
console.log("Supabase schema is ready.");
