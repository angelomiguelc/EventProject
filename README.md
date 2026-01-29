Ganache Setup
1. Add new workspace on Ethereum
2. Type any work space name
3. Connect truffle-config.js for truffle projects
4. Start
5. Go to Settings -> Server
6. Change Network ID to 1337
7. Save and Restart

Metamask Setup (Same as school)
1. Connected to Localhost 8545
Network name: Localhost 8545
Default RPC URL: HTTP://127.0.0.1:7545
Chain ID: 1337
Currency Symbol: ETH

VS Code
1. Right click open app.js in integrated terminal
2. npm install
3. truffle compile
4. truffle migrate --network development --reset
5. nodemon app.js

Admin Wallet (Admin access & Receiving funds)
1. Copy Private Key for the address you want for admin
2. Copy Admin wallet address and paste in: 
    - config/adminWallet.js: const ADMIN_WALLET = "<wallet address>"

Adding of Buyer/Seller wallet
1. Copy Private Key of accounts in Ganache
2. Metamask -> Add Wallet -> Import an account
3. Paste private key and press Import
4. Rename the wallet (etc: Buyer/Seller)
5. Make sure to connect account to localhost (in metamask)