import styles from './EmojiPicker.module.css';

export const EMOJI_LIST = ['👍', '👎', '❤️', '🎉', '😄', '😕', '🚀', '👀', '🙏', '🔥'];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <>
      <div className={styles.pickerBackdrop} onClick={onClose} />
      <div className={styles.emojiPicker}>
        {EMOJI_LIST.map((e) => (
          <button key={e} className={styles.emojiBtn} onClick={() => onSelect(e)}>
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
