"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef, ReactNode } from "react";
import Image from "next/image";
import { Settings, LogOut, CircleUser, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import PermissionGuardClient from "@/components/PermissionGuardClient";
import MainNavDrawer from "@/components/MainNavDrawer";
import PopoverMenu from "@/components/PopoverMenu";

interface NavbarProps {
  children?: ReactNode;
}

// Scroll position at or below which the navbar is always revealed ("near the top").
const REVEAL_NEAR_TOP_PX = 48;

export default function Navbar({ children }: NavbarProps) {
  const pathname = usePathname() || "";

  // STATE
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false); // autohide: true while scrolling down
  const [navHeight, setNavHeight] = useState(0);   // measured, used to reclaim space when hidden
  const menuButtonRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Autohide bookkeeping — refs so the single persistent scroll listener (below)
  // reads the latest values without being re-attached, and so route changes can
  // re-arm the baseline without tearing the listener down.
  const lastScrollYRef = useRef(0);       // last observed scroller position
  const lastScrollMaxRef = useRef(0);     // last observed max-scroll (see geometryShrank)
  const needsBaselineRef = useRef(true);  // seed baseline on the next scroll event
  const settleUntilRef = useRef(0);       // suppress HIDE until this timestamp (post-(re)load settle)
  const navHeightRef = useRef(0);         // same as navHeight, readable from the scroll listener

  // Measure the navbar's natural height so the hidden state can pull it fully
  // off the top with a matching negative margin (reclaiming the space).
  useEffect(() => {
    if (!navRef.current) return;
    navHeightRef.current = navRef.current.offsetHeight;
    setNavHeight(navRef.current.offsetHeight);
  }, []);

  // Re-arm the autohide baseline on every route change (and initial mount). A
  // hard reload remounts this component, but a client-side navigation keeps the
  // scroll listener alive across pages — so without this reset the first scroll
  // on the NEW page (often a browser-restored / reflowed scroll position) would
  // be measured against the OLD page's lastScrollY and could wrongly hide the
  // navbar. Also opens a brief settle window during which we never auto-hide,
  // so a refresh/partial restore that re-applies a saved scroll position can't
  // yank the navbar off-screen (the "losing navbar on partial refresh" bug).
  useEffect(() => {
    needsBaselineRef.current = true;
    settleUntilRef.current =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) + 700;
  }, [pathname]);

  // Autohide on scroll — hide when scrolling down, reveal on scroll up or near
  // the top. Uses a CAPTURE-phase listener on the document so it catches scrolls
  // from BOTH the window (standard pages) and the inner `.page-scroll` region
  // used by the app-shell layouts (forage/quest/golem home), where the window
  // itself never scrolls. Scroll events don't bubble, but they still reach
  // capture-phase ancestor listeners.
  useEffect(() => {
    function handleScroll(event: Event) {
      const target = event.target as (Document | HTMLElement | null);

      // Ignore scrolls inside an open overlay — a nav/drawer (.forage-drawer-backdrop)
      // or a modal (.modal-backdrop). Their inner scrolling must not be mistaken for
      // page scroll and autohide the navbar: harmless on a full-screen modal (it's
      // covered), but on a desktop centered-card modal the navbar is still visible
      // around the dimmed backdrop and would visibly slide as the modal body scrolls.
      // Same reasoning for .flashcard-face-scroll: the rune study page locks its own
      // height (no page scroll) so this inner div is the only thing that can ever
      // fire a scroll event there, and it must not drive the navbar while the page
      // itself never moves. Same for .erow-scroll (ExpandableRowList's internal,
      // maxItemsInView-capped row list) — scrolling through the row list is not
      // page scroll, even though (unlike the other two) it does chain into an
      // actual page scroll once it hits either end; that follow-on page scroll
      // fires its own separate, un-excluded event and drives the navbar normally.
      if (target instanceof HTMLElement && target.closest(".forage-drawer-backdrop, .modal-backdrop, .flashcard-face-scroll, .erow-scroll")) {
        return;
      }

      const isWindow =
        !target || target === document || target === document.documentElement || target === document.body;
      const currentY = isWindow ? window.scrollY : (target as HTMLElement).scrollTop ?? 0;
      // Max scrollable distance of the active scroller. When this SHRINKS, the
      // shrink itself was caused by us hiding the navbar (its negative margin-top
      // grows the flex `.page`/`.page-scroll`, so the scroller's max-scroll drops
      // and the browser clamps scrollTop down by the navbar's height). That clamp
      // looks exactly like a scroll-up and would re-reveal the navbar, which then
      // re-shrinks the page — a loop that, at the bottom, makes the page jump up by
      // the navbar height and never lets a fast scroll settle at the true bottom.
      // So only react to GENUINE user scrolls (max unchanged); absorb the rest.
      const currentMax = isWindow
        ? document.documentElement.scrollHeight - window.innerHeight
        : (target as HTMLElement).scrollHeight - (target as HTMLElement).clientHeight;

      // FIRST scroll event after a (re)load or route change: adopt the scroller's
      // current position as the baseline rather than measuring a delta from 0. On
      // Firefox Android a refresh/partial restore re-applies the saved scroll
      // position as a single jump; against a stale 0 baseline that jump reads as a
      // scroll-DOWN and hides the navbar, which then stays off-screen until the
      // user scrolls back up (the reported bug). Seeding here makes the restore a
      // no-op for the navbar.
      if (needsBaselineRef.current) {
        needsBaselineRef.current = false;
        lastScrollYRef.current = currentY;
        lastScrollMaxRef.current = currentMax;
        if (currentY < REVEAL_NEAR_TOP_PX) setIsHidden(false);
        return;
      }

      const lastY = lastScrollYRef.current;
      const lastMax = lastScrollMaxRef.current;
      const geometryShrank = currentMax < lastMax - 1;
      // A downward move larger than any plausible per-frame swipe is a programmatic
      // jump (session-restore re-applying a saved scroll, a reflow, an anchor jump),
      // not the user scrolling down — never auto-hide on it.
      const isDownJump = currentY - lastY > 180;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      // Hiding reclaims the navbar's height into this scroller, so its max-scroll
      // drops by navHeight and the browser clamps scrollTop down to match. If what
      // is left is under the reveal-near-top threshold, that clamp lands back
      // inside it, we re-reveal, the space is given back, and the page bounces
      // between the two states forever — pinning the user ~30px in and leaving the
      // last navHeight px (on the rune study session: the rating + prev/next rows)
      // permanently unreachable. Short pages simply keep the navbar: with it shown
      // the scroller's range still covers the whole page, so the bottom IS
      // reachable — it's only the hide/re-reveal loop that locks it away.
      const hasRunwayToHide = currentMax - navHeightRef.current >= REVEAL_NEAR_TOP_PX;

      if (currentY < REVEAL_NEAR_TOP_PX) {
        setIsHidden(false); // always show near the top
      } else if (geometryShrank) {
        // Our own hide reclaimed space and clamped the scroll — not a user gesture.
      } else if (isDownJump) {
        // Restored/reflowed scroll jump, not a user scroll-down — absorb.
      } else if (currentY > lastY + 4) {
        // scrolling down (past the post-load settle window, and only when hiding
        // leaves enough scroll runway to stay hidden)
        if (now >= settleUntilRef.current && hasRunwayToHide) setIsHidden(true);
      } else if (currentY < lastY - 4) {
        setIsHidden(false); // scrolling up
      }

      lastScrollYRef.current = currentY;
      lastScrollMaxRef.current = currentMax;
    }

    document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  // Auth/landing pages are the only routes the middleware serves to an
  // unauthenticated visitor; every other route is guaranteed authenticated
  // (cookie session OR API key / Bearer). Gating purely on the pathname lets the
  // navbar render server-side on first paint — no async identity probe, so it's
  // present before page content instead of popping in afterward.
  const isAuthPage = pathname.startsWith("/auth");

  // Don't render on auth / similar unauthenticated pages.
  if (isAuthPage) {
    return null;
  }

  return (
    // NAVBAR — in flow at the top of the page (not pinned to the viewport). When
    // hidden it's pulled fully off the top via a negative margin, which reclaims
    // its space in both the normal-flow and flex (app-shell) layouts. No overflow
    // clip here, so the user dropdown can still extend below the bar.
    <nav
      ref={navRef}
      className="navbar relative z-40"
      style={{
        transition: "margin-top 200ms ease",
        marginTop: isHidden ? -navHeight : 0,
      }}
    >

      {/* NAVBAR CONTENT — full-width on desktop: the hamburger/logo sit flush
          to the left edge (px-4 gutter) and the user menu to the right, rather
          than being capped/centered in an 80rem column. Tighter vertical padding
          on phones, where the bar is competing with the content for height. */}
      <div className="w-full px-4 py-1 sm:py-2 flex items-center justify-between">

        {/* LEFT SIDE */}
        <div className="flex items-center gap-2">

          {/* MAIN NAV DRAWER — hamburger menu for all modules */}
          <MainNavDrawer />

          {/* HOME LINK */}
          <Link
            href="/"
            className="btn-link text-h1 !pl-0 cursor-pointer flex items-center gap-2"
          >
            {/* LOGO */}
            <Image
              src="/grimoire-logo.svg"
              alt=""
              width={28}
              height={28}
              priority
              className="w-6 h-6 sm:w-7 sm:h-7"
            />
            GRIMOIRE
          </Link>

          {children}
        </div>

        {/* RIGHT SIDE — USER MENU */}
        <div ref={menuButtonRef}>

          {/* MENU BUTTON */}
          <Button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="btn-link"
            title="User menu"
          >
            <CircleUser className="w-5 h-5" />
          </Button>
        </div>

        {/* DROPDOWN MENU */}
        <PopoverMenu open={isMenuOpen} onClose={() => setIsMenuOpen(false)} anchorRef={menuButtonRef}>

          {/* SETTINGS LINK (admin only) — a real <Link> so middle/cmd-click opens it in a new tab. */}
          <PermissionGuardClient>
            <Link
              href="/settings/ui/home"
              onClick={() => setIsMenuOpen(false)}
              className="popover-item"
            >
              <Settings className="w-4 h-4 mr-3" />
              Settings
            </Link>
          </PermissionGuardClient>

          {/* API KEYS LINK */}
          <Link
            href="/account/api-keys"
            onClick={() => setIsMenuOpen(false)}
            className="popover-item"
          >
            <KeyRound className="w-4 h-4 mr-3" />
            API keys
          </Link>

          {/* SIGN OUT */}
          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="popover-item"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign out
          </button>
        </PopoverMenu>
      </div>
    </nav>
  );
}
