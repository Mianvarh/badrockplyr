import React from "react";
import ApiKeyManagerClient from "./ApiKeyManagerClient";
import { listApiKeys } from "./actions";
import { appBaseUrl } from "@/lib/config";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const keys = await listApiKeys();

  return <ApiKeyManagerClient initialKeys={keys} baseUrl={appBaseUrl} />;
}
