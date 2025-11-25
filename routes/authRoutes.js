const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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

      const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "2h" });
      res.cookie("token", token, { httpOnly: true });
      return res.redirect(redirectByRole(user.role));
    }

    const admin = await Admin.findOne({ email });
    if (admin) {
      const ok = await bcrypt.compare(password, admin.password);
      if (!ok) return res.render("login", { error: "Invalid email or password" });

      const token = jwt.sign({ id: admin._id, role: admin.role || "admin" }, process.env.JWT_SECRET, { expiresIn: "2h" });
      res.cookie("token", token, { httpOnly: true });
      return res.redirect(redirectByRole(admin.role || "admin"));
    }

    return res.render("login", { error: "Invalid email or password" });
  } catch (err) {
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

module.exports = router;
