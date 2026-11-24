const path = require('path');

// UPLOAD_DIR dipakai tes supaya tidak menyentuh folder uploads/ yang asli
function folderUpload() {
  return process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
}

module.exports = { folderUpload };
