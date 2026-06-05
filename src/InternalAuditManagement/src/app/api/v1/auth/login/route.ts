import { NextResponse } from "next/server";
import { z } from "zod";
import { authSessionCookieName, assertSessionSecretConfigured, createSessionCookieValue } from "@/server/auth/session";
import { serverConfigurationError } from "@/server/errors/application-error";
import { toProblemResponse } from "@/server/errors/problem-response";
import { getRepository } from "@/server/services/service-factory";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});
const sessionMaxAgeSeconds = 60 * 60 * 8;

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();
  try {
    try {
      assertSessionSecretConfigured();
    } catch {
      throw serverConfigurationError("Authentication is not configured. Set AUTH_SESSION_SECRET to at least 32 characters and redeploy.");
    }

    const body = loginSchema.parse(await request.json());
    const employee = await getRepository().authenticateEmployee(body.email, body.password);

    if (!employee) {
      return NextResponse.json(
        {
          type: "https://httpstatuses.com/401",
          title: "Unauthorized",
          status: 401,
          detail: "Invalid email or password.",
          traceId
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      userId: employee.employeeId,
      role: employee.role,
      name: employee.fullName,
      email: employee.email,
      message: `Signed in as ${employee.fullName}.`
    });

    response.cookies.set(
      authSessionCookieName,
      createSessionCookieValue(
        {
          userId: employee.employeeId,
          role: employee.role,
          email: employee.email,
          name: employee.fullName
        },
        sessionMaxAgeSeconds
      ),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: sessionMaxAgeSeconds
      }
    );

    return response;
  } catch (error) {
    return toProblemResponse(error, traceId);
  }
}
