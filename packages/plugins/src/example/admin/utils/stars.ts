/** A rating of "1" to "5" as five stars, filled up to the rating. */
export const stars = (rating?: string) => {
  const n = Number(rating) || 0;
  return "★".repeat(n) + "☆".repeat(5 - n);
};
