import { NextResponse } from "next/server";
import { snapshotMode } from "./snapshot";

export function localMutationResponse() {
  return snapshotMode() ? NextResponse.json({
    error: "local_processing",
    message: "O processamento é executado no ambiente local. O site exibe a última cópia publicada.",
  }, { status: 409 }) : null;
}
