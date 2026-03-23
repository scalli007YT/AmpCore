"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { EyeOff, Eye, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/layout/i18n-provider";

interface EqBandActionMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandIdx: number | null;
  bandBypassed?: boolean;
  bandSupportsGain?: boolean;
  anchorPos: { x: number; y: number };
  onBypassToggle?: (bandIdx: number) => void;
  onResetGain?: (bandIdx: number) => void;
}

export function EqBandActionMenu({
  open,
  onOpenChange,
  bandIdx,
  bandBypassed = false,
  bandSupportsGain = true,
  anchorPos,
  onBypassToggle,
  onResetGain
}: EqBandActionMenuProps) {
  const dict = useI18n();
  const menuDict = dict.menus.eqBand;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          className="absolute h-px w-px opacity-0 pointer-events-none"
          style={{ left: anchorPos.x, top: anchorPos.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="min-w-40">
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => {
            if (bandIdx !== null) onBypassToggle?.(bandIdx);
            onOpenChange(false);
          }}
        >
          {bandBypassed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {bandBypassed ? menuDict.enable : menuDict.bypass}
        </DropdownMenuItem>
        {bandSupportsGain && (
          <DropdownMenuItem
            className="whitespace-nowrap"
            onSelect={() => {
              if (bandIdx !== null) onResetGain?.(bandIdx);
              onOpenChange(false);
            }}
          >
            <RotateCcw className="h-4 w-4" />
            {menuDict.resetGain}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
