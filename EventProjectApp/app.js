const express = require('express');
const {Web3} = require('web3');
const fs = require("fs");
const multer = require('multer');
const path = require('path');
const https = require('https');
const { ADMIN_WALLET } = require('../config/adminWallet');

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

app.use((req, res, next) => {
    res.locals.adminWallet = ADMIN_WALLET;
    next();
});

// Events persistence helpers
const eventsFilePath = 'public/data/events.json';
const readEvents = () => {
    try {
        if (fs.existsSync(eventsFilePath)) {
            return JSON.parse(fs.readFileSync(eventsFilePath));
        }
    } catch (e) {
        console.error('Error reading events.json', e);
    }
    return [];
};
const writeEvents = (events) => {
    try {
        fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 2));
    } catch (e) {
        console.error('Error writing events.json', e);
    }
};

const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};
    return cookieHeader.split(';').reduce((acc, part) => {
        const [key, ...rest] = part.trim().split('=');
        if (!key) return acc;
        acc[key] = decodeURIComponent(rest.join('='));
        return acc;
    }, {});
};

// Home + events routes
app.get('/', (req, res) => {
    res.render('events', { events: readEvents() });
});

const ethPriceCache = {
    value: null,
    fetchedAt: 0
};

const fetchEthPrice = () => new Promise((resolve, reject) => {
    https.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        (resp) => {
            let data = '';
            resp.on('data', (chunk) => (data += chunk));
            resp.on('end', () => {
                try {
                    const payload = JSON.parse(data);
                    const price = payload && payload.ethereum ? payload.ethereum.usd : null;
                    if (!price) {
                        return reject(new Error('Missing price'));
                    }
                    resolve(price);
                } catch (error) {
                    reject(error);
                }
            });
        }
    ).on('error', reject);
});

app.get('/api/eth-price', async (req, res) => {
    const now = Date.now();
    if (ethPriceCache.value && now - ethPriceCache.fetchedAt < 60000) {
        return res.json({ usd: ethPriceCache.value, cached: true });
    }
    try {
        const price = await fetchEthPrice();
        ethPriceCache.value = price;
        ethPriceCache.fetchedAt = now;
        res.json({ usd: price, cached: false });
    } catch (error) {
        if (ethPriceCache.value) {
            return res.json({ usd: ethPriceCache.value, cached: true });
        }
        res.status(503).json({ error: 'unavailable' });
    }
});

const loadContractConfig = () => {
    const artifactPath = path.join(__dirname, '..', 'build', 'contracts', 'Events.json');
    try {
        if (!fs.existsSync(artifactPath)) {
            return { address: null, abi: null, networkId: null };
        }
        const artifact = JSON.parse(fs.readFileSync(artifactPath));
        const targetNetworkId = process.env.CONTRACT_NETWORK_ID || '1337';
        const networks = artifact.networks || {};
        const network = networks[targetNetworkId];
        if (!network) {
            return { address: null, abi: artifact.abi || null, networkId: targetNetworkId };
        }
        return {
            address: network ? network.address : null,
            abi: artifact.abi || null,
            networkId: network ? (network.network_id || targetNetworkId) : null
        };
    } catch (e) {
        console.error('Error loading contract artifact', e);
        return { address: null, abi: null, networkId: null };
    }
};

const loadMembershipConfig = () => {
    const artifactPath = path.join(__dirname, '..', 'build', 'contracts', 'Membership.json');
    try {
        if (!fs.existsSync(artifactPath)) {
            return { address: null, abi: null, networkId: null };
        }
        const artifact = JSON.parse(fs.readFileSync(artifactPath));
        const targetNetworkId = process.env.CONTRACT_NETWORK_ID || '1337';
        const networks = artifact.networks || {};
        const network = networks[targetNetworkId];
        if (!network) {
            return { address: null, abi: artifact.abi || null, networkId: targetNetworkId };
        }
        return {
            address: network ? network.address : null,
            abi: artifact.abi || null,
            networkId: network ? (network.network_id || targetNetworkId) : null
        };
    } catch (e) {
        console.error('Error loading membership artifact', e);
        return { address: null, abi: null, networkId: null };
    }
};

app.get('/events', (req, res) => {
    res.render('events', { events: readEvents() });
});

app.get('/events/new', (req, res) => {
    res.render('add-event', { event: null, contractConfig: loadContractConfig() });
});

app.get('/events/:eventId', (req, res) => {
    const events = readEvents();
    const eventId = String(req.params.eventId || '');
    const event = events.find((item) => String(item.id) === eventId);
    if (!event) {
        return res.status(404).render('event-details', { event: null });
    }
    res.render('event-details', { event });
});

