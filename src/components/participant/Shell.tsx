"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useParticipant } from "@/lib/participant/client/store";

const TAB_PREFIXES = ["/vv26/parcours", "/vv26/carte", "/vv26/scanner", "/vv26/s/"];

/** Bandeau de progression, bandeau de test et barre d'onglets conditionnelle (05 § 1). */
export function Shell({ children }: { children: React.ReactNode }) {
  const { run, me, t, status } = useParticipant();
  const path = usePathname();
  const showTabs = TAB_PREFIXES.some((p) => path.startsWith(p)) && !path.endsWith("/ok");
  const showProgress = status === "ready" && me && path !== "/vv26" && !path.startsWith("/vv26/merci") && !path.startsWith("/vv26/reset");
  const tabs = [
    { href: "/vv26/parcours", label: t("tabs.parcours"), icon: "☰" },
    { href: "/vv26/carte", label: t("tabs.carte"), icon: "⌖" },
    { href: "/vv26/scanner", label: t("tabs.scanner"), icon: "#" },
  ];
  return (
    <div className="flex min-h-full flex-col">
      {run?.kind === "test" && (
        <div className="bg-state-progress px-4 py-1 text-center text-xs font-bold uppercase tracking-wide text-state-progress-text">{t("app.testBanner")}</div>
      )}
      {showProgress && (
        <div className="sticky top-0 z-20 bg-green-deep px-4 py-2 text-paper" aria-live="polite">
          <div className="mx-auto flex max-w-md items-center justify-between text-sm font-bold">
            <span>{t("app.progress", { completed: me.progress.completed, required: me.progress.required })}</span>
            <span>{me.progress.percent} %</span>
          </div>
          <div className="mx-auto mt-1 h-1.5 max-w-md overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="h-full rounded-full bg-yellow transition-all" style={{ width: `${me.progress.percent}%` }} />
          </div>
        </div>
      )}
      <div className={`flex flex-1 flex-col ${showTabs ? "pb-20" : ""}`}>{children}</div>
      {showTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-state-locked bg-white" aria-label="Navigation">
          <ul className="mx-auto flex max-w-md">
            {tabs.map((tab) => {
              const active = path.startsWith(tab.href);
              return (
                <li key={tab.href} className="flex-1">
                  <Link
                    href={tab.href}
                    className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? "text-green-deep" : "text-muted"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="text-xl" aria-hidden>{tab.icon}</span>
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
