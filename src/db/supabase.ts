import { createClient } from "@supabase/supabase-js";
import Ws from "ws";
import { config } from "../config.js";

const WebSocketImpl =
  typeof globalThis.WebSocket === "function"
    ? globalThis.WebSocket
    : (Ws as unknown as typeof globalThis.WebSocket);

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocketImpl;
}

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocketImpl },
});
