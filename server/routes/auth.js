const express = require('express');
const authRouter = express.Router();
const authCo = require('../controllers/authCo');

authRouter.post('/register', authCo.register);
authRouter.post('/login', authCo.login);
authRouter.post('/logout', authCo.logout);

/* The link in the verification email spends its token here, and a lost email gets a new link */
authRouter.post('/verify-email', authCo.verifyEmail);
authRouter.post('/resend-verification', authCo.resendVerification);

/* Recovery takes three calls, which ask for a code, check it and then spend it on a new password */
authRouter.post('/forgot-password', authCo.forgotPassword);
authRouter.post('/verify-reset-code', authCo.verifyResetCode);
authRouter.post('/reset-password', authCo.resetPassword);

module.exports = authRouter;