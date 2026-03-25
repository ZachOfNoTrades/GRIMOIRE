"use client";

import { ShieldX } from "lucide-react";

export default function ContentNotFound() {
  return (
    // CONTENT NOT FOUND
    <div className="page flex items-center justify-center">

      {/* CARD */}
      <div className="card max-w-md w-full">
        <div className="flex flex-col justify-center items-center py-12 px-8">

          {/* ICON */}
          <ShieldX className="w-16 h-16 mb-4 icon-gray" />

          {/* TITLE */}
          <h3 className="text-card-title mb-2">
            Content Not Found
          </h3>

          {/* MESSAGE */}
          <p className="text-secondary text-center">
            The page either does not exist or you do not have permission to view it.
          </p>
        </div>
      </div>
    </div>
  );
}
