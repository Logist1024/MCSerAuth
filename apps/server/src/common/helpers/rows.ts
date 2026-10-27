/**
 * Returns the first row or throws when the result set is empty.
 *
 * INSERT/UPDATE ... RETURNING always produces a row when the statement succeeds,
 * so a missing row signals a programming error rather than a user-facing case.
 */
export function firstOrThrow<T>(rows: readonly T[], message = 'Expected one row.'): T {
  const [row] = rows;
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}
