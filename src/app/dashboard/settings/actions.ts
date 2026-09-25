"use server";

import { revalidatePath } from "next/cache";
import { saveStoredProxyConfig } from "@/lib/proxySettingsStore";
import { parseProxyList, StoredProxyConfig } from "@/lib/proxyConfig";
import { runProxyHealthCheck } from "@/lib/proxyHealth";

export async function saveProxySettings(config: StoredProxyConfig) {
  const saved = await saveStoredProxyConfig(config);
  revalidatePath("/dashboard/settings");
  return { success: true, config: saved };
}

export async function parseProxyText(input: string) {
  return parseProxyList(input);
}

export async function testProxyHealth() {
  const report = await runProxyHealthCheck();
  revalidatePath("/dashboard/settings");
  return { success: true, report };
}
