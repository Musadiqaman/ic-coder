export function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

export function errorHandler(err, req, res, next) {
  console.error("[error]", err?.stack || err?.message || err);
  if (err?.name === "ValidationError") {
    return res.status(400).json({ message: "Invalid request data" });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ message: "Invalid identifier" });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ message: "A record with that value already exists" });
  }
  const status = Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 500;
  return res.status(status).json({ message: status === 500 ? "Server error" : (err?.message || "Request rejected") });
}
