import { ProxyAgent, fetch as undiciFetch } from "undici";
import { prisma } from "@/lib/prisma";
import { flattenEnabledProxies, redactProxyUrl } from "@/lib/proxyConfig";
import { getStoredProxyConfig } from "@/lib/proxySettingsStore";

export const PROXY_HEALTH_KEY = "outbound_proxy_health";

export type ProxyHealthStatus = "ok" | "slow" | "limited" | "failed";

export type ProxyHealthResult = {
  groupId: string;
  groupName: string;
  redactedProxy: string;
  status: ProxyHealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  ip?: string;
  httpStatus?: number;
  error?: string;
};

export type ProxyHealthReport = {
  checkedAt: string;
  targetUrl: string;
  summary: {
    total: number;
    ok: number;
    slow: number;
    limited: number;
    failed: number;
    healthyPercent: number;
    risk: "good" | "warning" | "critical";
  };
  results: ProxyHealthResult[];
};

const DEFAULT_TARGET_URL = "https://ipv4.webshare.io/";

function classifyHttpFailure(status: number, text: string): ProxyHealthStatus {
  const lower = text.toLowerCase();
  if (status === 407 || status === 429 || lower.includes("quota") || lower.includes("limit") || lower.includes("bandwidth")) {
    return "limited";
  }
  return "failed";
}

function cleanError(error: unknown) {
  const message = String((error as any)?.message || (error as any)?.cause?.message || error || "Error desconocido");
  return message.replace(/https?:\/\/[^@\s]+@/g, "http://redacted:redacted@").slice(0, 180);
}

async function checkSingleProxy(
  item: { groupId: string; groupName: string; proxy: string },
  targetUrl: string,
  timeoutMs: number
): Promise<ProxyHealthResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  const agent = new ProxyAgent({ uri: item.proxy });

  try {
    const response = await undiciFetch(targetUrl, {
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Badrockplyr proxy health check",
      },
    } as any);

    const latencyMs = Date.now() - startedAt;
    const text = (await response.text()).trim();

    if (!response.ok) {
      return {
        groupId: item.groupId,
        groupName: item.groupName,
        redactedProxy: redactProxyUrl(item.proxy),
        status: classifyHttpFailure(response.status, text),
        latencyMs,
        checkedAt,
        httpStatus: response.status,
        error: text.slice(0, 180) || response.statusText,
      };
    }

    return {
      groupId: item.groupId,
      groupName: item.groupName,
      redactedProxy: redactProxyUrl(item.proxy),
      status: latencyMs > 5000 ? "slow" : "ok",
      latencyMs,
      checkedAt,
      httpStatus: response.status,
      ip: text,
    };
  } catch (error) {
    return {
      groupId: item.groupId,
      groupName: item.groupName,
      redactedProxy: redactProxyUrl(item.proxy),
      status: cleanError(error).toLowerCase().includes("limit") ? "limited" : "failed",
      latencyMs: null,
      checkedAt,
      error: cleanError(error),
    };
  } finally {
    agent.close();
  }
}

function summarize(results: ProxyHealthResult[]): ProxyHealthReport["summary"] {
  const total = results.length;
  const ok = results.filter((result) => result.status === "ok").length;
  const slow = results.filter((result) => result.status === "slow").length;
  const limited = results.filter((result) => result.status === "limited").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const healthy = ok + slow;
  const healthyPercent = total === 0 ? 0 : Math.round((healthy / total) * 100);
  const risk = total === 0 || healthyPercent < 40 || limited + failed >= Math.ceil(total * 0.7)
    ? "critical"
    : healthyPercent < 75 || limited > 0 || failed > 0
      ? "warning"
      : "good";

  return { total, ok, slow, limited, failed, healthyPercent, risk };
}

async function saveHealthReport(report: ProxyHealthReport) {
  await prisma.setting.upsert({
    where: { key: PROXY_HEALTH_KEY },
    update: { value: JSON.stringify(report) },
    create: { key: PROXY_HEALTH_KEY, value: JSON.stringify(report) },
  });
}

export async function getLastProxyHealthReport() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: PROXY_HEALTH_KEY } });
    if (!setting?.value) return null;
    return JSON.parse(setting.value) as ProxyHealthReport;
  } catch {
    return null;
  }
}

export async function runProxyHealthCheck(options: { targetUrl?: string; timeoutMs?: number; batchSize?: number } = {}) {
  const targetUrl = options.targetUrl || DEFAULT_TARGET_URL;
  const timeoutMs = options.timeoutMs || 8000;
  const batchSize = options.batchSize || 5;
  const config = await getStoredProxyConfig();
  const proxies = flattenEnabledProxies(config);
  const results: ProxyHealthResult[] = [];

  for (let index = 0; index < proxies.length; index += batchSize) {
    const batch = proxies.slice(index, index + batchSize);
    const batchResults = await Promise.all(batch.map((item) => checkSingleProxy(item, targetUrl, timeoutMs)));
    results.push(...batchResults);
  }

  const report: ProxyHealthReport = {
    checkedAt: new Date().toISOString(),
    targetUrl,
    summary: summarize(results),
    results,
  };

  await saveHealthReport(report);
  return report;
}
