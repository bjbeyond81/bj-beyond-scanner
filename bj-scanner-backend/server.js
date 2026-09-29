const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());
const users = new Map();
const scans = new Map();
app.post('/api/auth/register', (req, res) => {
  const {email, password} = req.body;
  if (!email || !password) return res.status(400).json({error: 'Email and password required'});
  if (users.has(email)) return res.status(400).json({error: 'User already exists'});
  const userId = 'user_' + Date.now();
  users.set(email, {userId, email, password, plan: 'free', createdAt: new Date(), scansToday: 0, lastScanDate: new Date().toDateString()});
  console.log('[USER] Register: ' + email);
  res.json({userId, email, plan: 'free'});
});
app.post('/api/auth/login', (req, res) => {
  const {email, password} = req.body;
  if (!users.has(email)) return res.status(401).json({error: 'Invalid credentials'});
  const user = users.get(email);
  if (user.password !== password) return res.status(401).json({error: 'Invalid credentials'});
  res.json({userId: user.userId, email, plan: user.plan});
});
app.post('/api/scans/record', (req, res) => {
  const {userId, url, score} = req.body;
  if (!userId || !url) return res.status(400).json({error: 'Missing required fields'});
  const user = Array.from(users.values()).find(u => u.userId === userId);
  if (!user) return res.status(401).json({error: 'User not found'});
  const today = new Date().toDateString();
  if (user.lastScanDate !== today) {user.scansToday = 0; user.lastScanDate = today;}
  if (user.plan === 'free' && user.scansToday >= 5) return res.status(429).json({error: 'Daily limit reached'});
  user.scansToday++;
  const scanId = 'scan_' + Date.now();
  scans.set(scanId, {scanId, userId, url, score, timestamp: new Date()});
  console.log('[SCAN] User: ' + userId + ', Score: ' + score);
  res.json({scanId, recorded: true});
});
app.get('/api/scans/:userId', (req, res) => {
  const userScans = Array.from(scans.values()).filter(s => s.userId === req.params.userId);
  res.json({scans: userScans});
});
app.get('/api/health', (req, res) => {
  res.json({status: 'ok', timestamp: new Date()});
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {console.log('🚀 API running on port ' + PORT);});
