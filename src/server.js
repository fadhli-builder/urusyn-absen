require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3002;

app.listen(PORT, '127.0.0.1', (err) => {
  if (err) {
    console.error('Gagal start server:', err.message);
    process.exit(1);
  }
  console.log(`Server jalan di http://127.0.0.1:${PORT}`);
});