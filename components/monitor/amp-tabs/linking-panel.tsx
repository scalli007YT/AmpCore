"use client";

import { useState } from "react";
import { getStoredAmpLinkConfig, useAmpActionLinkStore } from "@/stores/AmpActionLinkStore";
import { useProjectStore } from "@/stores/ProjectStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LinkingGroupsDialog } from "@/components/dialogs/linking-groups-dialog";
import { ConfirmActionDialog } from "@/components/dialogs/confirm-action-dialog";
import {
  AudioLinesIcon,
  Clock3Icon,
  Link2Icon,
  OctagonXIcon,
  SlidersHorizontalIcon,
  Volume2Icon,
  VolumeXIcon
} from "lucide-react";
import type { ReactNode } from "react";
import {
  LINK_SCOPES,
  createDefaultAmpLinkConfig,
  normalizeAmpLinkConfig,
  type AmpLinkConfig,
  type LinkGroup,
  type LinkScope
} from "@/lib/amp-action-linking";
import { useI18n } from "@/components/layout/i18n-provider";
import { getChannelLabels } from "@/lib/channel-labels";

type LinkingCopy = {
  triggerLabel: string;
  triggerIcon: ReactNode;
  title: string;
  description: string;
};

function withScopeGroups(linking: AmpLinkConfig, scope: LinkScope, groups: LinkGroup[]): AmpLinkConfig {
  const next = normalizeAmpLinkConfig({
    ...linking,
    scopes: {
      ...linking.scopes,
      [scope]: {
        enabled: groups.length > 0,
        groups
      }
    }
  });

  next.enabled = LINK_SCOPES.some((item) => next.scopes[item].enabled);
  return next;
}

function clearScopes(linking: AmpLinkConfig, scopes: LinkScope[]): AmpLinkConfig {
  const defaults = createDefaultAmpLinkConfig();
  const next = normalizeAmpLinkConfig({
    ...linking,
    scopes: {
      ...linking.scopes,
      ...Object.fromEntries(scopes.map((scope) => [scope, defaults.scopes[scope]]))
    }
  });

  next.enabled = LINK_SCOPES.some((scope) => next.scopes[scope].enabled);
  return next;
}

function ScopeLinkingDialog({
  mac,
  scope,
  groups,
  copy,
  channelLabels
}: {
  mac: string;
  scope: LinkScope;
  groups: LinkGroup[];
  copy: LinkingCopy;
  channelLabels: string[];
}) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linking = getStoredAmpLinkConfig(byMac, mac);
  const { updateAmpLinking } = useProjectStore();
  const linkDict = dict.dialogs.linkingGroups;

  return (
    <LinkingGroupsDialog
      triggerLabel={copy.triggerLabel}
      triggerIcon={copy.triggerIcon}
      triggerMode="card"
      title={copy.title}
      description={copy.description}
      currentGroupsLabel={linkDict.currentGroupsLabel}
      buildGroupLabel={linkDict.buildGroupLabel}
      emptyText={linkDict.emptyText}
      helperText={linkDict.helperText}
      clearAllLabel={linkDict.clearAllLabel}
      addGroupLabel={linkDict.addGroupLabel}
      offLabel={linkDict.offLabel}
      selectedCountSuffix={linkDict.selectedCountSuffix}
      validationMessages={{
        alreadyLinked: linkDict.validation.alreadyLinked,
        tooFewChannels: linkDict.validation.tooFewChannels,
        channelOutOfRange: linkDict.validation.channelOutOfRange,
        invalidLinkableCount: linkDict.validation.invalidLinkableCount,
        invalidLink: linkDict.validation.invalidLink
      }}
      channelLabels={channelLabels}
      value={groups}
      onSave={(nextGroups) => updateAmpLinking(mac, withScopeGroups(linking, scope, nextGroups))}
    />
  );
}

