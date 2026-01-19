const express = require('express');
const {Web3} = require('web3');
const fs = require("fs");
const multer = require('multer');

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'public/images'); // Directory to save uploaded files
  },
  filename: (req, file, cb) => {
      cb(null, file.originalname); 
  }
});
const upload = multer({ storage: storage });
//Set up view engine from ejs library
const app = express();
//Set up view engine
app.set('view engine', 'ejs');
//This line of code tells Express to serve static files (such as images, CSS, JavaScript files, or PDFs)
//from the public directory
app.use(express.static('public'))
//enable form processing
app.use(express.urlencoded({
    extended: false
}));

//start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// declare the global variables