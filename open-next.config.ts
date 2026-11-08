import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is per-viewer and rendered on request, so no incremental cache is configured.
export default defineCloudflareConfig();
