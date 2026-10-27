import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
describe("intelligence audit CLI",()=>{
 it("runs in the project's CommonJS package and validates arguments before accessing a database",()=>{
  const result=spawnSync(process.execPath,["--import","tsx",resolve("scripts/audit-intelligence.ts"),"--limit","0"],{
    cwd:process.cwd(),encoding:"utf8",timeout:20000,
    env:{...process.env,DATABASE_URL:"postgresql://unused:unused@127.0.0.1:1/unused"},
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--limit deve ser positivo");
  expect(result.stderr).not.toContain("Transform failed");
  expect(result.stderr).not.toContain("PrismaClientInitializationError");
 });
});