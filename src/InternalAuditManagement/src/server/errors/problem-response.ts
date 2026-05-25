import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApplicationError } from "./application-error";

export function toProblemResponse(error: unknown, traceId: string) {
  if (error instanceof ApplicationError) {
    return NextResponse.json(
      {
        type: `https://httpstatuses.com/${error.status}`,
        title: error.title,
        status: error.status,
        detail: error.message,
        traceId,
        ...error.details
      },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        type: "https://httpstatuses.com/400",
        title: "Validation failed",
        status: 400,
        detail: "One or more fields are invalid.",
        traceId,
        errors: error.flatten()
      },
      { status: 400 }
    );
  }

  console.error({ traceId, error });

  return NextResponse.json(
    {
      type: "https://httpstatuses.com/500",
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred.",
      traceId
    },
    { status: 500 }
  );
}
