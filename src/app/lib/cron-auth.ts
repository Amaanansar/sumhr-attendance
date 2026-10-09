
import { NextRequest, NextResponse } from "next/server";

export function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET is not configured");

    return NextResponse.json(
      { success: false, message: "Server configuration error" },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");

  console.log(authorization, "token");
  if (authorization !== `Bearer ${secret}`) {
    console.log("Unauthorized access attempt to cron route");
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
