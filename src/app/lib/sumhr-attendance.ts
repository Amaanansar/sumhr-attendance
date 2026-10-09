
import "server-only";

export type AttendanceRequestType = "clock_in" | "clock_out";

interface SumHRResponse<T> {
  error: unknown | null;
  result: T;
}

interface LoginResult {
  token: string;
}

interface PunchLog {
  [key: string]: unknown;
}

interface AttendanceCheckResult {
  username: string;
  requestType: AttendanceRequestType;
  punchCount: number;
  appearsClockedIn: boolean;
  message: string;
}

const SUMHR_API = "https://api.sumhr.io:3000/api";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function runAttendanceCheck(
  requestType: AttendanceRequestType
): Promise<AttendanceCheckResult[]> {
  if (requestType !== "clock_in" && requestType !== "clock_out") {
    throw new Error("Invalid attendance request type");
  }

  const subscriptionKey = getRequiredEnv("SUMHR_KEY");
  const username = getRequiredEnv("SUMHR_USERNAME");
  const password = getRequiredEnv("SUMHR_PASSWORD");
  const subscriptionId = getRequiredEnv("SUMHR_SUBSCRIPTION_ID");

  const now = new Date();

  // Use India Standard Time to determine the weekday.
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);

  if (weekday === "Sun") {
    return [{
      username,
      requestType,
      punchCount: 0,
      appearsClockedIn: false,
      message: "Sunday: no attendance check needed",
    }];
  }

  const loginResponse = await fetch(
    `${SUMHR_API}/subscription/passwordlogin`,
    {
      method: "POST",
      headers: {
        Authorization: subscriptionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
        subscriptionid: subscriptionId,
        browserdetail: "chrome",
        logintype: 1,
        systemdetail:
          "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!loginResponse.ok) {
    throw new Error(`SumHR login request failed: HTTP ${loginResponse.status}`);
  }

  const loginData =
    (await loginResponse.json()) as SumHRResponse<LoginResult[]>;

  const token =
    loginData.error == null && Array.isArray(loginData.result)
      ? loginData.result[0]?.token
      : undefined;

  if (!token) {
    throw new Error("SumHR login did not return an access token");
  }

  const logsResponse = await fetch(
    `${SUMHR_API}/attendance/allpunchlogbyempid`,
    {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shiftdate: `${indiaDate}T00:00:00.000Z`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!logsResponse.ok) {
    throw new Error(
      `SumHR attendance request failed: HTTP ${logsResponse.status}`
    );
  }

  const logsData =
    (await logsResponse.json()) as SumHRResponse<PunchLog[]>;

  if (logsData.error != null || !Array.isArray(logsData.result)) {
    throw new Error("SumHR returned an invalid attendance-log response");
  }

  const punchCount = logsData.result.length;
  const appearsClockedIn = punchCount % 2 !== 0;

  console.log("SumHR attendance status checked", {
    requestType,
    punchCount,
    appearsClockedIn,
    date: indiaDate,
  });

  return [{
    username,
    requestType,
    punchCount,
    appearsClockedIn,
    message: appearsClockedIn
      ? "Attendance log appears clocked in"
      : "Attendance log appears clocked out",
  }];
}
