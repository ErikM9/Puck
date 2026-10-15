/* Loads .env first, as the modules below read process.env as they load */
require('dotenv').config();

const connectDB = require('./config/database');
const app = require('./app');

const PORT = process.env.PORT || 5000;

connectDB();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});