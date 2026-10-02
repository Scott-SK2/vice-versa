"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useParticipant } from "@/lib/participant/client/store";
import { Loading } from "../ui";
import { NoRunScreen } from "./Home";

/** Protège un écran : exige une séance live et une session ; sinon redirige. */
export function Guard({ children }: { children: React.ReactNode }) {
  const { status, t } = useParticipant();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous") router.replace("/vv26");
    if (status === "closed") router.replace("/vv26/merci");
  }, [status, router]);
  if (status === "loading") return <Loading label={t("common.loading")} />;
  if (status === "none") return <NoRunScreen />;
  if (status !== "ready") return <Loading label={t("common.loading")} />;
  return <>{children}</>;
}
