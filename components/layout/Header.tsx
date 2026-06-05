"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Threat Briefings", href: "/threat-briefings" },
  { label: "Notícias", href: "/noticias" },
  { label: "CVEs", href: "/cves" },
  { label: "IOCs", href: "/iocs" },
  { label: "Sobre", href: "/sobre" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[#050505]/95 backdrop-blur-md border-b border-white/5"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-8 h-8">
              <div className="w-8 h-8 rounded-full border-2 border-red-600 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border border-red-600/60 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                </div>
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="absolute top-1/2 left-1/2 w-1/2 h-[1px] bg-gradient-to-r from-red-600 to-transparent origin-left radar-sweep"
                    style={{ transformOrigin: "left center" }}
                  />
                </div>
              </div>
            </div>
            <div className="leading-none">
              <div className="text-sm font-black tracking-widest text-white uppercase">
                <span className="text-red-600">S</span>TATECRAFT
              </div>
              <div className="text-[9px] font-medium tracking-[0.2em] text-[#A1A1AA] uppercase">
                Cyber Intelligence
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded transition-all duration-200",
                  pathname === item.href
                    ? "text-red-500"
                    : "text-[#A1A1AA] hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* CTA + Search */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new Event("open-search"))}
              className="p-2 text-neutral-400 hover:text-white transition-colors rounded"
              aria-label="Abrir busca global (Ctrl+K)"
              title="Buscar (Ctrl+K)"
            >
              <Search size={18} aria-hidden />
            </button>
            <Link
              href="/threat-briefings"
              className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded transition-all duration-200 hover:shadow-[0_0_20px_rgba(229,9,20,0.4)]"
            >
              Ver Briefings
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="mobile-nav" className="md:hidden bg-[#0A0A0A] border-t border-white/5">
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block px-3 py-2 text-sm font-medium rounded transition-colors",
                  pathname === item.href
                    ? "text-red-500 bg-red-950/20"
                    : "text-[#A1A1AA] hover:text-white hover:bg-white/5"
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-white/5 space-y-2">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  window.dispatchEvent(new Event("open-search"));
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-400 hover:text-white rounded transition-colors"
              >
                <Search size={16} aria-hidden />
                Buscar
              </button>
              <Link
                href="/threat-briefings"
                className="block w-full text-center px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded"
                onClick={() => setMobileOpen(false)}
              >
                Ver Briefings
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
