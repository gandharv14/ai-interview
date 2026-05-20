export const AUTH0_REQUIRED_ENV_VARS = [
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
] as const;

export type Auth0RequiredEnvVar = (typeof AUTH0_REQUIRED_ENV_VARS)[number];

export function getMissingAuth0ConfigKeys(
  env: NodeJS.ProcessEnv = process.env,
): Auth0RequiredEnvVar[] {
  return AUTH0_REQUIRED_ENV_VARS.filter((key) => !env[key]?.trim());
}

export function formatMissingAuth0ConfigMessage(
  missingKeys: readonly Auth0RequiredEnvVar[],
) {
  return `Authentication is not configured for this deployment. Missing: ${missingKeys.join(
    ", ",
  )}. Add the missing Auth0 environment variables and redeploy.`;
}
