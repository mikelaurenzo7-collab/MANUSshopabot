import { Button } from "@/components/ui/button";
import { Bot, Home, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Bot icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <div className="relative h-24 w-24 rounded-full bg-card border border-border flex items-center justify-center">
              <Bot className="h-12 w-12 text-primary" />
            </div>
          </div>
        </div>

        {/* Error code */}
        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-violet-400 mb-4 leading-none">
          404
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">
          Bot Lost in the Matrix
        </h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          This page doesn't exist in our system. Your bots are still running — let's get you back to Command Center.
        </p>

        <div
          id="not-found-button-group"
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
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
  );
}
