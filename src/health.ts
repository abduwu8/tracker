import http from "node:http";

export function startHealthServer(): http.Server {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    const ok = req.url === "/" || req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "text/plain; charset=utf-8" });
    res.end(ok ? "ok" : "not found");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health server listening on ${port}`);
  });

  return server;
}
