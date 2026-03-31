import { Modal } from '../../ui';
import { Button } from '../../ui';
import styles from './ConfirmDialog.module.css';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  children,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} width="min(360px, 90vw)">
      <Modal.Body>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        {children}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </Modal.Footer>
    </Modal>
  );
}
