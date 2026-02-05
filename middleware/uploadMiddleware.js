const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os'); // ✅ ADDED: Cyclic-safe temp directory

/* ============================================================
   ❌ ORIGINAL LOCAL STORAGE (NOT SAFE ON CYCLIC)
   Keeping commented for reference
============================================================ */

// const uploadDir = path.join(__dirname, '..', 'uploads');
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir);
// }

/* ============================================================
   ✅ CYCLIC-SAFE TEMP STORAGE
   Files are stored temporarily (recommended)
============================================================ */

const uploadDir = os.tmpdir(); // ✅ SAFE on Cyclic

/* ============================================================
   STORAGE CONFIG
============================================================ */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // ✅ changed from local uploads folder
  },
  filename: function (req, file, cb) {
    const ts = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${ts}_${safeName}`);
  }
});

/* ============================================================
   FILE FILTER (PDF ONLY) – UNCHANGED
============================================================ */

function fileFilter(req, file, cb) {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
}

/* ============================================================
   MULTER INSTANCE – UNCHANGED
============================================================ */

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter
});

module.exports = upload;
