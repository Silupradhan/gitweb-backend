/**
 * Wraps an async route handler so rejected promises forward to
 * the error middleware instead of crashing the process.
 */
export default function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
