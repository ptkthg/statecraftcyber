import styles from "./PageHeader.module.css";
type Props = { eyebrow: string; title: React.ReactNode; description: string; capturedAt?: string | null };
export default function PageHeader({eyebrow,title,description,capturedAt}:Props){ const validDate=capturedAt && Number.isFinite(Date.parse(capturedAt)); return <header className={`editorial-page-header ${styles.header}`}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-header-description">{description}</p>{validDate && <p className="page-header-date">Dados de <time dateTime={capturedAt}>{new Date(capturedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"})}</time> (horário de Brasília)</p>}</header>; }

