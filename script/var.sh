#!/bin/bash
# export opihome="/Users/chenwenjie/test/ordinual/ordinals-indexer"
export opihome="/root/deploy/OPI"
export bitcoinDataDir=$opihome"/bitcoind/data"
export bitcoinCookie=$opihome"/bitcoind/data/regtest/.cookie"
export ordDataDir=$opihome"/ord/data"
export ordWalletName="ord"

echo "bitcoinDataDir: $bitcoinDataDir"
echo "bitcoinCookie: $bitcoinCookie"
echo "ordDataDir: $ordDataDir"
echo "ordWalletName: $ordWalletName"
