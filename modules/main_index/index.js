// to run: node --max-old-space-size=8192 .\index.js

// NOTE: there is a possibility that if json contains \u0000, it'll be saved into text_content not content (jsonb)

require('dotenv').config();

const { Pool } = require('pg')
var fs = require('fs');
var bitcoin = require('bitcoinjs-lib');
var ecc = require('tiny-secp256k1');
const process = require('process');
const { execSync } = require("child_process");
const readline = require('readline');

bitcoin.initEccLib(ecc)

console.log("VERSION V0.1.0")

// for self-signed cert of postgres
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const promise_limit = 50000

var db_pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_DATABASE || 'postgres',
  password: process.env.DB_PASSWD,
  port: parseInt(process.env.DB_PORT || "5432"),
  max: process.env.DB_MAX_CONNECTIONS || 50, // maximum number of clients!!
  ssl: process.env.DB_SSL == 'true' ? true : false
})

var chain_folder = process.env.BITCOIN_CHAIN_FOLDER || "~/.bitcoin/"
var ord_binary = process.env.ORD_BINARY || "ord"
var ord_folder = process.env.ORD_FOLDER || "../../ord/target/release/"
var ord_datadir = process.env.ORD_DATADIR || "."
const first_inscription_height = parseInt(process.env.FIRST_INSCRIPTION_HEIGHT || "767430")

function delay(sec) {
  return new Promise(resolve => setTimeout(resolve, sec * 1000));
}

function save_error_log(log) {
  console.error(log)
  fs.appendFileSync("log_file_error.txt", log + "\n")
}

