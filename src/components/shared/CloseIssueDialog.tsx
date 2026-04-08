import { Modal, Button } from '../../ui';
import styles from './ConfirmDialog.module.css';

interface Props {
  open: boolean;
  onCancel: () => void;
  onClose: () => void;
  onSolved: () => void;
}

export default function CloseIssueDialog({ open, onCancel, onClose, onSolved }: Props) {
  return (
    <Modal open={open} onClose={onCancel} width="min(360px, 90vw)">
      <Modal.Body>
        <h2 className={styles.title}>Close issue</h2>
        <p className={styles.message}>
          How would you like to close this issue?
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={onSolved}>Solved</Button>
      </Modal.Footer>
    </Modal>
  );
}
