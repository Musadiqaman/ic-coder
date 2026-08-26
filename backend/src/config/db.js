import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  try {
    await mongoose.connect(uri);
    console.log(`[db] connected -> ${uri}`);
  } catch (err) {
    console.error("[db] connection failed:", err.message);
    console.error(
      "[db] Is MongoDB running? Start local mongod, or set MONGODB_URI to an Atlas connection string in backend/.env"
    );
    process.exit(1);
  }
}
