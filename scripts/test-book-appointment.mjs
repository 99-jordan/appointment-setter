#!/usr/bin/env node
/**
 * Manual test: POST /api/book_appointment (or /api/book-appointment) with the same body shape as ElevenLabs.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 SECRET=your_secret node scripts/test-book-appointment.mjs
 *
 * Loads .env via dotenv if present (same as the app).
 */
import 'dotenv/config';

const base = process.env.BASE_URL || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const secret =
  process.env.SECRET ||
  process.env.X_ELEVENLABS_SECRET_DENTALPRO ||
  process.env.X_ELEVENLABS_SECRET_PLUMBINGPRO ||
  process.env.X_ELEVENLABS_SECRET;

const path = process.env.BOOK_PATH || '/api/book_appointment';

const body = {
  patientName: process.env.PATIENT_NAME || 'Jordan Youssef',
  phone: process.env.PHONE || '07476811532',
  service: process.env.SERVICE || 'cosmetic consultation',
  existingPatient: process.env.EXISTING_PATIENT || 'no',
  slotStart: process.env.SLOT_START || '2026-04-07T14:30:00+01:00',
  slotEnd: process.env.SLOT_END || '2026-04-07T15:30:00+01:00'
};

if (!secret) {
  console.error('Set SECRET or X_ELEVENLABS_SECRET_DENTALPRO');
  process.exit(1);
}

const url = `${base.replace(/\/$/, '')}${path}`;
console.error('POST', url);

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-elevenlabs-secret-dentalpro': secret
  },
  body: JSON.stringify(body)
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = text;
}

console.log('Status:', res.status);
console.log(JSON.stringify(json, null, 2));
