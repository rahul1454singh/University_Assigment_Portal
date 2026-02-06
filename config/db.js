// config/db.js
const mongoose = require("mongoose");

const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017/universityDB";

async function connectDB({ retries = 3, retryDelayMs = 2000 } = {}) {
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

  const uri = isRailway
    ? process.env.MONGO_URI
    : process.env.MONGO_URI || DEFAULT_LOCAL_URI;

  if (!uri) {
    console.error("❌ MONGO_URI is required in production (Railway)");
    throw new Error("Missing MONGO_URI");
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

      /* ===================== DATA CLEANUP FIX ===================== */
      // This specifically fixes the "Student" vs "student" enum error
      const UserData = mongoose.model("UserData");
      if (UserData) {
        await UserData.updateMany({ role: "Student" }, { $set: { role: "student" } });
        await UserData.updateMany({ role: "Professor" }, { $set: { role: "professor" } });
        await UserData.updateMany({ role: "Hod" }, { $set: { role: "hod" } });
        console.log("🛠️ Database roles normalized to lowercase");
      }
      /* ============================================================= */

      // SAFE connection events (NO shutdown)
      mongoose.connection.on("error", err => {
        console.error("Mongo Error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("⚠️ Mongo Disconnected");
      });

      return; // ✅ success
    } catch (err) {
      console.error(
        `DB Error (attempt ${attempt}/${retries + 1}):`,
        err.message || err
      );

      if (attempt > retries) {
        throw err;
      }

      console.log(`Retrying in ${retryDelayMs}ms...`);
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }
}

module.exports = connectDB;