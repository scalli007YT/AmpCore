"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

export function PrereleaseStartupDialog() {
  const dict = useI18n();
  const [open, setOpen] = useState(true);
  const [appVersion, setAppVersion] = useState("unknown");

  useEffect(() => {
    let isMounted = true;

    void window.electronWindow
      ?.getVersion()
      .then((version) => {
        if (isMounted) {
          setAppVersion(version || "unknown");
        }
      })
      .catch(() => {
        if (isMounted) {
          setAppVersion("unknown");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAccept = () => {
    setOpen(false);
  };

  const handleCloseApp = async () => {
    if (window.electronWindow?.isDesktop) {
      await window.electronWindow.close();
      return;
    }

    window.close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{dict.dialogs.prerelease.title}</DialogTitle>
          <DialogDescription>{dict.dialogs.prerelease.description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{dict.dialogs.prerelease.versionLabel}:</span> {appVersion}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void handleCloseApp()}>
            {dict.dialogs.prerelease.closeApp}
          </Button>
          <Button onClick={handleAccept}>{dict.dialogs.prerelease.accept}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
