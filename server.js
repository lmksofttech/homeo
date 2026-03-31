require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://root:root@homeo.xtptbk1.mongodb.net/?retryWrites=true&w=majority';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Schema Definition
const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  age: String,
  timeline: [{
    date: { type: Date, default: Date.now },
    notes: String
  }],
  // For dynamic headers from Excel ("Create that title and store that data")
  additionalFields: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Patient = mongoose.model('Patient', patientSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', adminSchema);

// Seed Initial Admin (Run once)
async function seedAdmin() {
  const count = await Admin.countDocuments();
  if (count === 0) {
    await Admin.create({ username: 'admin', password: 'admin' }); // You can change this later
    console.log('👤 Initial Admin account created: admin / admin');
  }
}
seedAdmin();

// --- API ENDPOINTS ---

// Admin Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ username, password });
    if (admin) {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Get All Patients
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ updatedAt: -1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add Single Patient
app.post('/api/patients', async (req, res) => {
  try {
    const newPatient = new Patient(req.body);
    await newPatient.save();

    // 🔔 Automatic 7-day Follow-up for Initial Visit
    if (newPatient.timeline && newPatient.timeline.length > 0) {
      const visitDate = new Date(newPatient.timeline[0].date);
      const followUpDate = new Date(visitDate);
      followUpDate.setDate(followUpDate.getDate() + 7);

      const autoReminder = new Reminder({
        patientId: newPatient._id,
        patientName: newPatient.name,
        patientPhone: newPatient.phone,
        reminderDate: followUpDate,
        message: `Initial follow-up for first visit on ${visitDate.toLocaleDateString()}`,
        status: 'pending',
        email: newPatient.additionalFields?.email || ''
      });
      await autoReminder.save();
    }

    res.status(201).json(newPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Bulk Import Patients
app.post('/api/patients/bulk', async (req, res) => {
  try {
    const patientsData = req.body; // Expecting array of objects
    const results = await Patient.insertMany(patientsData);
    res.status(201).json({ message: `Successfully imported ${results.length} patients.`, count: results.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Update Patient (Add to Timeline)
app.post('/api/patients/:id/timeline', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    
    patient.timeline.push(req.body);
    await patient.save();

    // 🔔 Automatic 7-day Follow-up Reminder
    const visitDate = req.body.date ? new Date(req.body.date) : new Date();
    const followUpDate = new Date(visitDate);
    followUpDate.setDate(followUpDate.getDate() + 7);

    const autoReminder = new Reminder({
      patientId: patient._id,
      patientName: patient.name,
      patientPhone: patient.phone,
      reminderDate: followUpDate,
      message: `Automatic follow-up for visit on ${visitDate.toLocaleDateString()}`,
      status: 'pending',
      email: patient.additionalFields?.email || '' // Check if email exists in additional fields
    });
    await autoReminder.save();
    
    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Update Patient (Edit Details)
app.put('/api/patients/:id', async (req, res) => {
  try {
    const updatedPatient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updatedPatient) return res.status(404).json({ error: 'Patient not found' });
    res.json(updatedPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── REMINDER / FOLLOW-UP SYSTEM ───

const reminderSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  patientName: String,
  patientPhone: String,
  reminderDate: { type: Date, required: true },
  message: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending' },
  email: String,
  emailSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Reminder = mongoose.model('Reminder', reminderSchema);

// 6. Create Reminder
app.post('/api/reminders', async (req, res) => {
  try {
    const reminder = new Reminder(req.body);
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Get All Reminders (with optional filters)
app.get('/api/reminders', async (req, res) => {
  try {
    const { status, upcoming } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (upcoming === 'true') {
      filter.reminderDate = { $gte: new Date() };
      filter.status = 'pending';
    }
    const reminders = await Reminder.find(filter).sort({ reminderDate: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Mark Reminder as Complete
app.put('/api/reminders/:id', async (req, res) => {
  try {
    const updated = await Reminder.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Reminder not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Delete Reminder
app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Send Reminder Email (optional - needs SMTP config)
app.post('/api/reminders/:id/send-email', async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    if (!reminder.email) return res.status(400).json({ error: 'No email address set for this reminder' });
    
    // Try to use nodemailer if available
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || '',
          pass: process.env.EMAIL_PASS || ''
        }
      });
      
      await transporter.sendMail({
        from: process.env.EMAIL_USER || 'lmksofttech@gmail.com',
        to: reminder.email,
        subject: `Follow-up Reminder - Kishore Homeo Clinic`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;border:1px solid #eee;border-radius:12px;">
            <h2 style="color:#14b8a6;">Kishore Homeo Clinic</h2>
            <p>Dear <strong>${reminder.patientName}</strong>,</p>
            <p>This is a follow-up reminder from Kishore Homeo Clinic.</p>
            <p style="background:#f0f9ff;padding:16px;border-radius:8px;border-left:4px solid #14b8a6;">${reminder.message || 'Please schedule your follow-up appointment.'}</p>
            <p style="color:#666;font-size:13px;">Reminder Date: ${new Date(reminder.reminderDate).toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <p style="color:#999;font-size:11px;">Kishore Homeo Clinic | For appointments call the clinic directly.</p>
          </div>
        `
      });
      
      reminder.emailSent = true;
      await reminder.save();
      res.json({ message: 'Email sent successfully', reminder });
    } catch (emailErr) {
      res.status(500).json({ error: 'Email not configured. Install nodemailer and set EMAIL_USER/EMAIL_PASS environment variables.', details: emailErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files
app.use(express.static('.'));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
