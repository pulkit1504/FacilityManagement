import { NextResponse } from "next/server";
import { z } from "zod";
import { authSessionCookieName, createSessionCookieValue } from "@/server/auth/session";
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
      passwordResetRequired: employee.passwordResetRequired,
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
