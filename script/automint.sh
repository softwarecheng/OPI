#!/bin/bash
# create an alias for each node
∂
# local
node1="bitcoin-cli -rpccookiefile=/var/lib/bitcoind/regtest/.cookie -datadir=/var/lib/bitcoind -chain=regtest"
node2="bitcoin-cli -rpccookiefile=/var/lib/bitcoind1/regtest/.cookie -datadir=/var/lib/bitcoind1 -chain=regtest"
# remote 
# node1="bitcoin-cli -rpcuser=<usr> -rpcpassword=<pwd> -rpcconnect=<ip> -rpcport=<port> -chain=regtest"
# node2="bitcoin-cli -rpcuser=<usr> -rpcpassword=<pwd> -rpcconnect=<ip> -rpcport=<port> -chain=regtest"

# the mining interval in seconds
if [ -z "$1" ]; then
    blockTime=5
else
    blockTime=$1
fi

while true
do
    # each node has a 50% chance of mining the next block
    rnd=$(($RANDOM%2))
if [ "$rnd" = "0" ];
    then
        echo node1 generated the next block:
        $node1 generate 1
    else
        echo node2 generated the next block:
        $node2 generate 1
    fi
sleep $blockTime
done

# ref https://medium.com/@kay.odenthal_25114/create-a-private-bitcoin-network-with-simulated-mining-b35f5b03e534