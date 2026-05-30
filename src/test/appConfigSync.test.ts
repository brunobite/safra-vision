import { describe, expect, it } from "vitest";
import { getSyncRelevantAppConfigPayload, isOnlySyncMetaChange } from "@/lib/appConfigSync";
import type { AppConfig } from "@/types";

const previousConfig: AppConfig = {
  id: "main",
  percentualAcertoEsperado: 12,
  syncMeta: {
    lastUploadAt: "2026-05-29T10:00:00.000Z",
    lastDownloadAt: null,
    lastSyncedUserId: "user-1",
    lastSyncedEmail: "user@safra.test",
  },
};

describe("appConfigSync", () => {
  it("ignores syncMeta-only changes for operational appConfig payload", () => {
    const nextConfig: AppConfig = {
      ...previousConfig,
      syncMeta: {
        ...previousConfig.syncMeta!,
        lastUploadAt: "2026-05-30T10:00:00.000Z",
        deviceLabel: "new browser label",
      },
    };

    expect(isOnlySyncMetaChange(previousConfig, nextConfig)).toBe(true);
    expect(getSyncRelevantAppConfigPayload(nextConfig)).toEqual({ id: "main", percentualAcertoEsperado: 12 });
  });

  it("treats percentualAcertoEsperado changes as sync-relevant", () => {
    const nextConfig: AppConfig = {
      ...previousConfig,
      percentualAcertoEsperado: 15,
      syncMeta: {
        ...previousConfig.syncMeta!,
        lastUploadAt: "2026-05-30T10:00:00.000Z",
      },
    };

    expect(isOnlySyncMetaChange(previousConfig, nextConfig)).toBe(false);
    expect(getSyncRelevantAppConfigPayload(nextConfig)).toEqual({ id: "main", percentualAcertoEsperado: 15 });
  });
});
