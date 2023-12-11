#!/bin/bash

export bitcoinDataDir="/var/lib/bitcoind"
export bitcoinCookie="$bitcoinDataDir/regtest/.cookie"
export ordDataDir="/var/lib/ord"
export ordWalletName="ord"

address=$(jq -r '.address' address.info)
echo "Address: $address"
# ord 0.9
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet inscribe --fee-rate 8 ./test.txt

# ord 0.12
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet inscribe --file ./test.txt --fee-rate 8
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest generatetoaddress 1 $address
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance



