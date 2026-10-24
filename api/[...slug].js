import { createApp } from "../server/server.js";

const { server } = createApp({ trustProxy: "on" });

export default function handler(req, res) {
  server.emit("request", req, res);
}
