"use client";

import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  return (
    // BACKGROUND
    <div className="page flex items-center justify-center">

      {/* CARD */}
      <div className="card max-w-md w-full p-8">

        {/* CONTENT CONTAINER */}
        <div className="text-center">
          <h1 className="text-page-title flex justify-center">
            GRIMOIRE
          </h1>
        </div>

        {/* GOOGLE SIGN IN BUTTON */}
        <div className="mt-8">
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="btn-google w-full"
          >
            <img src="/google-g-logo.svg" alt="Google" width={20} height={20} />
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
