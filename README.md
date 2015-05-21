# blockchain.js
Blockchain data structure implementation in JavaScript

This is a clone of bitcore's codebase, with the following changes:
- Removed Script-related classes
- Removed URI, Unit, and other bitcoin-only utils
- Changed PublicKey to support only compressed keys
- Removed Transaction Input, Output and related classes
- Changed Transaction signing logic (using simpler scheme)
- Transaction now has owner, previous transaction, color, position, version, signature

