import { Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AmpUnreachableCardProps {
  ampName: string;
  ip?: string;
  message: string;
}

export function AmpUnreachableCard({ ampName, ip, message }: AmpUnreachableCardProps) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/50 bg-card/20">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              OFFLINE
            </p>
            <h2 className="truncate text-lg font-semibold leading-tight">{ampName}</h2>
          </div>
          <Badge variant="outline" className="font-mono">
            {ip ?? "no ip"}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-[220px] items-center justify-center px-6 py-10">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <Unplug className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}
