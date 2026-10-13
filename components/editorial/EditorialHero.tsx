import Image from "next/image";
import Link from "next/link";

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description: string;
  image?: "congresso" | "antena" | "porto" | "datacenter";
  imageAlt?: string;
  labels?: string[];
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
};

export default function EditorialHero({ eyebrow, title, subtitle, description, image = "congresso", imageAlt, labels = ["AMEAÇAS", "BRASIL", "AMÉRICA LATINA"], primary, secondary }: Props) {
  return <section className="editorial-hero">
    <div className="editorial-hero-copy"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{subtitle && <h2>{subtitle}</h2>}<p className="hero-description">{description}</p>{(primary || secondary) && <div className="hero-actions">{primary && <Link className="editorial-button" href={primary.href}>{primary.label} <span aria-hidden>→</span></Link>}{secondary && <Link className="text-link" href={secondary.href}>{secondary.label} <span aria-hidden>→</span></Link>}</div>}</div>
    <div className={`hero-art hero-art-${image}`}><Image src={`/editorial/${image === "datacenter" ? "datacenter-ache" : image}.webp`} alt={imageAlt ?? "Fotografia documental utilizada em composição editorial"} fill sizes="(max-width: 900px) 100vw, 55vw" className="hero-photo" priority /><div className="photo-tint" /><Image src="/editorial/south-america.svg" alt="" fill sizes="(max-width: 900px) 100vw, 55vw" className="hero-map" aria-hidden="true" /><div className="art-grid" aria-hidden="true" /><div className="art-label">{labels.map((label) => <span key={label}>{label}</span>)}</div><span className="art-rule" aria-hidden="true" /></div>
  </section>;
}
