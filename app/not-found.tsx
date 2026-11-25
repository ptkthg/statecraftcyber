import Link from "next/link";
import styles from "./route-state.module.css";

export default function NotFound() {
  return (
    <main className={`editorial-page ${styles.page}`}>
      <div className={styles.content}>
        <p className={styles.label}>Statecraft / 404</p>
        <h1>Página não encontrada</h1>
        <p>Este endereço não corresponde a um conteúdo disponível na publicação.</p>
        <div className={styles.actions}><Link href="/">Voltar à página inicial</Link></div>
      </div>
    </main>
  );
}
