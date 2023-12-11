#!/bin/bash
source ./var.sh

address=$(jq -r '.address' address.info)
echo "Address: $address"
bitcoin-cli -rpcwallet=$ordWalletName -rpccookiefile=$bitcoinCookie -datadir=$bitcoinDataDir -chain=regtest generatetoaddress 1 $address
