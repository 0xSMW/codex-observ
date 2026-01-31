import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";

export interface AuthIdentity {
  provider: string | null;
  email_domain: string | null;
  email_hash: string | null;
}

export function parseAuthIdentity(codexHome?: string): AuthIdentity | null {
  const home = codexHome ?? path.join(os.homedir(), ".codex");
  const authPath = path.join(home, "auth.json");
  if (!fs.existsSync(authPath)) return null;

  try {
    const raw = fs.readFileSync(authPath, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;

    const email = findFirstString(data, [
      "email",
      "user.email",
      "account.email",
      "profile.email",
    ]);
    const provider = findFirstString(data, [
      "provider",
      "auth_provider",
      "issuer",
      "service",
      "vendor",
      "client_name",
    ]);

    if (!email && !provider) return null;

    const { email_domain, email_hash } = email ? maskEmail(email) : { email_domain: null, email_hash: null };

    return {
      provider: provider ?? null,
      email_domain,
      email_hash,
    };
  } catch {
    return null;
  }
}

function maskEmail(email: string): { email_domain: string | null; email_hash: string | null } {
  const parts = email.split("@");
  if (parts.length < 2) return { email_domain: null, email_hash: hashValue(email) };
  const local = parts[0];
  const domain = parts.slice(1).join("@").toLowerCase();
  return {
    email_domain: domain || null,
    email_hash: local ? hashValue(local) : null,
  };
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function findFirstString(data: unknown, keys: string[]): string | null {
  for (const key of keys) {
    const value = getNestedValue(data, key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getNestedValue(obj: unknown, pathKey: string): unknown {
  if (!obj || typeof obj !== "object") return null;
  const parts = pathKey.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    const record = current as Record<string, unknown>;
    if (!(part in record)) return null;
    current = record[part];
  }
  return current;
}
