import { Button } from "@/components/ui/button";
import { Bot, Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      <div className="ghost-watermark" aria-hidden="true">404</div>
      <div className="light-leak-blue" style={{ top: "10%", left: "5%" }} aria-hidden="true" />
      <div className="light-leak-cyan" style={{ bottom: "10%", right: "5%" }} aria-hidden="true" />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Bot icon */}
        <div className="flex justify-center mb-10">
          <div className="relative">
            <div className="absolute inset-0 bg-sky-500/25 rounded-full blur-2xl animate-pulse" />
            <div className="relative h-28 w-28 rounded-full bg-card border border-white/10 flex items-center justify-center shadow-[0_0_40px_rgba(14,165,233,0.3)]">
              <Bot className="h-14 w-14 text-sky-400" />
            </div>
          </div>
        </div>

        <div className="glass-card relative overflow-hidden px-8 py-10 mb-0">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />

          {/* 404 */}
          <div className="hero-gradient-text text-8xl font-black mb-4 leading-none">
            404
          </div>

          <h1 className="font-heading font-bold text-2xl text-white mb-4 tracking-tight">
            Bot Lost in the Matrix
          </h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            This page doesn't exist in our system. Your bots are still running — let's get you back to Command Center.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => window.history.back()}
              variant="outline"
              className="gap-2"
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
    </div>
  );
}
