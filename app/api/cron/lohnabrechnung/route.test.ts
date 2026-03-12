import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const MOCK_CRON_SECRET = "test-cron-secret";

vi.mock("@/lib/env", () => ({
  env: {
    CRON_SECRET: "test-cron-secret",
    RUN_DAY: 1,
    TEMPLATE_PATH: "template/lohnabrechnung.html",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_REGION: "eu-central-1",
    SES_FROM_EMAIL: "from@test.de",
    EMAIL_RECIPIENT: "to@test.de",
    EMAIL_RECIPIENT_BCC: "",
    REDIS_URL: "redis://localhost:6379",
    PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium",
  },
}));

vi.mock("@/lib/redis", () => ({
  wasAlreadyProcessed: vi.fn(),
  markProcessed: vi.fn(),
}));

vi.mock("@/lib/pdf", () => ({
  getMonthNameDe: vi.fn((m: number) => "März"),
  loadAndSubstituteTemplate: vi.fn().mockResolvedValue("<html></html>"),
  renderHtmlToPdf: vi.fn().mockResolvedValue({
    buffer: Buffer.from("pdf"),
    filename: "lohnabrechnung-2025-03.pdf",
  }),
}));

vi.mock("@aws-sdk/client-ses", () => ({
  SESClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  })),
  SendRawEmailCommand: vi.fn(),
}));

function mockRequest(init: { url?: string; headers?: HeadersInit }) {
  const url = init.url ?? "https://example.com/api/cron/lohnabrechnung";
  return new Request(url, {
    method: "POST",
    headers: init.headers ?? {},
  });
}

describe("POST /api/cron/lohnabrechnung", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { wasAlreadyProcessed } = await import("@/lib/redis");
    vi.mocked(wasAlreadyProcessed).mockResolvedValue(false);
  });

  it("returns 401 when CRON_SECRET is missing", async () => {
    const req = mockRequest({});
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 401 when CRON_SECRET is wrong", async () => {
    const req = mockRequest({
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 200 with skipped when auth is valid but not run day", async () => {
    vi.useFakeTimers({ now: new Date("2025-03-15T10:00:00Z") });
    const req = mockRequest({ headers: { Authorization: "Bearer " + MOCK_CRON_SECRET } });
    const res = await POST(req);
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("not_run_day");
    expect(body.currentDay).toBe(15);
    expect(body.runDay).toBe(1);
  });

  it("accepts secret via Authorization Bearer header", async () => {
    const req = mockRequest({
      headers: { Authorization: "Bearer " + MOCK_CRON_SECRET },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 with pdfFilename when run day and not already processed", async () => {
    vi.useFakeTimers({ now: new Date("2025-03-01T10:00:00Z") });
    const req = mockRequest({ headers: { Authorization: "Bearer " + MOCK_CRON_SECRET } });
    const res = await POST(req);
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.skipped).toBeUndefined();
    expect(body.year).toBe(2025);
    expect(body.month).toBe(3);
    expect(body.pdfFilename).toBe("lohnabrechnung-2025-03.pdf");
  });
});