async function main_index() {
  await check_db()

  let first = true;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (first) first = false
    else await delay(2)

    let start_tm = +(new Date())

    if (!fs.existsSync(ord_folder + "log_file.txt")) {
      console.error("log_file.txt not found, creating")
      fs.writeFileSync(ord_folder + "log_file.txt", '')
    }
    if (!fs.existsSync(ord_folder + "log_file_index.txt")) {
      console.error("log_file_index.txt not found, creating")
      fs.writeFileSync(ord_folder + "log_file_index.txt", '')
    }

    let ord_last_block_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from block_hashes;`)
    let ord_last_block_height = ord_last_block_height_q.rows[0].max_height
    if (ord_last_block_height < first_inscription_height) { // first inscription
      ord_last_block_height = first_inscription_height
    }

    let ord_index_st_tm = +(new Date())
    let ord_end_block_height = ord_last_block_height + 500
    if (ord_last_block_height < 774000) { // a random point where blocks start to get more inscription
      ord_end_block_height = ord_last_block_height + 1000
    }

    let current_directory = process.cwd()
    process.chdir(ord_folder);
    let ord_index_cmd = ord_binary + " --bitcoin-data-dir " + chain_folder + " --data-dir " + ord_datadir + " --height-limit " + (ord_end_block_height) + " index run"
    try {
      execSync(ord_index_cmd,
        {stdio: 'inherit'})
    }
    catch (err) {
      console.error("ERROR ON ORD!!!")
      console.error(err)
      process.chdir(current_directory);

      continue
    }
    process.chdir(current_directory);
    let ord_index_tm = +(new Date()) - ord_index_st_tm
    
    const fileStream = fs.createReadStream(ord_folder + "log_file.txt", { encoding: 'UTF-8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let lines = []
    for await (const line of rl) {
      lines.push(line)
    }
    let lines_index = fs.readFileSync(ord_folder + "log_file_index.txt", "utf8").split('\n')
    if (lines_index.length == 1) {
      console.log("Nothing new, waiting!!")
      continue
    }

    let current_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from block_hashes;`)
    let current_height = current_height_q.rows[0].max_height

    console.log("Checking for possible reorg")
    for (const l of lines_index) {
      if (l.trim() == "") continue
      let parts = l.split(';')
      if (parts[2].trim() == "new_block") {
        let block_height = parseInt(parts[1].trim())
        if (block_height > current_height) continue
        console.warn("Block repeating, possible reorg!!")
        let blockhash = parts[3].trim()
        let blockhash_db_q = await db_pool.query("select blockhash from block_hashes where block_height = $1;", [block_height])
        if (blockhash_db_q.rows[0].blockhash != blockhash) {
          let reorg_st_tm = +(new Date())
          console.error("Reorg detected at block_height " + block_height)
          await handle_reorg(block_height)
          console.log("Reverted to block_height " + (block_height - 1))
          let reorg_tm = +(new Date()) - reorg_st_tm
          reorg_tm = Math.round(reorg_tm)
          
          await db_pool.query(`INSERT into ord_indexer_reorg_stats
              (reorg_tm, old_block_height, new_block_height)
              values ($1, $2, $3);`, 
              [reorg_tm, current_height, block_height - 1])
        }
      }
    }

    // some sanity checks and checks for possible early exit of ord
    let last_start_idx = null
    let last_start_block = null
    let last_end_idx = null
    let block_start_idxes = {}
    let next_expected_start = true
    let lenlines = lines.length
    let ioffset = 0
    for (let i = 0; i < lenlines; i++) {
      let l = lines[i + ioffset]
      if (l.trim() == "") { continue }
      
      let parts = l.split(';')
      if (parts[0] != "cmd") { continue }
      if (parts[2] == "block_start") {
        if (last_start_idx == null && i != 0) {
          console.error("Faulty block_start position: " + l)
          process.exit(1)
        }
        let block_height = parseInt(parts[1])
        if ((last_start_block != null) && (block_height <= last_start_block)) {
          // repeating block_start, remove early entries
          console.error("start with less or equal block_height in latter: " + l)
          lines.splice(block_start_idxes[block_height] + ioffset, i + ioffset)
          ioffset -= i - block_start_idxes[block_height]
          let temp_i = 0
          while ((block_height + temp_i) in block_start_idxes) {
            delete block_start_idxes[block_height + temp_i]
            temp_i += 1
          }
        }
        else if (!next_expected_start) {
          console.error("two start but bigger block_height in latter: " + l)
          process.exit(1)
        }
        else if (i != ioffset && i - 1 != last_end_idx) {
          console.error("block_start not right after block_end: " + l)
          process.exit(1)
        }
        last_start_idx = i
        last_start_block = block_height
        next_expected_start = false
        block_start_idxes[block_height] = i
      }
      else if (parts[2] == "block_end") {
        if (next_expected_start) {
          console.error("NOT expected block_end: " + l)
          process.exit(1)
        }
        let block_height = parseInt(parts[1])
        if (block_height != last_start_block) {
          console.error("block_end block_height != block_start block_height: " + l)
          process.exit(1)
        }
        last_end_idx = i
        next_expected_start = true
      }
      else {
        continue
      }
    }
    if (!next_expected_start) {
      console.error("logs didn't end with block_end - did ord crash?")
      let all_tm = +(new Date()) - start_tm
      ord_index_tm = Math.round(ord_index_tm)
      all_tm = Math.round(all_tm)

      await db_pool.query(`INSERT into ord_indexer_work_stats
          (ord_index_tm, all_tm)
          values ($1, $2);`, 
          [ord_index_tm, all_tm])
      continue
    }

    let ord_sql_st_tm = +(new Date())

    let sql_query_insert_ord_number_to_id = `INSERT into ord_number_to_id (inscription_number, inscription_id, block_height) values ($1, $2, $3);`
    let sql_query_insert_transfer = `INSERT into ord_transfers (id, inscription_id, block_height, old_satpoint, new_satpoint, new_pkScript, new_wallet, sent_as_fee) values ($1, $2, $3, $4, $5, $6, $7, $8);`
    let sql_query_insert_content = `INSERT into ord_content (inscription_id, content, content_type, block_height) values ($1, $2, $3, $4);`
    let sql_query_insert_text_content = `INSERT into ord_content (inscription_id, text_content, content_type, block_height) values ($1, $2, $3, $4);`
    
    let ord_sql_query_count = 0
    let new_inscription_count = 0
    let transfer_count = 0

    let max_height = -1
    for (const l of lines_index) {
      if (l.trim() == '') { continue } 
      let parts = l.split(';')

      if (parts[0] != "cmd") { continue } 
      if (parts[2] != "new_block") { continue }
      if (parseInt(parts[1]) > max_height) max_height = parseInt(parts[1])
    }

    console.log("db_height: " + current_height + " -> " + max_height)
    let main_min_block_height = current_height + 1
    let main_max_block_height = max_height

    let current_transfer_id_q = await db_pool.query(`SELECT coalesce(max(id), -1) as maxid from ord_transfers;`)
    let current_transfer_id = parseInt(current_transfer_id_q.rows[0].maxid) + 1

    let future_sent_as_fee_transfer_id = {}
    let running_promises = []
    let idx = 0
    for (const l of lines) {
      if (l.trim() == '') { continue }
      idx += 1
      if (idx % 10000 == 0) console.log(idx + " / " + lines.length)

      let parts = l.split(';')
      if (parts[0] != "cmd") { continue }

      if (running_promises.length > promise_limit) {
        await Promise.all(running_promises)
        running_promises = []
      }

      let block_height = parseInt(parts[1])
      if (block_height <= current_height) continue
      if (parts[2] == "block_start") continue
      else if (parts[2] == "block_end") continue
      else if (parts[2] == "insert") {
        if (parts[3] == "number_to_id") {
          if (block_height > current_height) {
            running_promises.push(execute_on_db(sql_query_insert_ord_number_to_id, [parseInt(parts[4]), parts[5], block_height]))
            new_inscription_count += 1
            ord_sql_query_count += 1
          }
        }
        else if (parts[3] == "early_transfer_sent_as_fee") {
          if (block_height > current_height) {
            future_sent_as_fee_transfer_id[parts[4]] = [current_transfer_id, false, block_height]
            current_transfer_id += 1
          }
        }
        else if (parts[3] == "transfer") {
          if (block_height > current_height) {
            if ((parts[4] in future_sent_as_fee_transfer_id) && (future_sent_as_fee_transfer_id[parts[4]][2] == block_height)) {
              let pair = future_sent_as_fee_transfer_id[parts[4]]
              let transfer_id = pair[0]
              if (pair[1]) {
                save_error_log("--------------------------------")
                save_error_log("ERROR: early transfer sent as fee already used")
                save_error_log("On inscription: " + parts[4])
                save_error_log("Transfer: " + l)
                delay(10)
                process.exit(1)
              }
              future_sent_as_fee_transfer_id[parts[4]][1] = true
              running_promises.push(execute_on_db(sql_query_insert_transfer, [transfer_id, parts[4], block_height, parts[5], parts[6], parts[8], wallet_from_pkscript(parts[8]), parts[7] == "true" ? true : false]))
              transfer_count += 1
              ord_sql_query_count += 1
            } else {
              running_promises.push(execute_on_db(sql_query_insert_transfer, [current_transfer_id, parts[4], block_height, parts[5], parts[6], parts[8], wallet_from_pkscript(parts[8]), parts[7] == "true" ? true : false]))
              current_transfer_id += 1
              transfer_count += 1
              ord_sql_query_count += 1
            }
          }
        }
        else if (parts[3] == "content") {
          if (block_height > current_height) {
            // get string after 6th semicolon
            let content = parts.slice(7).join(';')
            if (parts[5] == 'true') { // JSON
              if (!content.includes('\\u0000')) {
                running_promises.push(execute_on_db(sql_query_insert_content, [parts[4], content, parts[6], block_height]))
                ord_sql_query_count += 1
              } else {
                running_promises.push(execute_on_db(sql_query_insert_text_content, [parts[4], content, parts[6], block_height]))
                ord_sql_query_count += 1
                save_error_log("--------------------------------")
                save_error_log("Error parsing JSON: " + content)
                save_error_log("On inscription: " + parts[4])
              }
            } else {
              running_promises.push(execute_on_db(sql_query_insert_text_content, [parts[4], content, parts[6], block_height]))
              ord_sql_query_count += 1
            }
          }
        }
      }
    }
    await Promise.all(running_promises)
    running_promises = []

    for (const l of lines_index) {
      if (l.trim() == '') { continue } 
      let parts = l.split(';')

      if (parts[0] != "cmd") { continue } 
      if (parts[2] != "new_block") { continue }

      let block_height = parseInt(parts[1])
      if (block_height < first_inscription_height) { continue }
      let blockhash = parts[3].trim()
      await db_pool.query(`INSERT into block_hashes (block_height, block_hash) values ($1, $2) ON CONFLICT (block_height) DO NOTHING;`, [block_height, blockhash])
    }
    
    let ord_sql_tm = +(new Date()) - ord_sql_st_tm

    console.log("Updating Log Files")
    let update_log_st_tm = +(new Date())
    fs.writeFileSync(ord_folder + "log_file.txt", '')
    fs.writeFileSync(ord_folder + "log_file_index.txt", '')
    let update_log_tm = +(new Date()) - update_log_st_tm

    ord_index_tm = Math.round(ord_index_tm)
    ord_sql_tm = Math.round(ord_sql_tm)
    update_log_tm = Math.round(update_log_tm)
    
    let all_tm = +(new Date()) - start_tm
    all_tm = Math.round(all_tm)

    await db_pool.query(`INSERT into ord_indexer_work_stats
      (main_min_block_height, main_max_block_height, ord_sql_query_count, new_inscription_count, 
        transfer_count, ord_index_tm, ord_sql_tm, update_log_tm, all_tm)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9);`, 
        [main_min_block_height, main_max_block_height, ord_sql_query_count, new_inscription_count, 
          transfer_count, ord_index_tm, ord_sql_tm, update_log_tm, all_tm])
    
    console.log("ALL DONE")
  }
}

