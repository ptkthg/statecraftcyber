import { createHash } from "crypto";

// Hashes the admin secret before storing in cookie so the raw ADMIN_SECRET
// never appears in cookie storage or browser developer tools.
export function hashAdminSecret(secret: string): string {
  return createHash("sha256").update(`statecraft-admin:${secret}`).digest("hex");
}
