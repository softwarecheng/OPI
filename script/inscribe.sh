#!/bin/bash


address=$(jq -r '.address' address.info)
echo "Address: $address"
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet inscribe --file ./test.txt --fee-rate 8
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest generatetoaddress 1 $address
ord --bitcoin-data-dir $bitcoinDataDir --cookie-file $bitcoinCookie --data-dir $ordDataDir --chain regtest wallet balance



