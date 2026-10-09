export type AttendanceAction = "clock-in" | "clock-out";

type SumHrResponse = {
  error?: unknown;
  result?: unknown;
  message?: string;
};

type LoginResult = {
  token?: string | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function postSumHr(
  url: string,
  authorization: string,
  payload: Record<string, unknown>,
): Promise<SumHrResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await response.json().catch(() => null)) as SumHrResponse | null;
  if (!response.ok || !data) {
    throw new Error(`SumHR request failed with HTTP ${response.status}`);
  }
  return data;
}

function indiaDateAtMidnightUtc(): string {
  // Build the calendar date in Asia/Kolkata, independent of the server's timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Could not determine today's India date");
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

/**
 * Re-authenticates with SumHR and checks today's punch log.
 * This helper deliberately does not create or alter punch records.
 */
export async function runAttendanceCheck(action: AttendanceAction) {
  const subscriptionKey = requiredEnv("SUMHR_KEY");
  const username = requiredEnv("SUMHR_USERNAME");
  const password = requiredEnv("SUMHR_PASSWORD");
  const subscriptionId = requiredEnv("SUMHR_SUBSCRIPTION_ID");

  const browserDetail = process.env.SUMHR_BROWSER_DETAIL?.trim() || "chrome";
  const systemDetail =
    process.env.SUMHR_SYSTEM_DETAIL?.trim() ||
    "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
  const loginType = Number(process.env.SUMHR_LOGIN_TYPE || "1");
  if (!Number.isInteger(loginType)) throw new Error("SUMHR_LOGIN_TYPE must be an integer");

  const login = await postSumHr(
    "https://api.sumhr.io:3000/api/subscription/passwordlogin",
    subscriptionKey,
    {
      username,
      password,
      subscriptionid: subscriptionId,
      browserdetail: browserDetail,
      logintype: loginType,
      systemdetail: systemDetail,
    },
  );

  if (login.error != null || !Array.isArray(login.result) || login.result.length === 0) {
    throw new Error("SumHR login failed; check the configured credentials and subscription access");
  }

  const loginResult = login.result[0] as LoginResult;
  const accessToken = loginResult?.token;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("SumHR login response did not contain an access token");
  }

  const logs = await postSumHr(
    "https://api.sumhr.io:3000/api/attendance/allpunchlogbyempid",
    accessToken,
    { shiftdate: indiaDateAtMidnightUtc() },
  );

  if (logs.error != null || !Array.isArray(logs.result)) {
    throw new Error("SumHR did not return a valid attendance punch log");
  }

  const punchCount = logs.result.length;
  const currentlyClockedIn = punchCount % 2 === 1;
  const actionNeeded = action === "clock-in" ? !currentlyClockedIn : currentlyClockedIn;

  // Do not log usernames, passwords, tokens, or punch-log contents.
  console.info("SumHR attendance status checked", {
    action,
    punchCount,
    currentlyClockedIn,
    actionNeeded,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true as const,
    action,
    currentlyClockedIn,
    punchCount,
    actionNeeded,
    timestamp: new Date().toISOString(),
    message: actionNeeded
      ? `SumHR login succeeded. Current status indicates ${action} may be needed; no punch was created.`
      : `SumHR login succeeded. No ${action} action appears necessary; no punch was created.`,
  };
}
