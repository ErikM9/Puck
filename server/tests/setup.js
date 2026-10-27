/* Settings shared by the suites, with placeholder mail credentials so the email service reports nothing missing */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.EMAIL_USER = process.env.EMAIL_USER || 'noreply@puck.test';
process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'test-pass';