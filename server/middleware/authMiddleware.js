const jwt = require('jsonwebtoken');

/* Reads the bearer token and leaves req.userId behind for controllers to filter their queries on */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    /* A tampered token and an expired one get the same answer, as the client handles both alike */
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;