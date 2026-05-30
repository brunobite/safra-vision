import { describe, expect, it } from "vitest";
import { buildSyncReadinessReport, syncReadinessMessages } from "@/lib/syncReadiness";
import type { SyncReadinessInput } from "@/lib/syncReadiness";

const baseInput = (overrides: Partial<SyncReadinessInput> = {}): SyncReadinessInput => ({
  supabaseConfigured: true,
  sessionExists: true,
  userId: "user-1",
  email: "user@safra.test",
  role: "user",
  accessStatus: "active",
  indexedDbLoaded: true,
  pendingSyncCount: 0,
  localSyncMeta: {
    lastUploadAt: "2026-05-30T10:00:00.000Z",
    lastDownloadAt: null,
    lastSyncedUserId: "user-1",
    lastSyncedEmail: "user@safra.test",
  },
  remoteSyncMeta: null,
  remoteSyncMetaChecked: false,
  online: true,
  comparison: null,
  localOperationalCount: 10,
  currentUserId: "user-1",
  ...overrides,
});

describe("syncReadiness", () => {
  it("requires manual confirmation before first upload", () => {
    const report = buildSyncReadinessReport(baseInput({
      localSyncMeta: { lastUploadAt: null, lastDownloadAt: null },
    }));

    expect(report.state).toBe("first-upload-required");
    expect(report.autosyncAllowed).toBe(false);
    expect(report.autosyncBlockedReason).toBe(syncReadinessMessages.firstUpload);
  });

  it("allows autosync after lastUploadAt when all other checks are OK", () => {
    const report = buildSyncReadinessReport(baseInput());

    expect(report.state).toBe("ready");
    expect(report.firstUploadConfirmed).toBe(true);
    expect(report.autosyncAllowed).toBe(true);
  });

  it("detects user switch and blocks autosync", () => {
    const report = buildSyncReadinessReport(baseInput({
      currentUserId: "user-2",
      userId: "user-2",
      email: "other@safra.test",
    }));

    expect(report.userSwitchDetected).toBe(true);
    expect(report.state).toBe("blocked");
    expect(report.autosyncAllowed).toBe(false);
    expect(report.autosyncBlockedReason).toBe(syncReadinessMessages.userSwitch);
  });

  it("does not block autosync when current user matches last synced user", () => {
    const report = buildSyncReadinessReport(baseInput());

    expect(report.userSwitchDetected).toBe(false);
    expect(report.autosyncAllowed).toBe(true);
  });

  it("returns needs-login without Supabase session", () => {
    const report = buildSyncReadinessReport(baseInput({ sessionExists: false, userId: null, email: null }));

    expect(report.state).toBe("needs-login");
    expect(report.finalRecommendation).toBe("Bloqueado");
  });

  it("returns needs-approval for pending or inactive profiles", () => {
    expect(buildSyncReadinessReport(baseInput({ accessStatus: "pending" })).state).toBe("needs-approval");
    expect(buildSyncReadinessReport(baseInput({ accessStatus: "inactive" })).state).toBe("needs-approval");
  });

  it("returns ready for online active user without blockers", () => {
    const report = buildSyncReadinessReport(baseInput());

    expect(report.state).toBe("ready");
    expect(report.finalRecommendation).toBe("Apto para uso");
  });

  it("diagnoses empty local base with existing remote sync metadata without downloading", () => {
    const report = buildSyncReadinessReport(baseInput({
      localOperationalCount: 0,
      remoteSyncMeta: {
        lastUploadAt: "2026-05-29T10:00:00.000Z",
        lastDownloadAt: null,
        lastSyncedUserId: "user-1",
        lastSyncedEmail: "user@safra.test",
        lastSyncSummary: { total: 1, success: 1, error: 0, byStore: {}, errors: [] },
        deviceLabel: "browser",
      },
      remoteSyncMetaChecked: true,
    }));

    expect(report.state).toBe("local-empty-cloud-existing");
    expect(report.autosyncAllowed).toBe(false);
    expect(report.operationalRecommendation).toBe(syncReadinessMessages.localEmptyCloudExisting);
  });
});
