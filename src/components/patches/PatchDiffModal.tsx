import PatchDetail from './PatchDetail';
import type { PatchRef } from '../../types/kanban';
import { Modal, useResizableDivider } from '../../ui';
import { Button } from '../../ui';
import styles from './PatchDiffModal.module.css';

interface Props {
  open: boolean;
  patch: PatchRef;
  issueId?: string;
  onPatchStateChange?: () => void;
  onClose: () => void;
}

export default function PatchDiffModal({
  open,
  patch,
  issueId,
  onPatchStateChange,
  onClose,
}: Props) {
  const { width: modalWidth, dividerProps: resizeProps } = useResizableDivider({
    initial: Math.min(1200, Math.round(window.innerWidth * 0.92)),
    min: 700,
    max: Math.round(window.innerWidth * 0.98),
    multiplier: 2,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={modalWidth}
      style={{ top: '10vh', bottom: '10vh', transform: 'translateX(-50%)', maxHeight: 'none' }}
    >
      <div className={styles.resizeHandle} {...resizeProps} />
      <PatchDetail
        patch={patch}
        issueId={issueId}
        onPatchStateChange={onPatchStateChange}
        onClose={onClose}
      />
      <Modal.Footer>
        <Button onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
