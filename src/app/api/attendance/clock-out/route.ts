
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/app/lib/cron-auth";
import { runAttendanceCheck } from "@/app/lib/sumhr-attendance";

export async function GET(request: NextRequest) {
  const denied = authorizeCron(request);
  console.log(denied, "denied");
  if (denied) {
    return denied;
  }

  try {
    const result = await runAttendanceCheck("clock_out");

    return NextResponse.json({
      success: true,
      action: "clock-out-check",
      result,
    });
  } catch (error) {
    console.error(
      "Clock-out attendance check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        success: false,
        message: "Clock-out attendance check failed",
      },
      { status: 500 }
    );
  }
}
