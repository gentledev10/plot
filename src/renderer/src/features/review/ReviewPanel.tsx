import { StatusMessage } from '../../components/StatusMessage';
import styles from './ReviewPanel.module.css';

export function ReviewPanel() {
  return (
    <aside className={styles.panel} aria-label="AI review">
      <header className={styles.header}>
        <h2 className={styles.title}>AI review</h2>
      </header>
      <StatusMessage>Open a pull request to generate a review map.</StatusMessage>
    </aside>
  );
}
