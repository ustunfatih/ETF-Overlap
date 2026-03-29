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
  holdingsV2Enabled: toBool(process.env.ETF_HOLDINGS_V2_ENABLED, false),
  providerAlphaEnabled: toBool(process.env.ETF_PROVIDER_ALPHA_ENABLED, false),
  providerIssuerEnabled: toBool(process.env.ETF_PROVIDER_ISSUER_ENABLED, false),
  providerSecEnabled: toBool(process.env.ETF_PROVIDER_SEC_ENABLED, false),
  adminAuthEnabled: toBool(process.env.ETF_ADMIN_AUTH_ENABLED, false),
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || "",
  adminApiKey: process.env.ADMIN_API_KEY || "",
  holdingsTtlHours: toNumber(process.env.HOLDINGS_TTL_HOURS, 1),
};
