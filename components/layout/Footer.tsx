import Link from "next/link";
import { Mail, Shield } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#050505] border-t border-white/5 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-10 flex flex-col md:flex-row items-start justify-between gap-8">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full border-2 border-red-600 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border border-red-600/60 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                </div>
              </div>
              <div className="leading-none">
                <div className="text-sm font-black tracking-widest text-white uppercase">
                  ST<span className="text-red-600">A</span>TECRAFT
                </div>
                <div className="text-[9px] font-medium tracking-[0.2em] text-[#A1A1AA] uppercase">
                  Cyber Intelligence
                </div>
              </div>
            </Link>
            <p className="text-sm text-[#A1A1AA] leading-relaxed">
              Plataforma de inteligência de ameaças com dados em tempo real de fontes abertas e feeds especializados.
            </p>
          </div>

          {/* Nav columns */}
          <div className="flex gap-16">
            <div>
              <h4 className="text-xs font-semibold tracking-widest text-white uppercase mb-4">Plataforma</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/threat-briefings" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
                    Threat Briefings
                  </Link>
                </li>
                <li>
                  <Link href="/noticias" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
                    Notícias
                  </Link>
                </li>
                <li>
                  <Link href="/iocs" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
                    Busca de IOCs
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold tracking-widest text-white uppercase mb-4">Empresa</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/sobre" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
                    Sobre a Statecraft
                  </Link>
                </li>
                <li>
                  <a href="mailto:contato@statecraft.com.br" className="text-sm text-[#A1A1AA] hover:text-white transition-colors">
                    Contato
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#666]">
            © 2026 Statecraft Cyber Intelligence. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Plataforma operacional</span>
            <span className="text-[#333]">·</span>
            <span>Brasil</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
