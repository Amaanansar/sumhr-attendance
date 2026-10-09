import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/app/lib/cron-auth";
import { runAttendanceCheck } from "@/app/lib/sumhr-attendance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runAttendanceCheck("clock-in");
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Scheduled clock-in check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, action: "clock-in", message: "Scheduled check failed" },
      { status: 500 }
    );
  }
}
