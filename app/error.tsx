"use client";

import Link from "next/link";
import styles from "./route-state.module.css";

export default function ErrorPage({ reset, unstable_retry }: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return (
    <main className={`editorial-page ${styles.page}`}>
      <div className={styles.content}>
        <p className={styles.label}>Statecraft / Conteúdo indisponível</p>
        <h1>Não foi possível abrir esta página</h1>
        <p>O conteúdo está temporariamente indisponível. Tente carregar a página novamente.</p>
        <div className={styles.actions}>
          <button type="button" onClick={unstable_retry ?? reset}>Tentar de novo</button>
          <Link href="/">Voltar à página inicial</Link>
        </div>
      </div>
    </main>
  );
}
