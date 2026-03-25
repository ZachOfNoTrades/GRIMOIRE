import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession, isAdmin } from "@/lib/permissions";
import { getAllUsers, createUser } from "@/lib/users";
import { isValidEmail } from "@/lib/format";

export async function GET() {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const users = await getAllUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Error in GET /api/users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth guard
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Permission guard
    if (!(await isAdmin())) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(body.email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const newUser = await createUser(body.email, body.name || body.email);
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/users:", error);

    if (error instanceof Error && error.message.includes("Violation of UNIQUE KEY")) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
