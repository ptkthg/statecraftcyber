import { describe, it, expect } from "vitest";
import { normalizeIoc } from "../lib/threat-intel/normalize-ioc";

describe("normalizeIoc", () => {
  it("normalizes IPs — trims and lowercases", () => {
    expect(normalizeIoc("ip", "  192.168.1.1  ")).toBe("192.168.1.1");
  });

  it("strips www from domains", () => {
    expect(normalizeIoc("domain", "www.evil.com")).toBe("evil.com");
  });

  it("lowercases domains", () => {
    expect(normalizeIoc("domain", "Evil.Com")).toBe("evil.com");
  });

  it("preserves domain without www", () => {
    expect(normalizeIoc("domain", "malware.net")).toBe("malware.net");
  });

  it("extracts hostname from full URL", () => {
    expect(normalizeIoc("url", "https://evil.com/path?q=1")).toBe("evil.com");
  });

  it("extracts hostname from http URL", () => {
    expect(normalizeIoc("url", "http://malware.net/download")).toBe("malware.net");
  });

  it("returns raw value if URL is malformed", () => {
    expect(normalizeIoc("url", "not-a-url")).toBe("not-a-url");
  });

  it("strips spaces from hashes", () => {
    expect(normalizeIoc("hash", "a3f7 c9d2 e4b8")).toBe("a3f7c9d2e4b8");
  });

  it("lowercases hashes", () => {
    expect(normalizeIoc("hash", "DEADBEEF")).toBe("deadbeef");
  });

  it("normalizes email to lowercase", () => {
    expect(normalizeIoc("email", "Phisher@EVIL.COM")).toBe("phisher@evil.com");
  });

  it("returns trimmed lowercase for unknown type", () => {
    expect(normalizeIoc("c2", "  UNKNOWN  ")).toBe("unknown");
  });
});
