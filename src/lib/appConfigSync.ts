import type { AppConfig } from "@/types";

export type SyncRelevantAppConfigPayload = Pick<AppConfig, "id" | "percentualAcertoEsperado">;

export function getSyncRelevantAppConfigPayload(config: AppConfig): SyncRelevantAppConfigPayload {
  return {
    id: config.id,
    percentualAcertoEsperado: config.percentualAcertoEsperado,
  };
}

export function isOnlySyncMetaChange(previousConfig: AppConfig, nextConfig: AppConfig) {
  return JSON.stringify(getSyncRelevantAppConfigPayload(previousConfig)) === JSON.stringify(getSyncRelevantAppConfigPayload(nextConfig));
}
