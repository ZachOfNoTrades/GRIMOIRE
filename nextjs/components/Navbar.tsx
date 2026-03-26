"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, ReactNode } from "react";
import { Settings, LogOut, CircleUser } from "lucide-react";
import { Button } from "@/components/ui/button";
import PermissionGuardClient from "@/components/PermissionGuardClient";

interface NavbarProps {
  children?: ReactNode;
}

export default function Navbar({ children }: NavbarProps) {
  const { data: session } = useSession();
  const router = useRouter();

  // STATE
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Don't render for unauthenticated users
  if (!session?.user?.id) {
    return null;
  }

  return (
    // NAVBAR
    <nav className="navbar sticky top-0 z-40">

      {/* NAVBAR CONTENT */}
      <div className="max-w-[80rem] mx-auto px-4 py-2 flex items-center justify-between">

        {/* LEFT SIDE */}
        <div className="flex items-center gap-2">

          {/* HOME LINK */}
          <button
            onClick={() => router.push("/")}
            className="btn-link text-h1 !pl-0 cursor-pointer"
          >
            GRIMOIRE
          </button>

          {children}
        </div>

        {/* RIGHT SIDE — USER MENU */}
        <div className="relative" ref={dropdownRef}>

          {/* MENU BUTTON */}
          <Button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="btn-link"
            title="User menu"
          >
            <CircleUser className="w-5 h-5" />
          </Button>

          {/* DROPDOWN MENU */}
          {isMenuOpen && (
            <div className="popover-menu">

              {/* SETTINGS LINK (admin only) */}
              <PermissionGuardClient>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push("/settings/ui/home");
                  }}
                  className="popover-item"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  Settings
                </button>
              </PermissionGuardClient>

              {/* SIGN OUT */}
              <button
                onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                className="popover-item"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
