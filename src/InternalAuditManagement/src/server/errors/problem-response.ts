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

  if (isPostgrestError(error)) {
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json(
      {
        type: `https://httpstatuses.com/${status}`,
        title: status === 409 ? "Conflict" : "Invalid data",
        status,
        detail: databaseErrorDetail(error),
        traceId
      },
      { status }
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

function isPostgrestError(error: unknown): error is { code: string; message?: string; details?: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
  );
}

function databaseErrorDetail(error: { code: string; message?: string; details?: string }) {
  if (error.code === "23503") {
    return "Referenced data does not exist. Check that the selected claim, line item, employee, or site exists.";
  }

  if (error.code === "23514") {
    return "Submitted data violates a database validation rule.";
  }

  if (error.code === "23505") {
    const rawText = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (rawText.includes("client_invoice")) {
      return "This client invoice number is already used on another active expense line. Use a different invoice number or edit the existing claim instead.";
    }

    if (rawText.includes("advance_claim_id") || rawText.includes("active_adjustment") || rawText.includes("settlement")) {
      return "Another active claim already exists for this advance. Open that active claim or ask Finance to close the duplicate before continuing.";
    }

    return "A duplicate active record already exists. Check whether this claim, invoice, or advance has already been created before continuing.";
  }

  return error.details ?? error.message ?? "Database rejected the submitted data.";
}