app.get('/api/contract-config', (req, res) => {
    res.json(loadContractConfig());
});

app.get('/api/membership-config', (req, res) => {
    res.json(loadMembershipConfig());
});

app.post('/events/new', upload.single('eventImage'), (req, res) => {
    const walletAddress = (req.body.walletAddress || '').toLowerCase();
    if (!walletAddress) {
        return res.status(401).render('add-event', {
            event: {
                id: req.body.eventId || '',
                name: req.body.name || '',
                date: req.body.date || '',
                location: req.body.location || '',
                price: req.body.price || '',
                category: req.body.category || '',
                ticketsAvailable: Number(req.body.tickets || 0),
                about: req.body.about || ''
            },
            error: 'Please connect your wallet before creating an event.',
            contractConfig: loadContractConfig()
        });
    }
    if (walletAddress !== ADMIN_WALLET) {
        return res.status(403).render('add-event', {
            event: {
                id: req.body.eventId || '',
                name: req.body.name || '',
                date: req.body.date || '',
                location: req.body.location || '',
                price: req.body.price || '',
                category: req.body.category || '',
                ticketsAvailable: Number(req.body.tickets || 0),
                about: req.body.about || ''
            },
            error: 'Only the admin wallet can create events.',
            contractConfig: loadContractConfig()
        });
    }
    const eventDateRaw = (req.body.date || '').trim();
    const eventDate = new Date(eventDateRaw);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!eventDateRaw || Number.isNaN(eventDate.getTime()) || eventDate < today) {
        return res.status(400).render('add-event', {
            event: {
                id: req.body.eventId || '',
                name: req.body.name || '',
                date: req.body.date || '',
                location: req.body.location || '',
                price: req.body.price || '',
                category: req.body.category || '',
                ticketsAvailable: Number(req.body.tickets || 0),
                about: req.body.about || ''
            },
            error: 'Event date must be today or later.',
            contractConfig: loadContractConfig()
        });
    }
    const event = {
        id: req.body.eventId || '',
        name: req.body.name || '',
        date: req.body.date || '',
        location: req.body.location || '',
        price: Number(req.body.price || 0),
        category: req.body.category || '',
        ticketsAvailable: Number(req.body.tickets || 0),
        about: req.body.about || '',
        image: req.file ? `/images/${req.file.filename}` : null,
        createdBy: walletAddress,
        onChainId: req.body.onChainId || '',
        txHash: req.body.txHash || '',
        createdAt: new Date().toISOString()
    };
    const events = readEvents();
    events.push(event);
    writeEvents(events);
    res.redirect('/events');
});

app.post('/events/delete', (req, res) => {
    const walletAddress = (req.body.walletAddress || '').toLowerCase();
    if (!walletAddress) {
        if (req.get('accept') && req.get('accept').includes('application/json')) {
            return res.status(401).json({ ok: false, error: 'unauthorized' });
        }
        return res.status(401).redirect('/events');
    }
    if (walletAddress !== ADMIN_WALLET) {
        if (req.get('accept') && req.get('accept').includes('application/json')) {
            return res.status(403).json({ ok: false, error: 'forbidden' });
        }
        return res.status(403).redirect('/events');
    }
    const eventId = req.body.eventId || '';
    const events = readEvents();
    const filtered = events.filter((event) => String(event.id) !== String(eventId));
    writeEvents(filtered);
    if (req.get('accept') && req.get('accept').includes('application/json')) {
        return res.json({ ok: true });
    }
    res.redirect('/events');
});

app.get('/mytickets', (req, res) => {
    res.render('mytickets');
});

// Routes for membership page
app.get('/membership', (req, res) => {
    res.render('membership', { member: null });
});

app.get('/dashboard', (req, res) => {
    const walletAddress = (req.query.walletAddress || '').toLowerCase();
    const cookies = parseCookies(req.headers.cookie || '');
    const adminCookie = (cookies.adminWallet || '').toLowerCase();
    const isAdmin = walletAddress === ADMIN_WALLET || adminCookie === ADMIN_WALLET;
    if (!isAdmin) {
        return res.status(403).redirect('/events');
    }
    res.render('dashboard');
});

app.get('/verification', (req, res) => {
    res.render('verification');
});

app.get('/about-us', (req, res) => {
    res.render('about-us');
});

app.get('/how-it-works', (req, res) => {
    res.render('how-it-works');
});

app.get('/smart-contracts', (req, res) => {
    res.render('smart-contracts');
});

app.get('/support', (req, res) => {
    res.render('support');
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
// declare the global variables
