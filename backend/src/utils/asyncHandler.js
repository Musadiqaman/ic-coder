// Wraps async route handlers so thrown errors reach Express's error middleware
// instead of crashing the process or hanging the request.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
