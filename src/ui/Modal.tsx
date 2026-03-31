import { useEffect } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
}

interface ModalHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

function ModalHeader({ children, onClose, className }: ModalHeaderProps) {
  return (
    <div className={`${styles.header} ${className ?? ''}`}>
      <span className={styles.headerTitle}>{children}</span>
      {onClose && (
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      )}
    </div>
  );
}

function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={`${styles.body} ${className ?? ''}`}>
      {children}
    </div>
  );
}

function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={`${styles.footer} ${className ?? ''}`}>
      {children}
    </div>
  );
}

function Modal({ open, onClose, children, className, style, width }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const modalStyle: React.CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...style,
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={`${styles.modal} ${className ?? ''}`}
        style={Object.keys(modalStyle).length > 0 ? modalStyle : undefined}
      >
        {children}
      </div>
    </>
  );
}

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export { Modal };
