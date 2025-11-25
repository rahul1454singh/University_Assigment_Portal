const express = require("express");
const { verifyAdmin } = require("../middleware/authMiddleware");
const Department = require("../models/Department");
const UserData = require("../models/UserData");
const Admin = require("../models/Admin");
const router = express.Router();

router.get("/admin/dashboard", verifyAdmin, async (req, res) => {
  try {
    const totalDepartments = await Department.countDocuments();
    const totalStudents = await UserData.countDocuments({ role: "Student" });
    const totalProfessors = await UserData.countDocuments({ role: "Professor" });
    const totalHODs = await UserData.countDocuments({ role: "HOD" });
    const totalAdmins = await Admin.countDocuments();
    const adminName = req.admin && (req.admin.name || req.admin.email);
    res.render("admin-dashboard", {
      totalDepartments,
      totalStudents,
      totalProfessors,
      totalHODs,
      totalAdmins,
      adminName
    });       
    
  } catch (err) {
    res.send("Error loading dashboard");
  }
});

module.exports = router;
