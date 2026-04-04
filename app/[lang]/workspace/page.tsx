import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspacePage } from "@/components/pages/workspace-page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";

export async function generateMetadata({ params }: PageProps<"/[lang]/workspace">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const dictionary = await getDictionary(lang);
  return {
    title: `${dictionary.header.workspace} | ${dictionary.header.appTitle}`
  };
}

export default async function Page({ params }: PageProps<"/[lang]/workspace">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  return <WorkspacePage dictionary={dictionary.monitor} />;
}
