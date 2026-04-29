/**
 * Legal placeholder pages — Privacy, Terms, Docs.
 *
 * Final legal copy is reviewed by counsel before launch. These pages
 * exist so footer links don't 404 and to give beta users a clear
 * point of contact.
 */
import { Link } from "wouter";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import { BrandName } from "@/components/BrandName";

interface LegalPageProps {
  kind: "privacy" | "terms" | "docs";
}

const COPY: Record<LegalPageProps["kind"], { eyebrow: string; title: string; body: string[] }> = {
  privacy: {
    eyebrow: "Privacy Policy",
    title: "Your data, in plain English",
    body: [
      "Shop_a_Bot stores the credentials you connect (Shopify, Amazon, Etsy, social platforms, etc.) encrypted at rest with AES-256-GCM. We never sell your data.",
      "We collect only what's needed to run your bots — store metadata, orders, and the AI actions you authorize. You can disconnect any platform at any time from /storefronts and /integrations; tokens are revoked immediately.",
      "We use Stripe for billing and never store your card details. Auth is handled via OAuth — we don't see your password.",
      "Detailed policy with sub-processor list and data-retention schedule is published at launch. For questions in the meantime, email hello@shop-a-bot.app.",
    ],
  },
  terms: {
    eyebrow: "Terms of Service",
    title: "Fair, founder-friendly terms",
    body: [
      "Shop_a_Bot is a tool you operate. You are responsible for the actions your bots take on your behalf, and for the policies of the platforms you connect (Shopify, Amazon, Meta, TikTok, etc.).",
      "Subscriptions are billed monthly via Stripe. Cancel anytime from your billing portal — your bots stop running at the end of the current period; data is retained for 30 days, then deleted.",
      "Bots run on best-effort. We use circuit breakers, retries, and audit logs, but ultimately third-party APIs can fail. We don't guarantee specific revenue, conversion, or ROI outcomes.",
      "Full Terms with limitation-of-liability and dispute resolution are published at launch. For questions in the meantime, email hello@shop-a-bot.app.",
    ],
  },
  docs: {
    eyebrow: "Documentation",
    title: "Docs are coming",
    body: [
      "Public documentation is being written for launch. In the meantime, the in-app onboarding wizard walks you through every step — connect a store, link socials, fire your first Builder workflow.",
      "If you're an early user and need help, email hello@shop-a-bot.app and we'll respond within one business day.",
      "Power users can hit /api/trpc/* programmatically; OpenAPI-style schemas ship with the launch release.",
    ],
  },
};

export default function LegalPage({ kind }: LegalPageProps) {
  const { eyebrow, title, body } = COPY[kind];

  return (
    <div className="min-h-screen w-full bg-surface-base text-white relative overflow-hidden grain">
      <div className="aurora-mesh" aria-hidden="true" />
      <div className="absolute inset-0 grid-bg-dense opacity-30 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-6 py-20">
        <Link
          href="/landing"
          className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-sky-300 transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to <BrandName size="sm" />
        </Link>

        <span className="eyebrow mb-4">{eyebrow}</span>
        <h1 className="mt-3 text-4xl md:text-5xl font-heading font-black tracking-tighter mb-3">
          {title}
        </h1>
        <p className="text-white/40 text-sm font-mono">Last updated: April 2026</p>

        <div className="hairline my-10" />

        <div className="space-y-6">
          {body.map((para, i) => (
            <p key={i} className="text-white/65 leading-relaxed">{para}</p>
          ))}
        </div>

        <div className="bento-card mt-12 p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/85 mb-1">Talk to us</p>
            <p className="text-sm text-white/55">
              Questions, requests, or anything legal-adjacent — reach{" "}
              <a href="mailto:hello@shop-a-bot.app" className="text-sky-300 hover:text-sky-200 underline underline-offset-2">
                hello@shop-a-bot.app
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
