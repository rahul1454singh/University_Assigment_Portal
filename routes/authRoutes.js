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

// 🔐 Mail transporter for reset link emails
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // your email
    pass: process.env.SMTP_PASS  // your app password
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



// 1) Show "Forgot Password" page
router.get("/forgot-password", (req, res) => {
  res.render("forgot-password", { error: null, success: null });
});

// 2) Handle email submit and send reset link
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await UserData.findOne({ email });
    if (!user) {
      return res.render("forgot-password", {
        error: "No account found with this email.",
        success: null
      });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");

    // Save and  expiry 1 hour
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetURL = `${req.protocol}://${req.get("host")}/reset-password/${token}`;

    // Send mail
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: user.email,
      subject: "Password Reset - University Assignment Portal",
      html: `
        <p>You requested a password reset.</p>
        <p>Click this link to reset your password:</p>
        <p><a href="${resetURL}">${resetURL}</a></p>
        <p>This link will expire in 1 hour.</p>
      `
    });

    return res.render("forgot-password", {
      error: null,
      success: "Reset link has been sent to your email."
    });
  } catch (err) {
    console.error(err);
    return res.render("forgot-password", {
      error: "Something went wrong. Please try again.",
      success: null
    });
  }
});

// 3) Show Reset Password form when user clicks email link
router.get("/reset-password/:token", async (req, res) => {
  try {
    const token = req.params.token;

    const user = await UserData.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.send("Reset link is invalid or has expired.");
    }

    return res.render("reset-password", {
      error: null,
      success: null,
      token
    });
  } catch (err) {
    console.error(err);
    return res.send("Something went wrong.");
  }
});

// 4) Handle new password submit
router.post("/reset-password/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const { password } = req.body;

    const user = await UserData.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render("reset-password", {
        error: "Reset link is invalid or has expired.",
        success: null,
        token: null
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.render("reset-password", {
      error: null,
      success: "Your password has been changed.",
      token: null
    });
  } catch (err) {
    console.error(err);
    return res.render("reset-password", {
      error: "Something went wrong. Please try again.",
      success: null,
      token: req.params.token
    });
  }
});

module.exports = router;
