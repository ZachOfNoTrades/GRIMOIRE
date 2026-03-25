"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  const { data: session } = useSession();

  return (
    // BACKGROUND
    <div className="page flex items-center justify-center">

      {/* CARD */}
      <div className="card max-w-md w-full p-8">

        {/* CONTENT CONTAINER */}
        <div className="text-center">
          <h1 className="text-page-title flex justify-center">
            Access Denied
          </h1>

          {/* MESSAGE */}
          <p className="text-secondary mt-4">
            {session?.user?.email
              ? `The account ${session.user.email} is not authorized to access this application.`
              : "Your account is not authorized to access this application."}
          </p>

          {/* INSTRUCTIONS */}
          <p className="text-secondary mt-2">
            Contact an administrator to request access.
          </p>
        </div>

        {/* SIGN OUT BUTTON */}
        <div className="mt-8">
          <Button
            className="btn-off w-full"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
