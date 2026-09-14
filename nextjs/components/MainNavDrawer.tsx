"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Menu,
  X,
  ChevronDown,
  Settings,
  Dumbbell,
  History,
  BarChart3,
  MapPin,
  LayoutTemplate,
  User,
  Layers,
  Apple,
  ChefHat,
  BookOpen,
  Target,
  CalendarDays,
  Skull,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Module } from "@/types/module";
import { iconMap, defaultIcon } from "@/lib/iconMap";
import VersionBadge from "@/components/VersionBadge";

// A single navigable page within a module (route = /modules/<slug>/ui/<sub>).
interface ModulePage {
  label: string;
  sub: string;
  icon: LucideIcon;
}

// Major pages per module slug. Modules not listed here fall back to a lone
// "Home" row (DEFAULT_PAGES) so a newly-added module still gets an entry.
const MODULE_PAGES: Record<string, ModulePage[]> = {
  golem: [
    { label: "Home", sub: "home", icon: Home },
    { label: "Exercises", sub: "exercises", icon: Dumbbell },
    { label: "History", sub: "history", icon: History },
    { label: "Volume", sub: "volume", icon: BarChart3 },
    { label: "Locations", sub: "locations", icon: MapPin },
    { label: "Templates", sub: "templates", icon: LayoutTemplate },
    { label: "Profile", sub: "profile", icon: User },
    { label: "Settings", sub: "settings", icon: Settings },
  ],
  rune: [
    { label: "Home", sub: "home", icon: Home },
    { label: "Decks", sub: "decks", icon: Layers },
    { label: "Settings", sub: "settings", icon: Settings },
  ],
  quest: [
    { label: "Home", sub: "home", icon: Home },
    { label: "Calendar", sub: "calendar", icon: CalendarDays },
    { label: "Settings", sub: "settings", icon: Settings },
  ],
  damnation: [
    { label: "Home", sub: "home", icon: Skull },
    { label: "Settings", sub: "settings", icon: Settings },
  ],
  forage: [
    { label: "Home", sub: "home", icon: Home },
    { label: "Food log", sub: "foods", icon: Apple },
    { label: "Recipes", sub: "recipes", icon: ChefHat },
    { label: "Library", sub: "library", icon: BookOpen },
    { label: "Strategy", sub: "strategy", icon: Target },
    { label: "Settings", sub: "settings", icon: Settings },
  ],
};

const DEFAULT_PAGES: ModulePage[] = [{ label: "Home", sub: "home", icon: Home }];

