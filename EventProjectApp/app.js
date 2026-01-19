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
// Ensure upload and data directories exist
const ensureDir = (p) => { try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch(e) { console.error('Failed to ensure dir', p, e); } };
ensureDir('public/images');
ensureDir('public/data');
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

// Routes for membership page
app.get('/membership', (req, res) => {
    res.render('membership', { member: null });
});

app.post('/membership', upload.single('profileImage'), (req, res) => {
    const member = {
        fullName: req.body.fullName || '',
        email: req.body.email || '',
        phone: req.body.phone || '',
        type: req.body.type || '',
        image: req.file ? '/images/' + req.file.filename : null,
        createdAt: new Date().toISOString()
    };

    const dataDir = 'public/data';
    const filePath = `${dataDir}/members.json`;
    let members = [];
    try {
        if (fs.existsSync(filePath)) {
            members = JSON.parse(fs.readFileSync(filePath));
        }
    } catch (e) {
        console.error('Error reading members.json', e);
        members = [];
    }
    members.push(member);
    try {
        fs.writeFileSync(filePath, JSON.stringify(members, null, 2));
    } catch (e) {
        console.error('Error writing members.json', e);
    }

    res.render('membership', { member });
});

//start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));