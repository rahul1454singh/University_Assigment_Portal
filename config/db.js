// config/db.js
const mongoose = require("mongoose");

const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017/universityDB";

async function connectDB({ retries = 3, retryDelayMs = 2000 } = {}) {
  // 🔑 IMPORTANT FIX:
  // Use local DB ONLY if explicitly running locally
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  const uri = isRailway
    ? process.env.MONGO_URI
    : process.env.MONGO_URI || DEFAULT_LOCAL_URI;

  if (!uri) {
    console.error("❌ MONGO_URI is required in production (Railway)");
    process.exit(1);
  }

  if (!process.env.MONGO_URI && !isRailway) {
    console.warn("⚠️ MONGO_URI not found — using local DB:", uri);
  }

  const options = {
    serverSelectionTimeoutMS: 10000
  };

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      await mongoose.connect(uri, options);
      console.log("✅ MongoDB Connected");

      // connection events
      mongoose.connection.on("error", err =>
        console.error("Mongo Error:", err)
      );

      mongoose.connection.on("disconnected", () =>
        console.warn("Mongo Disconnected")
      );

      // graceful shutdown
      const closeDB = async () => {
        try {
          await mongoose.connection.close();
          console.log("MongoDB Closed");
          process.exit(0);
        } catch (err) {
          console.error("Error Closing DB:", err);
          process.exit(1);
        }
      };

      process.on("SIGINT", closeDB);
      process.on("SIGTERM", closeDB);

      return; // ✅ success
    } catch (err) {
      console.error(
        `DB Error (attempt ${attempt}/${retries + 1}):`,
        err.message || err
      );

      if (attempt > retries) throw err;

      console.log(`Retrying in ${retryDelayMs}ms...`);
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }
}

module.exports = connectDB;
