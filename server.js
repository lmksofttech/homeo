require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ======================
// 🔥 SCHEMAS & MODELS
// ======================

// Patient Schema
const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  age: String,
  timeline: [
    {
      date: { type: Date, default: Date.now },
      notes: String,
    },
  ],
  additionalFields: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const Patient = mongoose.model('Patient', patientSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const Admin = mongoose.model('Admin', adminSchema);

// Reminder Schema (moved UP before usage ✅)
const reminderSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  patientName: String,
  patientPhone: String,
  reminderDate: { type: Date, required: true },
  message: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'completed', 'missed'], default: 'pending' },
  email: String,
  emailSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Reminder = mongoose.model('Reminder', reminderSchema);

// ======================
// 🔥 SEED ADMIN
// ======================
async function seedAdmin() {
  const count = await Admin.countDocuments();
  if (count === 0) {
    await Admin.create({ username: 'admin', password: 'admin' });
    console.log('👤 Default admin created: admin / admin');
  }
}

// ======================
// 🔥 ROUTES
// ======================

// Health check
app.get("/", (req, res) => {
  res.send("🚀 Server is running");
});

// Admin Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    res.json({ success: true, message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Patients
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ updatedAt: -1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Patient
app.post('/api/patients', async (req, res) => {
  try {
    const newPatient = new Patient(req.body);
    await newPatient.save();

    // Auto reminder
    if (newPatient.timeline?.length > 0) {
      const visitDate = new Date(newPatient.timeline[0].date);
      const followUpDate = new Date(visitDate);
      followUpDate.setDate(followUpDate.getDate() + 7);

      await Reminder.create({
        patientId: newPatient._id,
        patientName: newPatient.name,
        patientPhone: newPatient.phone,
        reminderDate: followUpDate,
        message: `Follow-up for visit on ${visitDate.toDateString()}`,
      });
    }

    res.status(201).json(newPatient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update timeline
app.post('/api/patients/:id/timeline', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    patient.timeline.push(req.body);
    await patient.save();

    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update patient
app.put('/api/patients/:id', async (req, res) => {
  try {
    const updated = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Patient not found' });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ======================
// 🔥 REMINDER ROUTES
// ======================

app.get('/api/reminders', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ reminderDate: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reminders', async (req, res) => {
  try {
    const reminder = new Reminder(req.body);
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/reminders/:id', async (req, res) => {
  try {
    const updated = await Reminder.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Reminder not found' });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  try {
    await Reminder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================
// 🔥 STATIC FILES
// ======================
app.use(express.static(path.join(__dirname)));

// ======================
// 🔥 DB CONNECTION + SERVER START
// ======================

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in environment variables");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");

    await seedAdmin();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  });