// Global navigation drawer. Renders a hamburger trigger inline (placed on the
// left of the navbar) plus a left-anchored slide-in panel listing the dashboard
// and every major page of every active module. Reuses the `.forage-drawer-*`
// panel/backdrop CSS; module sections get their own `.main-nav-*` styling.
export default function MainNavDrawer() {
  const pathname = usePathname() || "";

  // DATA
  const [modules, setModules] = useState<Module[]>([]);

  // STATE
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // gate the portal until client mount
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null); // the single open module section

  // Refs to each section header button, so we can scroll a newly-opened one to the top.
  const sectionHeaderRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toggle one module's accordion section. Opening one closes any other (single-open).
  function toggleSection(slug: string) {
    setExpandedSlug((prev) => (prev === slug ? null : slug));
  }

  // Auto-expand the section for the module the user is currently in.
  useEffect(() => {
    const match = pathname.match(/^\/modules\/([^/]+)/);
    if (match) setExpandedSlug(match[1]);
  }, [pathname]);

  // When a section opens, scroll its header row to the top of the scrollable body.
  useEffect(() => {
    if (!isOpen || !expandedSlug) return;
    const header = sectionHeaderRefs.current[expandedSlug];
    if (!header) return;
    const id = requestAnimationFrame(() => {
      header.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [expandedSlug, isOpen]);

  // The drawer overlay is portaled to <body> so it's a clean top-level overlay,
  // independent of the navbar's stacking context / positioning. Gate the portal
  // until after mount so SSR and first client render match.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch the active modules once (same source as the dashboard grid).
  useEffect(() => {
    async function fetchModules() {
      try {
        const response = await fetch("/api/modules");
        if (response.ok) {
          setModules(await response.json());
        }
      } catch (error) {
        console.error("Error fetching modules:", error);
      }
    }

    fetchModules();
  }, []);

  // Close on route change (router.push from inside the drawer triggers this).
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock page scroll while the drawer is open, so wheel/touch over the backdrop
  // can't scroll the page (or hide the autohiding navbar) behind the overlay.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <>
      {/* MENU TRIGGER — icon-only inline button on the far left of the navbar. */}
      <Button
        className="btn-link !pl-0 !pr-1.5 sm:!pr-2"
        onClick={() => setIsOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="main-nav-drawer"
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* DRAWER BACKDROP + PANEL — portaled to <body> so the navbar's transform
          doesn't become its containing block. */}
      {mounted && isOpen && createPortal(
        // BACKDROP
        <div
          className="forage-drawer-backdrop"
          onClick={() => setIsOpen(false)}
          role="presentation"
        >
          {/* PANEL */}
          <aside
            id="main-nav-drawer"
            className="forage-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            aria-label="Site navigation"
          >

            {/* HEADER */}
            <div className="forage-drawer-header">
              <span className="text-card-title">Navigation</span>
              <Button className="btn-link" onClick={() => setIsOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* SCROLLABLE BODY */}
            <div className="main-nav-body">

              {/* DASHBOARD LINK — real <Link> so middle/cmd-click opens it in a new tab. */}
              <nav className="forage-drawer-list" aria-label="General">
                <Link
                  href="/"
                  className={`btn ${pathname === "/" ? "btn-blue forage-drawer-item" : "btn-off forage-drawer-item"}`}
                  onClick={() => setIsOpen(false)}
                  aria-current={pathname === "/" ? "page" : undefined}
                >
                  <Home className="w-4 h-4" /> Dashboard
                </Link>
              </nav>

              {/* PER-MODULE SECTIONS — each is a collapsible accordion. */}
              {modules.map((module) => {
                const SectionIcon = iconMap[module.icon as string] || defaultIcon;
                const pages = MODULE_PAGES[module.slug] || DEFAULT_PAGES;
                const isExpanded = expandedSlug === module.slug;
                const sectionId = `main-nav-sec-${module.slug}`;

                return (
                  // MODULE SECTION
                  <div key={module.id}>

                    {/* SECTION HEADER — toggles the section open/closed. */}
                    <button
                      type="button"
                      ref={(el) => {
                        sectionHeaderRefs.current[module.slug] = el;
                      }}
                      className="main-nav-section"
                      onClick={() => toggleSection(module.slug)}
                      aria-expanded={isExpanded}
                      aria-controls={sectionId}
                    >
                      <SectionIcon className="w-4 h-4" />
                      <span className="main-nav-section-label">{module.name}</span>
                      <ChevronDown className={`main-nav-chevron w-4 h-4 ${isExpanded ? "is-open" : ""}`} />
                    </button>

                    {/* SECTION PAGES — rendered only while expanded. Real <Link>s so
                        middle/cmd-click opens them in a new tab. */}
                    {isExpanded && (
                      <nav id={sectionId} className="forage-drawer-list" aria-label={module.name}>
                        {pages.map((page) => {
                          const route = `/modules/${module.slug}/ui/${page.sub}`;
                          const active = pathname === route || pathname.startsWith(`${route}/`);
                          const Icon = page.icon;
                          return (
                            <Link
                              key={page.sub}
                              href={route}
                              className={`btn ${active ? "btn-blue forage-drawer-item" : "btn-off forage-drawer-item"}`}
                              onClick={() => setIsOpen(false)}
                              aria-current={active ? "page" : undefined}
                            >
                              <Icon className="w-4 h-4" /> {page.label}
                            </Link>
                          );
                        })}
                      </nav>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BUILD FOOTER — outside .main-nav-body so it stays pinned to the
                bottom of the panel while the module list scrolls. Carries the
                full version + commit that the navbar chip truncates on a phone. */}
            <VersionBadge />
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
