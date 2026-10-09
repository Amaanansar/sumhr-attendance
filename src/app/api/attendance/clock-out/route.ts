
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // 1. Verify required cron secret
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET is not configured");

      return NextResponse.json(
        { success: false, message: "Server configuration error" },
        { status: 500 }
      );
    }

    // 2. Verify the request is from an authorized cron caller
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // 3. Check SumHR environment variables
    const requiredEnv = [
      "SUMHR_KEY",
      "SUMHR_USERNAME",
      "SUMHR_PASSWORD",
      "SUMHR_SUBSCRIPTION_ID",
    ];

    const missingEnv = requiredEnv.filter(
      (key) => !process.env[key]?.trim()
    );

    if (missingEnv.length > 0) {
      console.error("Missing required SumHR environment variables");

      return NextResponse.json(
        {
          success: false,
          message: "SumHR configuration is incomplete",
          missing: missingEnv,
        },
        { status: 500 }
      );
    }

    // 4. Execute the actual clock-in operation
    const response = await fetch("https://sumhr-attendance.vercel.app/api/attendance", {
      method: "POST",
      headers: {
        authorization: process.env.SUMHR_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestType: "clock_out" }),
    });

    const result = await response.json();

    // 5. Return the result from the punching function
    return NextResponse.json(result, {
      status: response.ok ? 200 : 502,
    });
  } catch (error) {
    console.error(
      "Clock-in route failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        success: false,
        message: "Clock-in request failed",
      },
      { status: 500 }
    );
  }
}
