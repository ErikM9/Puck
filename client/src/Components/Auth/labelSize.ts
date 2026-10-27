/* The most a sign-in button's label may be set at, larger the shorter its word, so each fills its button about as fully */
const LONGEST = 8;
const AT_LONGEST = 20;
const GROWTH = 0.55;

export const labelSize = (label: string) =>
  Math.round(AT_LONGEST * Math.pow(LONGEST / Math.max(1, label.length), GROWTH) * 4) / 4;