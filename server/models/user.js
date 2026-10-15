const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    /* Lowercased and trimmed on the way in, so the unique index catches the same address in any casing */
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },

    /* Set on sign-up while the address is unverified, and cleared by the link in the verification email */
    verificationPending: { type: Boolean, default: false },
    verifyTokenHash: { type: String, default: null },
    verifyTokenExpiry: { type: Date, default: null },
    verifyLastSentAt: { type: Date, default: null },

    /* Password recovery lives on the user, and Mongoose drops anything the schema omits */
    resetCodeHash: { type: String, default: null },
    resetCodeExpiry: { type: Date, default: null },
    resetCodeAttempts: { type: Number, default: 0 },
    resetCodeLastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
module.exports = User;