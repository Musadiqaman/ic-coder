import mongoose from "mongoose";

let dbPromise = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  // Vercel reuses warm serverless instances. Keep one connection promise so
  // concurrent requests during a cold start do not open multiple MongoDB
  // connections, and reuse the existing connection on warm invocations.
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (dbPromise) return dbPromise;

  dbPromise = mongoose
    .connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    .then(() => {
      console.log("[db] connected");
      return mongoose.connection;
    })
    .catch((err) => {
      dbPromise = null;
      console.error("[db] connection failed:", err.message);
      throw err;
    });

  return dbPromise;
}
