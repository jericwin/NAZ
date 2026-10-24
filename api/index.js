import { createApp } from "../server/server.js";

const { server } = createApp({ trustProxy: "on" });

export default function handler(req, res) {
  try {
    const parsed = new URL(req.url, "http://x");
    const route = parsed.searchParams.get("__route");
    if (route !== null) {
      parsed.searchParams.delete("__route");
      const search = parsed.search;
      req.url = "/api/" + route + search;
    } else if (req.headers["x-matched-path"] && req.headers["x-matched-path"].startsWith("/api/")) {
      req.url = req.headers["x-matched-path"];
    }
  } catch {
    // Keep req.url as is if parsing fails
  }
  server.emit("request", req, res);
}
