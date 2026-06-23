"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Visão geral", href: "/" },
  { label: "Briefings", href: "/threat-briefings" },
  { label: "Notícias", href: "/noticias" },
  { label: "Vulnerabilidades", href: "/cves", hint: "CVE" },
  { label: "Indicadores", href: "/iocs", hint: "IOC" },
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
          ? "bg-canvas/95 backdrop-blur-md border-b border-white/5"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-8 h-8">
              <div className="w-8 h-8 rounded-full border-2 border-brand flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border border-brand/60 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                </div>
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="absolute top-1/2 left-1/2 w-1/2 h-[1px] bg-gradient-to-r from-brand to-transparent origin-left radar-sweep"
                    style={{ transformOrigin: "left center" }}
                  />
                </div>
              </div>
            </div>
            <div className="leading-none">
              <div className="font-display text-sm font-bold tracking-widest text-white uppercase">
                <span className="text-brand">S</span>TATECRAFT
              </div>
              <div className="text-[9px] font-medium tracking-[0.2em] text-dim uppercase">
                Cyber Intelligence
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 text-sm transition-colors duration-200 border-b-2",
                    active
                      ? "text-white font-semibold border-brand"
                      : "text-dim font-medium border-transparent hover:text-white"
                  )}
                >
                  {item.label}
                  {item.hint && <span className="ml-1 text-[10px] text-dim/70">{item.hint}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Search */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new Event("open-search"))}
              className="flex items-center gap-2 border border-white/15 rounded-full px-4 py-1.5 text-[13px] font-semibold text-ink hover:bg-overlay transition-colors"
              aria-label="Abrir busca global (Ctrl+K)"
              title="Buscar (Ctrl+K)"
            >
              <Search size={15} aria-hidden />
              Buscar <span className="text-dim font-mono text-[11px]">⌘K</span>
            </button>
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
        <div id="mobile-nav" className="md:hidden bg-canvas border-t border-white/5">
          <div className="px-4 py-4 space-y-1">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "block px-3 py-2 text-sm font-medium rounded transition-colors",
                    active
                      ? "text-white font-semibold bg-white/5"
                      : "text-dim hover:text-white hover:bg-white/5"
                  )}
                >
                  {item.label}
                  {item.hint && <span className="ml-1 text-[10px] text-dim/70">{item.hint}</span>}
                </Link>
              );
            })}
            <div className="pt-3 border-t border-white/5">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  window.dispatchEvent(new Event("open-search"));
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-dim hover:text-white rounded transition-colors"
              >
                <Search size={16} aria-hidden />
                Buscar
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
