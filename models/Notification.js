// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserData', required: true },
  title: { type: String, required: true },
  message: { type: String },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

module.exports = mongoose.model('Notification', NotificationSchema);