export function LinkingPanel({ mac, channelCount }: { mac: string; channelCount: number }) {
  const dict = useI18n();
  const byMac = useAmpActionLinkStore((state) => state.byMac);
  const linking = getStoredAmpLinkConfig(byMac, mac);
  const { updateAmpLinking } = useProjectStore();
  const linkDict = dict.dialogs.linkingGroups;
  const [pendingResetTarget, setPendingResetTarget] = useState<"input" | "output" | null>(null);
  const inputScopes: LinkScope[] = ["muteIn", "inputEq"];
  const outputScopes: LinkScope[] = [
    "muteOut",
    "noiseGateOut",
    "volumeOut",
    "polarityOut",
    "trimOut",
    "delayOut",
    "outputEq"
  ];
  const hasInputLinking = inputScopes.some((scope) => linking.scopes[scope].groups.length > 0);
  const hasOutputLinking = outputScopes.some((scope) => linking.scopes[scope].groups.length > 0);

  const maxGroupChannel = Object.values(linking.scopes)
    .flatMap((scope) => scope.groups)
    .flatMap((group) => group.channels)
    .reduce((max, channel) => Math.max(max, channel), -1);
  const effectiveChannelCount = Math.max(channelCount, maxGroupChannel + 1);
  const channelLabels = getChannelLabels(effectiveChannelCount);

  const resetCopy =
    pendingResetTarget === "input"
      ? {
          title: linkDict.resetInputTitle,
          description: linkDict.resetInputDescription,
          scopes: inputScopes
        }
      : pendingResetTarget === "output"
        ? {
            title: linkDict.resetOutputTitle,
            description: linkDict.resetOutputDescription,
            scopes: outputScopes
          }
        : null;

  return (
    <>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={!hasInputLinking}
            onClick={() => setPendingResetTarget("input")}
          >
            {linkDict.resetSectionLabel}
          </Button>
        </div>
        <ScopeLinkingDialog
          mac={mac}
          scope="muteIn"
          groups={linking.scopes.muteIn.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Mute",
            triggerIcon: <VolumeXIcon className="size-4" />,
            title: linkDict.inputMuteTitle,
            description: linkDict.inputMuteDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="inputEq"
          groups={linking.scopes.inputEq.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "EQ",
            triggerIcon: <SlidersHorizontalIcon className="size-4" />,
            title: linkDict.inputEqTitle,
            description: linkDict.inputEqDescription
          }}
        />

        <Separator />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={!hasOutputLinking}
            onClick={() => setPendingResetTarget("output")}
          >
            {linkDict.resetSectionLabel}
          </Button>
        </div>

        <ScopeLinkingDialog
          mac={mac}
          scope="muteOut"
          groups={linking.scopes.muteOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Mute",
            triggerIcon: <VolumeXIcon className="size-4" />,
            title: linkDict.outputMuteTitle,
            description: linkDict.outputMuteDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="noiseGateOut"
          groups={linking.scopes.noiseGateOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Noise Gate",
            triggerIcon: <AudioLinesIcon className="size-4" />,
            title: linkDict.noiseGateTitle,
            description: linkDict.noiseGateDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="volumeOut"
          groups={linking.scopes.volumeOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Volume",
            triggerIcon: <Volume2Icon className="size-4" />,
            title: linkDict.outputVolumeTitle,
            description: linkDict.outputVolumeDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="polarityOut"
          groups={linking.scopes.polarityOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Polarity",
            triggerIcon: <OctagonXIcon className="size-4" />,
            title: linkDict.polarityTitle,
            description: linkDict.polarityDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="trimOut"
          groups={linking.scopes.trimOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Trim",
            triggerIcon: <Link2Icon className="size-4" />,
            title: linkDict.trimOutTitle,
            description: linkDict.trimOutDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="delayOut"
          groups={linking.scopes.delayOut.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "Delay",
            triggerIcon: <Clock3Icon className="size-4" />,
            title: linkDict.delayOutTitle,
            description: linkDict.delayOutDescription
          }}
        />

        <ScopeLinkingDialog
          mac={mac}
          scope="outputEq"
          groups={linking.scopes.outputEq.groups}
          channelLabels={channelLabels}
          copy={{
            triggerLabel: "EQ",
            triggerIcon: <SlidersHorizontalIcon className="size-4" />,
            title: linkDict.outputEqTitle,
            description: linkDict.outputEqDescription
          }}
        />
      </div>

      <ConfirmActionDialog
        open={pendingResetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPendingResetTarget(null);
        }}
        title={resetCopy?.title ?? ""}
        description={resetCopy?.description ?? ""}
        confirmLabel={linkDict.resetSectionConfirmLabel}
        onConfirm={async () => {
          if (!resetCopy) return;
          await updateAmpLinking(mac, clearScopes(linking, resetCopy.scopes));
          setPendingResetTarget(null);
        }}
      />
    </>
  );
}
