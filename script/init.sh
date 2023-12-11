#!/bin/bash

export bitcoinDataDir="/var/lib/bitcoind"
export bitcoinCookie="$bitcoinDataDir/regtest/.cookie"
export ordDataDir="/var/lib/ord"
export ordWalletName="ord"

ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest --index-sats --enable-json-api  server --http

ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet create > "wallet.info"
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet receive > "address.info"

export address=$(jq -r '.address' address.info)
echo "Address: $address"
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest generatetoaddress 101 $address
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance



