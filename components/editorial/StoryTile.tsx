import Image from "next/image";
import Link from "next/link";

type Props = { section: string; title: string; description?: string; href: string; image: "congresso" | "antena" | "porto" | "datacenter"; meta?: string; imageAlt: string };
export default function StoryTile({ section, title, description, href, image, meta, imageAlt }: Props) {
  return <article className="story-tile"><div className="story-image"><Image src={`/editorial/${image === "datacenter" ? "datacenter-ache" : image}.webp`} alt={imageAlt} fill sizes="(max-width: 700px) 36vw, 18vw" /></div><div className="story-copy"><p className="eyebrow">{section}</p>{meta && <p className="story-meta">{meta}</p>}<h3><Link href={href}>{title}</Link></h3>{description && <p>{description}</p>}<Link href={href} className="under-link">Ler análise <span aria-hidden>→</span></Link></div></article>;
}