async function execute_on_db(query, params) {
  try {
    await db_pool.query(query, params)
  } catch (err) {
    console.error("ERROR ON DB!!!")
    console.error(err)
    console.error(query)
    console.error(params)
    process.exit(1)
  }
}

/*
NOTE: removed following from node_modules/bitcoinjs-lib/src/payments/p2tr.js
//if (pubkey && pubkey.length) {
//  if (!(0, ecc_lib_1.getEccLib)().isXOnlyPoint(pubkey))
//    throw new TypeError('Invalid pubkey for p2tr');
//}
o.w. it cannot decode 512057cd4cfa03f27f7b18c2fe45fe2c2e0f7b5ccb034af4dec098977c28562be7a2
*/
function wallet_from_pkscript(pkscript) {
  try {
    let address = bitcoin.payments.p2tr({ output: Buffer.from(pkscript, 'hex') })
    return address.address
  } catch { /* try others */ }
  try {
    let address = bitcoin.payments.p2wsh({ output: Buffer.from(pkscript, 'hex') })
    return address.address
  } catch { /* try others */ }
  try {
    let address = bitcoin.payments.p2wpkh({ output: Buffer.from(pkscript, 'hex') })
    return address.address
  } catch { /* try others */ }
  try {
    let address = bitcoin.payments.p2sh({ output: Buffer.from(pkscript, 'hex') })
    return address.address
  } catch { /* try others */ }
  try {
    let address = bitcoin.payments.p2pkh({ output: Buffer.from(pkscript, 'hex') })
    return address.address
  } catch { /* end */ }

  return null
}

