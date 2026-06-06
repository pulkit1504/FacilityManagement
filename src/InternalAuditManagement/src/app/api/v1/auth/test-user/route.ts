import { NextResponse } from "next/server";
import { findTestUser, serializeTestUserCookie, testUserCookieName } from "@/server/auth/test-users";

export async function POST(request: Request) {
  if (process.env.APP_AUTH_MODE !== "test") {
    return NextResponse.json(
      {
        type: "https://httpstatuses.com/404",
        title: "Not Found",
        status: 404,
        detail: "Test login is not enabled."
      },
      { status: 404 }
    );
  }

  const body = (await request.json()) as { userId?: string; role?: string };
  const selectedUser = body.userId && body.role ? findTestUser(body.userId, body.role) : null;

  if (!selectedUser) {
    return NextResponse.json(
      {
        type: "https://httpstatuses.com/400",
        title: "Invalid test user",
        status: 400,
        detail: "Select a valid tester profile."
      },
      { status: 400 }
    );
  }

  const response = NextResponse.json({
    userId: selectedUser.userId,
    role: selectedUser.role,
    name: selectedUser.name,
    email: selectedUser.email,
    message: `Signed in as ${selectedUser.name}.`
  });

  response.cookies.set(testUserCookieName, serializeTestUserCookie(selectedUser), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_AUTH_MODE !== "test",
    path: "/",
    maxAge: 60 * 60 * 8
  });

  return response;
}

export async function DELETE() {
  if (process.env.APP_AUTH_MODE !== "test") {
    return NextResponse.json({ message: "Test login is not enabled." }, { status: 404 });
  }

  const response = NextResponse.json({ message: "Signed out." });
  response.cookies.set(testUserCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.APP_AUTH_MODE !== "test",
    path: "/",
    maxAge: 0
  });

  return response;
}
