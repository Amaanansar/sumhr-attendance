
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/app/lib/cron-auth";
import { runAttendanceCheck } from "@/app/lib/sumhr-attendance";

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);

  if (denied) {
    return denied;
  }

  try {
    const result = await runAttendanceCheck("clock_in");

    return NextResponse.json({
      success: true,
      action: "clock-in-check",
      result,
    });
  } catch (error) {
    console.error(
      "Clock-in attendance check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        success: false,
        message: "Clock-in attendance check failed",
      },
      { status: 500 }
    );
  }
}
