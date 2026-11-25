const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const database = require('../database');

const router = express.Router();
const lockName = 'sewrica_admin_bootstrap';

router.post('/bootstrap-admin', async (req, res) => {
  const expectedToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  const providedToken = req.get('x-admin-bootstrap-token') || '';

  if (!expectedToken || expectedToken.length < 64) {
    return res.status(404).json({ message: 'Admin bootstrap is not enabled' });
  }

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);
  if (
    expectedBuffer.length !== providedBuffer.length
    || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(403).json({ message: 'Invalid bootstrap token' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || password.length < 12 || password.length > 128
  ) {
    return res.status(400).json({
      message: 'Provide a valid email and a new password of 12 to 128 characters'
    });
  }

  let connection;
  let lockAcquired = false;
  try {
    connection = await database.getConnection();
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      return res.status(503).json({ message: 'Admin bootstrap is busy; try again shortly' });
    }

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(409).json({ message: 'An admin account already exists' });
    }

    const existingUser = await User.findOne({ email }).select('+password');
    let admin;
    let message;

    if (existingUser) {
      if (
        !currentPassword
        || !existingUser.password
        || !(await bcrypt.compare(currentPassword, existingUser.password))
      ) {
        return res.status(401).json({ message: 'Current account password is incorrect' });
      }

      existingUser.role = 'admin';
      existingUser.password = await bcrypt.hash(password, 12);
      await existingUser.save();
      admin = existingUser;
      message = 'Existing account promoted to admin. Remove ADMIN_BOOTSTRAP_TOKEN from Railway now.';
    } else {
      if (!name || name.length > 100 || !phone || phone.length > 30) {
        return res.status(400).json({
          message: 'For a new account, provide a name and phone number'
        });
      }

      admin = await User.create({
        name,
        email,
        password: await bcrypt.hash(password, 12),
        role: 'admin',
        phone,
        isActive: true
      });
      message = 'Admin account created. Remove ADMIN_BOOTSTRAP_TOKEN from Railway now.';
    }

    return res.status(201).json({
      success: true,
      message,
      admin: { name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (error) {
    console.error('Admin bootstrap failed:', error.message);
    return res.status(500).json({ message: 'Could not create the admin account' });
  } finally {
    if (connection) {
      if (lockAcquired) {
        try {
          await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
        } catch (error) {
          console.error('Could not release admin bootstrap lock:', error.message);
        }
      }
      connection.release();
    }
  }
});

module.exports = router;