async function handle_reorg(block_height) {
  let last_correct_blockheight = block_height - 1
  
  await db_pool.query(`DELETE from ord_transfers where block_height > $1;`, [last_correct_blockheight])
  await db_pool.query(`DELETE from ord_number_to_id where block_height > $1;`, [last_correct_blockheight])
  await db_pool.query(`DELETE from ord_content where block_height > $1;`, [last_correct_blockheight])
  await db_pool.query(`DELETE from block_hashes where block_height > $1;`, [last_correct_blockheight])
  
  await db_pool.query(`SELECT setval('ord_transfers_id_seq', max(id)) from ord_transfers;`)
  await db_pool.query(`SELECT setval('ord_number_to_id_id_seq', max(id)) from ord_number_to_id;`)
  await db_pool.query(`SELECT setval('ord_content_id_seq', max(id)) from ord_content;`)
  await db_pool.query(`SELECT setval('block_hashes_id_seq', max(id)) from block_hashes;`)
}

async function check_db() {
  console.log("checking db")

  let current_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from block_hashes;`)
  let current_height = current_height_q.rows[0].max_height
  console.log("current_height: " + current_height)

  let current_transfer_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from ord_transfers;`)
  let current_transfer_height = current_transfer_height_q.rows[0].max_height
  console.log("current_transfer_height: " + current_transfer_height)

  let current_ord_number_to_id_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from ord_number_to_id;`)
  let current_ord_number_to_id_height = current_ord_number_to_id_height_q.rows[0].max_height
  console.log("current_ord_number_to_id_height: " + current_ord_number_to_id_height)

  let current_content_height_q = await db_pool.query(`SELECT coalesce(max(block_height), -1) as max_height from ord_content;`)
  let current_content_height = current_content_height_q.rows[0].max_height
  console.log("current_content_height: " + current_content_height)

  if (current_height < current_transfer_height) {
    console.error("current_height < current_transfer_height")
    await db_pool.query(`DELETE from ord_transfers where block_height > $1;`, [current_height])
  }
  if (current_height < current_ord_number_to_id_height) {
    console.error("current_height < current_ord_number_to_id_height")
    await db_pool.query(`DELETE from ord_number_to_id where block_height > $1;`, [current_height])
  }
  if (current_height < current_content_height) {
    console.error("current_height < current_content_height")
    await db_pool.query(`DELETE from ord_content where block_height > $1;`, [current_height])
  }
}

main_index()