import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PatchReview } from '../../types/kanban';
import styles from './ReviewSection.module.css';

interface ReviewSectionProps {
  reviews: PatchReview[];
  delegateDids: string[];
  canReview: boolean;
  rid: string;
  patchId: string;
  revisionId: string;
  onReviewSubmitted: () => void;
}

export function ReviewSection({ reviews, delegateDids, canReview, rid, patchId, revisionId, onReviewSubmitted }: ReviewSectionProps) {
  const [verdict, setVerdict] = useState<'accept' | 'reject' | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!verdict) return;
    setSubmitting(true);
    try {
      await invoke('review_patch', {
        rid,
        patchId,
        revisionId,
        verdict,
        message: message.trim(),
      });
      setVerdict(null);
      setMessage('');
      onReviewSubmitted();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {reviews.length > 0 && (
        <div className={styles.reviewSection}>
          <div className={styles.sectionLabel}>Reviews</div>
          {[...reviews]
            .sort((a, b) => {
              const aD = delegateDids.includes(a.reviewerDid) ? 0 : 1;
              const bD = delegateDids.includes(b.reviewerDid) ? 0 : 1;
              return aD - bD;
            })
            .map((rev, i) => {
              const isDel = delegateDids.includes(rev.reviewerDid);
              return (
                <div key={i} className={`${styles.reviewCard} ${isDel ? styles.reviewCardDelegate : ''}`}>
                  <div className={styles.reviewCardHeader}>
                    <span className={styles.reviewAuthor}>@{rev.reviewer}</span>
                    {isDel && <span className={styles.delegateBadge}>delegate</span>}
                    {rev.verdict === 'accept' && <span className={styles.verdictAccept}>✓ accept</span>}
                    {rev.verdict === 'reject' && <span className={styles.verdictReject}>✗ reject</span>}
                    {rev.verdict === null && <span className={styles.verdictNone}>— reviewed</span>}
                  </div>
                  {rev.summary && <p className={styles.reviewSummary}>{rev.summary}</p>}
                  <span className={styles.reviewDate}>{rev.createdAt}</span>
                </div>
              );
            })}
        </div>
      )}

      {canReview && (
        <div className={styles.reviewForm}>
          <div className={styles.sectionLabel}>Add review</div>
          <div className={styles.verdictBtns}>
            <button
              className={`${styles.verdictBtn} ${verdict === 'accept' ? styles.verdictBtnAccept : ''}`}
              onClick={() => setVerdict(verdict === 'accept' ? null : 'accept')}
            >
              ✓ Accept
            </button>
            <button
              className={`${styles.verdictBtn} ${verdict === 'reject' ? styles.verdictBtnReject : ''}`}
              onClick={() => setVerdict(verdict === 'reject' ? null : 'reject')}
            >
              ✗ Reject
            </button>
          </div>
          <textarea
            className={styles.patchCommentInput}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Review message (optional)…"
            rows={2}
          />
          <button
            className={styles.patchSubmitBtn}
            onClick={handleSubmit}
            disabled={submitting || !verdict}
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </div>
      )}
    </>
  );
}
