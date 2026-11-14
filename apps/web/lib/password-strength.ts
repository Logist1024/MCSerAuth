export interface PasswordStrength {
  score: 0 | 1 | 2 | 3;
  label: string;
}

const LABELS = ['太短了', '还可以', '不错', '很棒'] as const;

/** Lightweight, non-blocking strength hint for the sign-up form. */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: '' };
  }
  let score: 0 | 1 | 2 | 3 = 0;
  if (password.length >= 8) {
    score = 1;
  }
  if (password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score = 2;
  }
  if (score === 2 && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) {
    score = 3;
  }
  return { score, label: LABELS[score] ?? '' };
}
