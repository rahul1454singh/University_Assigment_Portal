const Assignment = require('../models/Assignment');

// show upload form
exports.getUploadForm = (req, res) => {
  res.render('upload-assignment', { error: null, success: null, assignmentId: null });
};

// handle upload
exports.uploadAssignment = async (req, res) => {
  try {
    // multer put file info into req.file
    if (!req.file) {
      return res.status(400).render('upload-assignment', { error: 'Please upload a PDF file (max 10MB).', success: null, assignmentId: null });
    }

   
    const { title, description, category } = req.body;

    if (!title || !category) {
     
      return res.status(400).render('upload-assignment', { error: 'Title and Category are required.', success: null, assignmentId: null });
    }

    
    const userId = (req.user && req.user._id) ? req.user._id : req.body.userId;
    if (!userId) {
      return res.status(401).render('upload-assignment', { error: 'User not authenticated. Please login.', success: null, assignmentId: null });
    }

    // create assignment document
    const newAssignment = new Assignment({
      title,
      description,
      user: userId,
      status: 'Draft',
      
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      category 
    });

    

    const saved = await newAssignment.save();

    // success message
    return res.render('upload-assignment', { error: null, success: 'Uploaded successfully', assignmentId: saved._id });
  } catch (err) {
    console.error('Upload error:', err);
    let message = 'Server error while uploading.';
    if (err.message && err.message.includes('Only PDF')) message = 'Only PDF files are allowed.';
    if (err.code === 'LIMIT_FILE_SIZE') message = 'File too large. Maximum 10MB allowed.';
    return res.status(500).render('upload-assignment', { error: message, success: null, assignmentId: null });
  }
};
