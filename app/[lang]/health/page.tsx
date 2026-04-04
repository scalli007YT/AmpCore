import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HealthPage } from "@/components/pages/health-page";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { hasLocale } from "@/lib/i18n/config";

export async function generateMetadata({ params }: PageProps<"/[lang]/health">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) {
    return {};
  }

  const dictionary = await getDictionary(lang);
  return {
    title: `${dictionary.header.health} | ${dictionary.header.appTitle}`
  };
}

export default async function Page({ params }: PageProps<"/[lang]/health">) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  return <HealthPage dictionary={dictionary.monitor} />;
}
