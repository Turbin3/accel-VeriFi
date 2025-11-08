const bs58 = require('bs58');
const fs = require('fs');

const PRIVATE_KEY_BASE58 = 'Input your private key here'; // your Phantom private key here

// Decode base58 string to bytes buffer
const secretKey = bs58.decode(PRIVATE_KEY_BASE58);

if (secretKey.length !== 64) {
    throw new Error('Invalid private key length: expected 64 bytes');
}

// Convert buffer to array
const keypairArray = Array.from(secretKey);

// Save the keypair array as JSON file
fs.writeFileSync('phantom-keypair.json', JSON.stringify(keypairArray, null, 2));

console.log('phantom-keypair.json created successfully');
