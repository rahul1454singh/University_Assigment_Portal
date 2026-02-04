// server.js
process.env.DOTENV_CONFIG_SILENT = "true";
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const professorRoutes = require("./routes/professorRoutes");

/* ===================== DEPARTMENT ROUTE AUTO-DETECT ===================== */

let departmentRoutes;
const dRoute1 = path.join(__dirname, "routes", "departmentRoute.js");
const dRoute2 = path.join(__dirname, "routes", "departmentRoutes.js");

if (fs.existsSync(dRoute1)) {
  departmentRoutes = require("./routes/departmentRoute");
} else if (fs.existsSync(dRoute2)) {
  departmentRoutes = require("./routes/departmentRoutes");
} else {
  console.error("Department route not found");
  process.exit(1);
}

const Admin = require("./models/Admin");

/* ===================== START SERVER ===================== */

(async () => {
  try {
    await connectDB();

    const app = express();

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(cookieParser());

    app.set("views", path.join(__dirname, "views"));
    app.set("view engine", "ejs");

    app.use("/uploads", express.static(path.join(__dirname, "uploads")));

    app.use("/", authRoutes);
    app.use("/", adminRoutes);
    app.use("/", departmentRoutes);
    app.use("/", userRoutes);
    app.use("/", studentRoutes);
    app.use("/", professorRoutes);

    app.get("/", (req, res) => {
      res.status(200).send("University Assignment Portal is running");
    });

    app.use((req, res) => {
      res.status(404);
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.json({ message: "Not Found" });
      }
      res.send("404 - Not Found");
    });

    app.use((err, req, res, next) => {
      console.error("Unhandled error:", err);
      res.status(500);

      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.json({ message: "Server error" });
      }

      res.send("500 - Server error");
    });

    try {
      const adminExists = await Admin.findOne({ email: "admin@university.com" });
      if (!adminExists) {
        const hashed = await bcrypt.hash("admin", 10);
        await Admin.create({
          name: "Admin",
          email: "admin@university.com",
          password: hashed,
          role: "admin"
        });
        console.log("Default admin created");
      }
    } catch (err) {
      console.error("Admin creation failed:", err);
    }

    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();
