/**
 * Babolat reuses the daily WeChat DevTools process on 9420.
 * This provider only describes that lease; it never opens, quits, or
 * mutates a DevTools profile.
 */
export const babolatDevToolsProfileProvider = {
  async acquire() {
    const leaseId = `babolat-reused-devtools-${Date.now()}-${process.pid}`;
    return {
      status: "ready",
      leaseId,
      kind: "wechat-reused-daily-devtools",
      evidence: [
        {
          type: "profile_policy",
          value: {
            kind: "reused_daily_devtools",
            dailyProfileTouched: false,
            automatorPort: 9420,
          },
        },
      ],
      async release() {
        return { status: "released", leaseId, dailyProfileTouched: false };
      },
    };
  },
};
