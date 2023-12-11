#!/bin/bash
# source ./var.sh "/Users/chenwenjie/test/ordinual/ordinals-indexer/bitcoind/data" \
# "/Users/chenwenjie/test/ordinual/ordinals-indexer/ord/data"
# source ./var.sh "/var/lib/bitcoind/regtest" "/var/lib/ord/regtest"

export bitcoinDataDir=$1
export ordDataDir=$2
export bitcoinCookie="$bitcoinDataDir/.cookie"
export ordWalletName="ord"

export bitcoinDataDir="/var/lib/bitcoind"
export bitcoinCookie="$bitcoinDataDir/.cookie"
export ordDataDir="/var/lib/ord"
export ordWalletName="ord"

echo "bitcoinDataDir: $bitcoinDataDir"
echo "bitcoinCookie: $bitcoinCookie"
echo "ordDataDir: $ordDataDir"
echo "ordWalletName: $ordWalletName"
