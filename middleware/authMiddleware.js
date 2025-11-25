const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const UserData = require("../models/UserData");

async function getTokenPayload(req, res) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    try { res.clearCookie("token"); } catch(e) {}
    return null;
  }
}

exports.verifyAdmin = async (req, res, next) => {
  const payload = await getTokenPayload(req, res);
  if (!payload || payload.role !== "admin") return res.redirect("/login");
  const admin = await Admin.findById(payload.id).lean();
  if (!admin) return res.redirect("/login");
  req.admin = admin;
  res.locals.admin = admin;
  next();
};

exports.verifyStudent = async (req, res, next) => {
  const payload = await getTokenPayload(req, res);
  if (!payload || payload.role !== "Student") return res.redirect("/login");
  const user = await UserData.findById(payload.id).lean();
  if (!user) return res.redirect("/login");
  req.user = user;
  res.locals.user = user;
  next();
};

exports.verifyAnyUser = async (req, res, next) => {
  const payload = await getTokenPayload(req, res);
  if (!payload) return res.redirect("/login");
  if (payload.role === "admin") {
    const admin = await Admin.findById(payload.id).lean();
    if (!admin) return res.redirect("/login");
    req.admin = admin;
    res.locals.admin = admin;
    return next();
  }
  const user = await UserData.findById(payload.id).lean();
  if (!user) return res.redirect("/login");
  req.user = user;
  res.locals.user = user;
  next();
};
