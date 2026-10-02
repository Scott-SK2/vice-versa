import { Shell } from "@/components/participant/Shell";
import { ParticipantProvider } from "@/lib/participant/client/store";

export const metadata = { title: "VICE VERSA — Deux regards, deux continents" };

export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParticipantProvider>
      <Shell>{children}</Shell>
    </ParticipantProvider>
  );
}
