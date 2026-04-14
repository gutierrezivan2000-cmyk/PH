import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 glass border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-foreground">
            SOPH<span className="text-gradient">.IA</span>
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</Link>
          <Link href="#precios" className="hover:text-foreground transition-colors">Precios</Link>
          <Link href="#faq" className="hover:text-foreground transition-colors">FAQ</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Iniciar Sesion</Button>
          </Link>
          <Link href="/login">
            <Button size="sm">
              Prueba Gratis
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
