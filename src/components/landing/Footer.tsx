import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">
              SOPH<span className="text-gradient">.IA</span>
            </span>
          </div>

          {/* Links */}
          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
            <Link href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</Link>
            <Link href="#precios" className="hover:text-foreground transition-colors">Precios</Link>
            <Link href="#faq" className="hover:text-foreground transition-colors">FAQ</Link>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground md:text-right">
            &copy; {new Date().getFullYear()} SOPH.IA. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
