import type { AppConfig } from "@accordiq/core";
import { createDropboxSignAdapter } from "./dropbox-sign";
import { createNoneAdapter } from "./none";
import { createSandboxAdapter } from "./sandbox";
import type { EsignAdapter } from "./types";

export function createEsign(
  config: Pick<AppConfig, "ESIGN_PROVIDER"> &
    Partial<Pick<AppConfig, "ESIGN_API_KEY" | "ESIGN_TEST_MODE">>,
  options: { fetchImpl?: typeof fetch } = {},
): EsignAdapter {
  if (config.ESIGN_PROVIDER === "none") return createNoneAdapter();
  if (config.ESIGN_PROVIDER === "sandbox") return createSandboxAdapter();
  return createDropboxSignAdapter({
    apiKey: config.ESIGN_API_KEY ?? "",
    testMode: config.ESIGN_TEST_MODE !== "false",
    fetchImpl: options.fetchImpl,
  });
}
