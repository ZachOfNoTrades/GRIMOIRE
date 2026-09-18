import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import DocumentTitleSync from "@/components/DocumentTitleSync";
import NavHistoryTracker from "@/components/NavHistoryTracker";
import ThemeSync from "@/components/ThemeSync";
import "./globals.css";
// Side-effect import: starts the in-process digest schedulers on first render.
// Lives here (Node-only server layout) instead of instrumentation.ts so that
// the mssql import graph never reaches the Edge runtime build.
import "@/lib/serverBootstrap";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["200", "400", "500", "700"],
  style: ["normal", "italic"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Grimoire",
  description: "Personal workout, flashcard, and quest tracker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* suppressHydrationWarning — the blocking pre-paint theme script below stamps
       data-theme on <html> during HTML parse (before React hydrates), so the
       element's attributes legitimately differ from the server markup. Scoped to
       this element; children still hydrate normally. */
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body>
        {/* PRE-PAINT THEME — stamps data-theme="light|dark" on <html> during HTML
            parse, before anything paints, so a user who pinned a theme never sees
            a flash of the other one. Reads the localStorage mirror of the saved
            preference (dbo.user_preferences via /api/users/me/preferences) and
            resolves "auto" against prefers-color-scheme here, which is why
            globals.css keys its dark palette off the attribute instead of a media
            query — a media query can't be overridden by a saved choice. An empty
            mirror (first load on this device) resolves to the OS preference, and
            ThemeSync corrects it right after mount. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=null;try{t=localStorage.getItem('grimoire.theme');}catch(e){}" +
              "if(t!=='light'&&t!=='dark'&&t!=='auto'){t='auto';}" +
              "var dark=t==='dark'||(t==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);" +
              "document.documentElement.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})();",
          }}
        />

        <Providers>
          {/* DOCUMENT TITLE SYNC — keeps the browser tab title as "Module · Page"
              for every route (client pages can't export server metadata). */}
          <DocumentTitleSync />

          {/* NAV HISTORY TRACKER — records the visited-route stack so back buttons
              can pop history only within a module (see lib/useGoBack). */}
          <NavHistoryTracker />

          {/* THEME SYNC — reconciles the painted theme with the preference saved
              for this user (another device may have changed it). */}
          <ThemeSync />

          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
