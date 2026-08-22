import type { Express } from "express";
import type { Server } from "node:http";
import { sendBroadcastSchema, type WatiContact } from "../shared/schema";

// WATI credentials — provided by user
const WATI_BEARER =
  process.env.WATI_BEARER ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkZWxpbmVAdGhlbmV4dGx2bC5jbyIsIm5hbWVpZCI6ImFkZWxpbmVAdGhlbmV4dGx2bC5jbyIsImVtYWlsIjoiYWRlbGluZUB0aGVuZXh0bHZsLmNvIiwiYXV0aF90aW1lIjoiMDUvMDgvMjAyNiAxMjoyMTo0MCIsInRlbmFudF9pZCI6Ijg2ODYiLCJkYl9uYW1lIjoibXQtcHJvZC1UZW5hbnRzIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjoiQURNSU5JU1RSQVRPUiIsImV4cCI6MjUzNDAyMzAwODAwLCJpc3MiOiJDbGFyZV9BSSIsImF1ZCI6IkNsYXJlX0FJIn0.p3UZeY9VaroqfLLjidtwGovbFDlL5kU_syFXy9cn27k";
const WATI_BASE_URL = "https://live-mt-server.wati.io/8686";

// Safety: when WATI_MOCK is set, do NOT call the real WATI API for ANY contact.
// Every send short-circuits to a mock OK so QA never hits live infrastructure.
const WATI_MOCK = process.env.WATI_MOCK === "1" || process.env.WATI_MOCK === "true";

type SendOutcome = {
  whatsappNumber: string;
  name: string;
  ok: boolean;
  error?: string;
  response?: any;
};

async function sendOneContact(
  contact: WatiContact,
  templateName: string,
  broadcastName: string,
): Promise<SendOutcome> {
  const wa = `${contact.countryCode}${contact.phone}`.replace(/\D/g, "");

  // Safety guard: in mock mode, never call the live WATI endpoint.
  if (WATI_MOCK) {
    return {
      whatsappNumber: wa,
      name: contact.name,
      ok: true,
      response: { result: true, mocked: true, info: "WATI_MOCK enabled" },
    };
  }

  const url = `${WATI_BASE_URL}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(
    wa,
  )}`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WATI_BEARER}`,
        "Content-Type": "application/json-patch+json",
        Accept: "*/*",
      },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: broadcastName,
        parameters: [{ name: "name", value: contact.name || "there" }],
      }),
    });
    const text = await r.text();
    let body: any = text;
    try {
      body = JSON.parse(text);
    } catch {}

    const success = r.ok && body?.result === true;
    return {
      whatsappNumber: wa,
      name: contact.name,
      ok: success,
      error: success
        ? undefined
        : body?.info ||
          body?.errors?.error ||
          body?.error ||
          `HTTP ${r.status}`,
      response: body,
    };
  } catch (err: any) {
    return {
      whatsappNumber: wa,
      name: contact.name,
      ok: false,
      error: err?.message ?? "Network error",
    };
  }
}

async function sendBroadcastBatch(
  contacts: WatiContact[],
  templateName: string,
  broadcastName: string,
): Promise<{
  ok: boolean;
  sentCount: number;
  failedCount: number;
  total: number;
  failures: { whatsappNumber: string; name: string; error?: string }[];
}> {
  const CONCURRENCY = 5;
  const results: SendOutcome[] = [];
  for (let i = 0; i < contacts.length; i += CONCURRENCY) {
    const slice = contacts.slice(i, i + CONCURRENCY);
    const batch = await Promise.all(
      slice.map((c) => sendOneContact(c, templateName, broadcastName)),
    );
    results.push(...batch);
  }
  const successes = results.filter((r) => r.ok);
  const failures = results.filter((r) => !r.ok);
  return {
    ok: failures.length === 0,
    sentCount: successes.length,
    failedCount: failures.length,
    total: results.length,
    failures: failures.slice(0, 50).map((f) => ({
      whatsappNumber: f.whatsappNumber,
      name: f.name,
      error: f.error,
    })),
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      time: new Date().toISOString(),
      watiMock: WATI_MOCK,
    });
  });

  // === Immediate-send broadcast ===
  app.post("/api/wati/send-broadcast", async (req, res) => {
    const parsed = sendBroadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
    }
    const { templateName, broadcastName, contacts, mediaUrl } = parsed.data;
    const result = await sendBroadcastBatch(
      contacts,
      templateName,
      broadcastName,
    );
    return res.json({
      ok: result.ok,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      total: result.total,
      templateName,
      broadcastName,
      mediaUrl: mediaUrl ?? null,
      failures: result.failures,
    });
  });

  return httpServer;
}
