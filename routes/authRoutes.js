const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const Admin = require("../models/Admin");
const UserData = require("../models/UserData");

const router = express.Router();

function redirectByRole(role) {
  if (!role) return "/";
  const lower = role.toString().toLowerCase();
  switch (lower) {
    case "student":
      return "/student/dashboard";
    case "admin":
    case "administrator":
      return "/admin/dashboard";
    case "professor":
      return "/professor/dashboard";
    case "hod":
    case "head":
      return "/hod/dashboard";
    default:
      return "/";
  }
}

/* =====================================================
    🔐 Mail transporter (FIXED FOR PORT 587)
   ===================================================== */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: "TLSv1.2"
  }
});

router.get("/", (req, res) => res.redirect("/login"));

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UserData.findOne({ email });
    if (user) {
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.render("login", { error: "Invalid email or password" });

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );
      res.cookie("token", token, { httpOnly: true });
      return res.redirect(redirectByRole(user.role));
    }

    const admin = await Admin.findOne({ email });
    if (admin) {
      const ok = await bcrypt.compare(password, admin.password);
      if (!ok) return res.render("login", { error: "Invalid email or password" });

      const token = jwt.sign(
        { id: admin._id, role: admin.role || "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );
      res.cookie("token", token, { httpOnly: true });
      return res.redirect(redirectByRole(admin.role || "admin"));
    }

    return res.render("login", { error: "Invalid email or password" });
  } catch (err) {
    console.error(err);
    return res.render("login", { error: "Server error — try again" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  return res.redirect("/login");
});

router.get("/logout", (req, res) => {
  res.clearCookie("token");
  return res.redirect("/login");
});

// ================= FORGOT PASSWORD (OTP SYSTEM) =================

router.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, success: null });
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    let account = await UserData.findOne({ email });
    if (!account) {
      account = await Admin.findOne({ email });
    }

    if (!account) {
      return res.render("forgot-password", {
        error: "No account found with this email.",
        success: null
      });
    }

    if (account.role) {
      account.role = account.role.toLowerCase();
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    account.resetPasswordToken = otp; 
    account.resetPasswordExpires = Date.now() + 60000; 
    
    await account.save();

    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: account.email,
      subject: "Your Password Reset OTP",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center;">
          <h2>Password Reset Request</h2>
          <p>Use the following 4-digit OTP to reset your password. This code is valid for <b>1 minute</b>.</p>
          <h1 style="color: #4b6cb7; letter-spacing: 5px;">${otp}</h1>
        </div>
      `
    });

    return res.render("verify-otp", { email, error: null });

  } catch (err) {
    console.error("DEBUG - Validation Error:", err);
    return res.render("forgot-password", {
      error: "Something went wrong. Please try again.",
      success: null
    });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    let account = await UserData.findOne({
      email,
      resetPasswordToken: otp,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!account) {
      account = await Admin.findOne({
        email,
        resetPasswordToken: otp,
        resetPasswordExpires: { $gt: Date.now() }
      });
    }

    if (!account) {
      return res.render("verify-otp", { 
        email, 
        error: "Invalid or expired OTP. Please request a new one." 
      });
    }

    return res.render("reset-password", {
      error: null,
      success: null,
      email: email 
    });
  } catch (err) {
    console.error(err);
    res.redirect("/forgot-password");
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    let account = await UserData.findOne({ email });
    if (!account) {
      account = await Admin.findOne({ email });
    }

    if (!account) {
      return res.render("reset-password", {
        error: "Session expired. Please start again.",
        success: null,
        email: null
      });
    }

    if (account.role) {
      account.role = account.role.toLowerCase();
    }

    // FIX: Just assign plain password. Model's pre-save handles hashing.
    account.password = password; 
    account.resetPasswordToken = undefined;
    account.resetPasswordExpires = undefined;
    await account.save();

    return res.render("reset-password", {
      error: null,
      success: "Your password has been changed successfully.",
      email: null
    });
  } catch (err) {
    console.error(err);
    return res.render("reset-password", {
      error: "Something went wrong.",
      success: null,
      email: req.body.email
    });
  }
});

module.exports = router;