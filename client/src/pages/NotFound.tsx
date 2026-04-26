import { Button } from "@/components/ui/button";
import { Bot, Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#050507] relative overflow-hidden grain">
      {/* Background effects — match landing/hero cinematic feel */}
      <div className="aurora-mesh" aria-hidden="true" />
      <div className="absolute inset-0 grid-bg-dense opacity-30 pointer-events-none" />
      <div className="light-leak-blue absolute -top-32 left-1/3 opacity-50" />
      <div className="light-leak-cyan absolute bottom-0 right-1/3 opacity-40" />

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto page-enter">
        {/* Bot brand mark */}
        <div className="flex justify-center mb-10">
          <div className="brand-mark" style={{ width: "5rem", height: "5rem", borderRadius: "1.25rem" }}>
            <Bot className="w-9 h-9 text-white" />
          </div>
        </div>

        {/* Error code with hero shine */}
        <div className="lux-numeral text-8xl mb-4 hero-title-shine" aria-label="404">
          404
        </div>

        <span className="eyebrow mb-3" aria-hidden="true">Status — Page Missing</span>

        <h1 className="mt-3 text-2xl md:text-3xl font-heading font-black tracking-tight text-white mb-3">
          Bot lost in the matrix
        </h1>
        <p className="text-white/55 mb-10 leading-relaxed max-w-md mx-auto">
          This page doesn't exist in our system. Your bots are still running — let's get you back to Command Center.
        </p>

        <div
          id="not-found-button-group"
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Button
            onClick={() => window.history.back()}
            variant="outline"
            className="gap-2 border-white/10 text-white/70 hover:border-sky-400/40 hover:text-white hover:bg-sky-500/[0.06]"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
          <Button
            onClick={() => setLocation("/")}
            className="btn-glow gap-2"
          >
            <Home className="w-4 h-4" />
            Command Center
          </Button>
        </div>
      </div>
    </div>
  );
}
