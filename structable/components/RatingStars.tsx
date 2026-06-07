'use client';

type Props = {
  value: unknown;
  readOnly?: boolean;
  onChange?: (value: number | null) => void;
};

const MAX_RATING = 5;

export function isRatingColumnType(types?: string[] | null): boolean {
  return types?.includes('rating') ?? false;
}

export function isUnsetRatingValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export function normalizeRating(value: unknown): number {
  if (isUnsetRatingValue(value)) return 0;
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw * 2) / 2;
  return Math.min(MAX_RATING, Math.max(0, rounded));
}

export function nextRatingValue(currentValue: unknown, star: number): number | null {
  const current = normalizeRating(currentValue);
  if (star === 1) {
    if (isUnsetRatingValue(currentValue)) return 0;
    if (current === 0) return 0.5;
    if (current === 0.5) return null;
    return 0;
  }
  return current === star ? star - 0.5 : star;
}

function fillForStar(value: number, star: number): number {
  if (value >= star) return 1;
  if (value === star - 0.5) return 0.5;
  return 0;
}

export default function RatingStars({ value, readOnly = false, onChange }: Props) {
  const isUnset = isUnsetRatingValue(value);
  const rating = normalizeRating(value);
  const canEdit = !readOnly && !!onChange;
  const stars = Array.from({ length: MAX_RATING }, (_, index) => index + 1);

  return (
    <span
      className={[
        'rating-stars',
        canEdit ? 'rating-stars-editable' : '',
        isUnset ? 'rating-stars-unset' : '',
      ].filter(Boolean).join(' ')}
      role={canEdit ? 'radiogroup' : 'img'}
      aria-label={isUnset ? 'Rating unset' : `Rating ${rating} out of ${MAX_RATING}`}
    >
      {stars.map((star) => {
        const fill = fillForStar(rating, star);
        const next = nextRatingValue(value, star);
        const title = next === null ? 'Unset rating' : `${next} / ${MAX_RATING}`;
        const starContent = (
          <span className="rating-star-shell" aria-hidden="true">
            <span className="rating-star-empty">&#9734;</span>
            <span className="rating-star-fill" style={{ width: `${fill * 100}%` }}>&#9733;</span>
          </span>
        );

        if (!canEdit) {
          return (
            <span key={star} className="rating-star">
              {starContent}
            </span>
          );
        }

        return (
          <button
            key={star}
            type="button"
            className="rating-star rating-star-button"
            aria-label={next === null ? 'Unset rating' : `Set rating to ${next} out of ${MAX_RATING}`}
            aria-checked={!isUnset && (star === 1 ? rating === 0 || rating === 0.5 : rating === star || rating === star - 0.5)}
            role="radio"
            title={title}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(next);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {starContent}
          </button>
        );
      })}
    </span>
  );
}
