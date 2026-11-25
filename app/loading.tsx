import styles from "./route-state.module.css";

export default function Loading() {
  return (
    <main className={`editorial-page ${styles.page}`} aria-busy="true">
      <div className={styles.content} role="status" aria-live="polite">
        <p className={styles.label}>Statecraft / Aguarde</p>
        <h1>Carregando a publicação</h1>
        <p>Preparando o conteúdo desta página.</p>
      </div>
    </main>
  );
}
