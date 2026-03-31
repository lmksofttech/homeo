require('dotenv').config();

// 🔥 GLOBAL ERROR HANDLERS (PREVENT CRASH)
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Rejection:", err);
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: "*", // allow all (for now)
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

// ======================
// 🔥 MODELS
// ======================

// Patient
const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  age: String,
  timeline: [{
    date: { type: Date, default: Date.now },
    notes: String
  }],
  additionalFields: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Patient = mongoose.model('Patient', patientSchema);

// Admin
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const Admin = mongoose.model('Admin', adminSchema);

// Reminder
const reminderSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  patientName: String,
  patientPhone: String,
  reminderDate: { type: Date, required: true },
  message: String,
  status: { type: String, default: 'pending' },
  email: String,
  emailSent: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Reminder = mongoose.model('Reminder', reminderSchema);

// ======================
// 🔥 SAFE SEED ADMIN
// ======================
async function seedAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      await Admin.create({ username: 'admin', password: 'admin' });
      console.log("👤 Admin created (admin/admin)");
    }
  } catch (err) {
    console.error("❌ SeedAdmin error:", err.message);
  }
}

// ======================
// 🔥 ROUTES
// ======================

// Health route (VERY IMPORTANT for Render)
app.get("/", (req, res) => {
  res.status(200).send("✅ Backend is running");
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username, password });

    if (!admin) {
      return res.status(401).json({ success: false });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get patients
app.get('/api/patients', async (req, res) => {
  try {
    const data = await Patient.find().sort({ updatedAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add patient
app.post('/api/patients', async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();

    if (patient.timeline?.length > 0) {
      const visitDate = new Date(patient.timeline[0].date);
      const followUp = new Date(visitDate);
      followUp.setDate(followUp.getDate() + 7);

      await Reminder.create({
        patientId: patient._id,
        patientName: patient.name,
        patientPhone: patient.phone,
        reminderDate: followUp,
        message: "Follow-up reminder"
      });
    }

    res.status(201).json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update timeline
app.post('/api/patients/:id/timeline', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Not found' });

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
    const updated = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reminder routes
app.get('/api/reminders', async (req, res) => {
  try {
    const data = await Reminder.find().sort({ reminderDate: 1 });
    res.json(data);
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

// ======================
// 🔥 STATIC FILES
// ======================
const frontendPath = path.join(__dirname);

app.use(express.static(frontendPath));

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});



// ======================
// 🔥 DB CONNECT + START
// ======================

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI");
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000
})
.then(async () => {
  console.log("✅ MongoDB Connected");

  await seedAdmin();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error("❌ MongoDB Connection Error:", err);
  process.exit(1);
});