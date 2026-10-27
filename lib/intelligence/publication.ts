import type { Prisma } from "@prisma/client";
import { POLICY_VERSION } from "./validation";
/** Shared by feeds, pages, detail URLs, counts, search and IOC exports. */
export const PUBLIC_BRIEFING_WHERE = {
  status: "published",
  analysisStatus: "validated",
  AND: [
    { qualityReport: { path: ["policyVersion"], equals: POLICY_VERSION } },
    { qualityReport: { path: ["publishable"], equals: true } },
  ],
} satisfies Prisma.BriefingWhereInput;
export const PUBLIC_IOC_WHERE = { briefing: { is: PUBLIC_BRIEFING_WHERE } } satisfies Prisma.IocWhereInput;