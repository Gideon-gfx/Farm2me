import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler, notFound } from "./middleware/error";
import { prisma } from "./lib/prisma";

const app = express();

// --- Global middleware ---
app.use(helmet());
app.use(cors());
// Capture the raw body so the Monnify webhook route can verify its HMAC signature.
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Global per-IP budget across every route — 300 was too tight for normal
    // usage: FindDriverScreen alone polls every 5s (~180 requests/15min from
    // one screen), and that's before dashboard loads, profile refreshes, or
    // multiple devices sharing a NAT'd IP on the same Wi-Fi.
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "farm2me-backend", time: new Date().toISOString() });
});

// --- API routes ---
app.use("/api", routes);

// --- Error handling ---
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🌾 farm2me-backend listening on http://localhost:${env.port}`);
});

// --- Graceful shutdown ---
async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // server.close() alone waits for every open socket to close on its own —
  // including idle keep-alive connections from mobile clients, which can sit
  // open indefinitely with nothing in flight. That leaves ts-node-dev's
  // respawn (or any other dev-restart) hanging for a long time on every
  // save. Force-closing all sockets immediately is safe here: a restart
  // means clients retry anyway, and this is dev-loop responsiveness, not a
  // production rolling deploy that needs to drain in-flight requests.
  server.closeAllConnections();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export default app;
