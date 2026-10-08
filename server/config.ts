const toBool = (value: string | undefined, defaultValue = false): boolean => {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const toNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

export const config = {
  adminAuthEnabled: toBool(process.env.ETF_ADMIN_AUTH_ENABLED, false),
  adminApiKey: process.env.ADMIN_API_KEY || "",
  holdingsTtlHours: toNumber(process.env.HOLDINGS_TTL_HOURS, 168),
};
