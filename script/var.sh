#!/bin/bash
# source "/Users/chenwenjie/test/ordinual/ordinals-indexer"
# source "/root/deploy/OPI"

export opihome=$1
export bitcoinDataDir="$opihome/bitcoind/data"
export bitcoinCookie="$opihome/bitcoind/data/regtest/.cookie"
export ordDataDir="$opihome/ord/data"
export ordWalletName="ord"

echo "bitcoinDataDir: $bitcoinDataDir"
echo "bitcoinCookie: $bitcoinCookie"
echo "ordDataDir: $ordDataDir"
echo "ordWalletName: $ordWalletName"
