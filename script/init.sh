#!/bin/bash

ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet create > "wallet.info"
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet receive > "address.info"
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest getblockchaininfo
address=$(jq -r '.address' address.info)
echo "Address: $address"
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest generatetoaddress 101 $address
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance



