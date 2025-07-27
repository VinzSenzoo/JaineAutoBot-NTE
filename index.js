import "dotenv/config";
import blessed from "blessed";
import figlet from "figlet";
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS;
const ETH_ADDRESS = process.env.ETH_ADDRESS;
const BTC_ADDRESS = process.env.BTC_ADDRESS;
const AOGI_ADDRESS = process.env.AOGI_ADDRESS;
const NETWORK_NAME = process.env.NETWORK_NAME;
const APPROVAL_GAS_LIMIT = 100000;
const SWAP_GAS_LIMIT = 150000;
const ESTIMATED_GAS_USAGE = 150000;
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const CONTRACT_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
];

const USDT_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

const ETH_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

const BTC_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

let transactionRunning = false;
let chosenSwap = null;
let transactionQueue = Promise.resolve();
let transactionQueueList = [];
let transactionIdCounter = 0;
let nextNonce = null;
let selectedGasPrice = null; 

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shortHash(hash) {
  return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
}

async function interruptibleDelay(totalMs) {
  const interval = 200;
  let elapsed = 0;
  while (elapsed < totalMs) {
    if (!transactionRunning) break;
    await delay(interval);
    elapsed += interval;
  }
}

let transactionLogs = [];
let renderTimeout;
function safeRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => { screen.render(); }, 50);
}


function updateLogs() {
  logsBox.setContent(transactionLogs.join("\n"));
  if (typeof logsBox.getScrollHeight === "function" && typeof logsBox.scrollTo === "function") {
    logsBox.scrollTo(logsBox.getScrollHeight());
  } else if (typeof logsBox.setScrollPerc === "function") {
    logsBox.setScrollPerc(100);
  }
  safeRender();
}

function addLog(message, type) {
  const timestamp = new Date().toLocaleTimeString();
  let coloredMessage = message;
  if (type === "system") {
    coloredMessage = `{bright-white-fg}${message}{/bright-white-fg}`;
  } else if (type === "0g") {
    coloredMessage = `{bright-cyan-fg}${message}{/bright-cyan-fg}`;
  } else if (type === "success") {
    coloredMessage = `{bright-green-fg}${message}{/bright-green-fg}`;
  } else if (type === "error") {
    coloredMessage = `{bright-red-fg}${message}{/bright-red-fg}`;
  } else if (type === "wait") {
    coloredMessage = `{bright-yellow-fg}${message}{/bright-yellow-fg}`;
  }
    transactionLogs.push(`[ {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} ] ${coloredMessage}`);
    updateLogs();
}

function clearTransactionLogs() {
  transactionLogs = [];
  updateLogs();
  addLog("Transaction logs telah dihapus.", "system");
}

const screen = blessed.screen({
  smartCSR: true,
  title: "NT Exhaust",
  fullUnicode: true,
  mouse: true
});

const headerBox = blessed.box({
  top: 0,
  left: "center",
  width: "100%",
  tags: true,
  style: { fg: "white" }
});
figlet.text("NT EXHAUST", { font: "ANSI Shadow", horizontalLayout: "default" }, (err, data) => {
  if (err) headerBox.setContent("{center}{bold}NT EXHAUST{/bold}{/center}");
  else headerBox.setContent(`{center}{bold}{cyan-fg}${data}{/cyan-fg}{/bold}{/center}`);
  screen.render();
});

const descriptionBox = blessed.box({
  left: "center",
  width: "100%",
  content: "{center}{bold}{bright-yellow-fg}  ✪ JAINE TESTNET AUTO BOT ✪{/bright-yellow-fg}{/bold}{/center}",
  tags: true,
  style: { fg: "white", bg: "default" }
});

const logsBox = blessed.box({
  label: " Transaction Logs ",
  border: { type: "line" },
  top: 0,  
  left: 0,
  width: "60%",
  height: 10,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  keys: true,
  vi: true,
  tags: true,
  scrollback: 100,
  scrollbar: { ch: " ", inverse: true, style: { bg: "blue" } },
  style: { border: { fg: "red" }, fg: "bright-cyan", bg: "default" }
});

const walletBox = blessed.box({
  label: " Informasi Wallet ",
  border: { type: "line" },
  tags: true,
  style: { border: { fg: "magenta" }, fg: "white", bg: "default", align: "left", valign: "top" },
  content: "Mengambil data wallet..."
});


const gasPriceBox = blessed.box({
  label: " Gas Price Info ",
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "blue" }, fg: "white" },
  content: "Loading gas price..."
});

async function updateGasPriceBox() {
  try {
    const feeData = await provider.getFeeData();
    const gasPriceBN = feeData.gasPrice; 
    const gasNormal = gasPriceBN;
    const gasRendah = gasPriceBN * 80n / 100n;
    const gasFeeX2 = gasPriceBN * 2n;
    const feeNormal = gasNormal * BigInt(ESTIMATED_GAS_USAGE);
    const feeRendah = gasRendah * BigInt(ESTIMATED_GAS_USAGE);
    const feeX2 = gasFeeX2 * BigInt(ESTIMATED_GAS_USAGE);
    const gasNormalStr = parseFloat(ethers.formatUnits(gasNormal, "gwei")).toFixed(4);
    const gasRendahStr = parseFloat(ethers.formatUnits(gasRendah, "gwei")).toFixed(4);
    const gasX2Str = parseFloat(ethers.formatUnits(gasFeeX2, "gwei")).toFixed(4);

    const feeNormalStr = parseFloat(ethers.formatEther(feeNormal)).toFixed(8);
    const feeRendahStr = parseFloat(ethers.formatEther(feeRendah)).toFixed(8);
    const feeX2Str = parseFloat(ethers.formatEther(feeX2)).toFixed(8);
    const content =
      ` Gas Normal : {bright-green-fg}${gasNormalStr}{/bright-green-fg} Gwei      {bright-yellow-fg} ➥ {/bright-yellow-fg}     Estimasi Fee : {bright-red-fg}${feeNormalStr}{/bright-red-fg} AOGI\n` +
      ` Gas Rendah : {bright-green-fg}${gasRendahStr}{/bright-green-fg} Gwei      {bright-yellow-fg} ➥ {/bright-yellow-fg}     Estimasi Fee : {bright-red-fg}${feeRendahStr}{/bright-red-fg} AOGI\n` +
      ` Gas Fee x2 : {bright-green-fg}${gasX2Str}{/bright-green-fg} Gwei     {bright-yellow-fg}  ➥ {/bright-yellow-fg}     Estimasi Fee : {bright-red-fg}${feeX2Str}{/bright-red-fg} AOGI`;
    gasPriceBox.setContent(content);
    screen.render();
  } catch (error) {
    addLog("Gagal mengupdate Gas Price Box: " + error.message, "error");
  }
}
setInterval(updateGasPriceBox, 10000);
updateGasPriceBox();

function updateMainMenuItems() {
  const baseItems = ["Jaine Swap", "Antrian Transaksi", "Clear Transaction Logs", "Refresh", "Exit"];
  if (transactionRunning) baseItems.splice(1, 0, "Stop All Transactions");
  mainMenu.setItems(baseItems);
  screen.render();
}
const mainMenu = blessed.list({
  label: " Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { fg: "white", bg: "default", border: { fg: "yellow" }, selected: { bg: "green", fg: "black" } },
  items: []
});

function update0gSwapSubMenuItems() {
  const items = ["Auto Swap USDT & ETH", "Auto Swap USDT & BTC", "Auto Swap BTC & ETH", "Clear Transaction Logs", "Back To Main Menu", "Exit"];
  if (transactionRunning) items.unshift("Stop Transaction");
  autoSwapSubMenu.setItems(items);
  screen.render();
}
const autoSwapSubMenu = blessed.list({
  label: " Auto Swap Menu ",
  left: "60%",
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line" },
  style: { selected: { bg: "blue", fg: "white" }, border: { fg: "yellow" }, fg: "white" },
  items: []
});
autoSwapSubMenu.hide();

const queueMenu = blessed.box({
  label: " Antrian Transaksi ",
  top: "10%",
  left: "center",
  width: "80%",
  height: "80%",
  border: { type: "line" },
  style: { border: { fg: "blue" } },
  scrollable: true,
  keys: true,
  mouse: true,
  alwaysScroll: true,
  tags: true
});
queueMenu.hide();

const exitButton = blessed.button({
  content: " Exit ",
  bottom: 0,
  left: "center",
  shrink: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "red",
    border: { fg: "white" },
    hover: { bg: "blue" }
  },
  mouse: true,
  keys: true
});
exitButton.on("press", () => {
  queueMenu.hide();
  mainMenu.show();
  mainMenu.focus();
  screen.render();
});
queueMenu.append(exitButton);

const promptBox = blessed.prompt({
  parent: screen,
  border: "line",
  height: "20%",
  width: "50%",
  top: "center",
  left: "center",
  label: "{bright-blue-fg}Jumlah Swap{/bright-blue-fg}",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  style: { fg: "bright-white", bg: "default", border: { fg: "red" } }
});


async function updateWalletData() {
  try {
    const walletAddress = wallet.address;
    const balanceNative = await provider.getBalance(walletAddress);
    const saldoAOGI = parseFloat(ethers.formatEther(balanceNative)).toFixed(4);

    const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);
    const balanceUSDT = await usdtContract.balanceOf(walletAddress);
    const saldoUSDT = parseFloat(ethers.formatEther(balanceUSDT)).toFixed(4);

    const ethContract = new ethers.Contract(ETH_ADDRESS, ETH_ABI, provider);
    const balanceETH = await ethContract.balanceOf(walletAddress);
    const saldoETH = parseFloat(ethers.formatEther(balanceETH)).toFixed(4);

    const btcContract = new ethers.Contract(BTC_ADDRESS, BTC_ABI, provider);
    const balanceBTC = await btcContract.balanceOf(walletAddress);
    const saldoBTC = parseFloat(ethers.formatUnits(balanceBTC, 18)).toFixed(4);

    const content =
`┌── Wallet Information
│   ├── Address : ${walletAddress.slice(0, 10)}..${walletAddress.slice(-3)}
│   ├── AOGI    : {bright-green-fg}${saldoAOGI}{/bright-green-fg}
│   ├── ETH     : {bright-green-fg}${saldoETH}{/bright-green-fg}
│   ├── USDT    : {bright-green-fg}${saldoUSDT}{/bright-green-fg}
│   └── BTC     : {bright-green-fg}${saldoBTC}{/bright-green-fg}
└── Network     : {bright-cyan-fg}${NETWORK_NAME}{/bright-cyan-fg}`;
      
    walletBox.setContent(content);
    screen.render();
    addLog("Saldo & Wallet Updated.", "system");
  } catch (error) {
    addLog("Failled Update Saldo & Wallet: " + error.message, "error");
  }
}

async function approveToken(tokenAddress, tokenAbi, amount, decimals) {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
    const currentAllowance = await tokenContract.allowance(wallet.address, ROUTER_ADDRESS);
    if (currentAllowance >= amount) {
      return;
    }
    const feeData = await provider.getFeeData();
    const currentGasPrice = feeData.gasPrice; 
    const tx = await tokenContract.approve(ROUTER_ADDRESS, amount, {
      gasLimit: APPROVAL_GAS_LIMIT,
      gasPrice: currentGasPrice
    });
    addLog(`0G: Approval Sent : ${shortHash(tx.hash)}`, "0g");
    await tx.wait();
    addLog("0G: Approval Successfully.", "success");
  } catch (error) {
    addLog("0G: Approval Failed: " + error.message, "error");
    throw error;
  }
}

async function swapAuto(direction, amountIn) {
  try {
    const swapContract = new ethers.Contract(ROUTER_ADDRESS, CONTRACT_ABI, wallet);
    let params;
    const deadline = Math.floor(Date.now() / 1000) + 120;
    if (direction === "usdtToEth") {
      addLog(`0G: Memulai Swap USDT ➯ ETH Demgam amount: ${ethers.formatUnits(amountIn, 18)} USDT`, "0g");
      params = {
        tokenIn: USDT_ADDRESS,
        tokenOut: ETH_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else if (direction === "ethToUsdt") {
      addLog(`0G: Memulai Swap ETH ➯ USDT Dengan amount: ${ethers.formatUnits(amountIn, 18)} ETH`, "0g");
      params = {
        tokenIn: ETH_ADDRESS,
        tokenOut: USDT_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else if (direction === "usdtToBtc") {
      addLog(`0G: Memulai Swap USDT ➯ BTC Dengan amount: ${ethers.formatUnits(amountIn, 18)} USDT`, "0g");
      params = {
        tokenIn: USDT_ADDRESS,
        tokenOut: BTC_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else if (direction === "btcToUsdt") {
      addLog(`0G: Memulai Swap BTC ➯ USDT Dengan amount: ${ethers.formatUnits(amountIn, 18)} BTC`, "0g");
      params = {
        tokenIn: BTC_ADDRESS,
        tokenOut: USDT_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else if (direction === "btcToEth") {
      addLog(`0G: Memulai Swap BTC ➯ ETH Dengan amount: ${ethers.formatUnits(amountIn, 18)} BTC`, "0g");
      params = {
        tokenIn: BTC_ADDRESS,
        tokenOut: ETH_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else if (direction === "ethToBtc") {
      addLog(`0G: Memulai Swap ETH ➯ BTC Dengan amount: ${ethers.formatUnits(amountIn, 18)} ETH`, "0g");
      params = {
        tokenIn: ETH_ADDRESS,
        tokenOut: BTC_ADDRESS,
        fee: 3000,
        recipient: wallet.address,
        deadline,
        amountIn: amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0n,
      };
    } else {
      throw new Error("0GSwap: Direction swap tidak dikenal.");
    }
    const gasPriceToUse = selectedGasPrice || (await provider.getFeeData()).gasPrice;
    const tx = await swapContract.exactInputSingle(params, {
      gasLimit: SWAP_GAS_LIMIT,
      gasPrice: gasPriceToUse
    });
    addLog(`0G: Swap Transaction Sent : ${shortHash(tx.hash)}`, "wait");
    const receipt = await tx.wait();
    addLog(`0G: Swap Transaction Succesffully: ${shortHash(tx.hash)}`, "success");
    const feeAOGI = ethers.formatEther(receipt.gasUsed * selectedGasPrice);
    addLog(`0G: Fee Transaction: ${feeAOGI} AOGI`, "success");
  } catch (error) {
    if (error.message && error.message.toLowerCase().includes("nonce")) {
      nextNonce = await provider.getTransactionCount(wallet.address, "pending");
      addLog(`Nonce direfresh: ${nextNonce}`, "system");
    }
    addLog(`0GSwap: Swap ${direction} gagal: ${error.message}`, "error");
    throw error;
  }
}

async function autoSwapUsdtEth(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) {
        return;
      }
      if (i % 2 === 1) {
        try {
          const randomUsdt = (Math.random() * (300 - 100) + 100).toFixed(2);
          const usdtAmount = ethers.parseUnits(randomUsdt, 18);
          const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);
          const currentUsdtBalance = await usdtContract.balanceOf(wallet.address);
          if (currentUsdtBalance < usdtAmount) {
            addLog(`0G: Saldo USDT (${ethers.formatUnits(currentUsdtBalance, 18)}) tidak cukup untuk swap USDT->ETH`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(USDT_ADDRESS, USDT_ABI, usdtAmount, 18);
              await swapAuto("usdtToEth", usdtAmount);
              await updateWalletData();
            }, `USDT ➯ ETH, ${randomUsdt} USDT`);
          }
        } catch (error) {
          addLog("Swap USDT ➯ ETH error: " + error.message, "error");
        }
      } else {
        try {
          const randomEth = (Math.random() * (0.3 - 0.1) + 0.1).toFixed(6);
          const ethAmount = ethers.parseUnits(randomEth, 18);
          const ethContract = new ethers.Contract(ETH_ADDRESS, ETH_ABI, provider);
          const currentEthBalance = await ethContract.balanceOf(wallet.address);
          if (currentEthBalance < ethAmount) {
            addLog(`0G: Saldo ETH (${ethers.formatUnits(currentEthBalance, 18)}) tidak cukup untuk swap ETH->USDT`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(ETH_ADDRESS, ETH_ABI, ethAmount, 18);
              await swapAuto("ethToUsdt", ethAmount);
              await updateWalletData();
            }, `ETH ➯ USDT, ${randomEth} ETH`);
          }
        } catch (error) {
          addLog("0G: Swap ETH ➯ USDT error: " + error.message, "error");
        }
      }
      addLog(`0G: Swap Ke ${i} selesai.`, "0g");
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * (60 - 30 + 1)) + 30;
        addLog(`0GSwap: Menunggu ${delaySeconds} detik sebelum swap berikutnya...`, "0g");
        await interruptibleDelay(delaySeconds * 1000);
        if (!transactionRunning) {
          addLog("0GSwap: Auto Swap Dihentikan pada saat waktu tunggu", "0g");
          break;
        }
      }
    }
    addLog("0GSwap: Semua swap USDT & ETH selesai.", "0g");
  } catch (error) {
    addLog(`0GSwap: Error: ${error.message}`, "error");
  } finally {
    stopTransaction();
  }
}

async function autoSwapUsdtBtc(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) {
        return;
      }
      if (i % 2 === 1) {
        try {
          const randomUsdt = (Math.random() * (300 - 100) + 100).toFixed(2);
          const usdtAmount = ethers.parseUnits(randomUsdt, 18);
          const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);
          const currentUsdtBalance = await usdtContract.balanceOf(wallet.address);
          if (currentUsdtBalance < usdtAmount) {
            addLog(`0G: Saldo USDT (${ethers.formatUnits(currentUsdtBalance, 18)}) tidak cukup untuk swap USDT->BTC`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(USDT_ADDRESS, USDT_ABI, usdtAmount, 18);
              await swapAuto("usdtToBtc", usdtAmount);
              await updateWalletData();
            }, `USDT ➯ BTC, ${randomUsdt} USDT`);
          }
        } catch (error) {
          addLog("0G: Swap USDT ➯ BTC error: " + error.message, "error");
        }
      } else {
        try {
          const randomBtc = (Math.random() * (0.05 - 0.01) + 0.01).toFixed(6);
          const btcAmount = ethers.parseUnits(randomBtc, 18);
          const btcContract = new ethers.Contract(BTC_ADDRESS, BTC_ABI, provider);
          const currentBtcBalance = await btcContract.balanceOf(wallet.address);
          if (currentBtcBalance < btcAmount) {
            addLog(`0G: Saldo BTC (${ethers.formatUnits(currentBtcBalance, 18)}) tidak cukup untuk swap BTC->USDT`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(BTC_ADDRESS, BTC_ABI, btcAmount, 18);
              await swapAuto("btcToUsdt", btcAmount);
              await updateWalletData();
            }, `BTC ➯ USDT, ${randomBtc} BTC`);
          }
        } catch (error) {
          addLog("0G: Swap BTC ➯ USDT error: " + error.message, "error");
        }
      }
      addLog(`0GSwap: Swap Kr ${i} selesai.`, "success");
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * (60 - 30 + 1)) + 30;
        addLog(`0GSwap: Menunggu ${delaySeconds} detik sebelum swap berikutnya...`, "0g");
        await interruptibleDelay(delaySeconds * 1000);
        if (!transactionRunning) {
          addLog("0GSwap: Auto swap dihentikan saat waktu tunggu.", "0g");
          break;
        }
      }
    }
    addLog("0GSwap: Semua swap USDT & BTC selesai.", "0g");
  } catch (error) {
    addLog(`0GSwap: Error : ${error.message}`, "error");
  } finally {
    stopTransaction();
  }
}

async function autoSwapBtcEth(totalSwaps) {
  try {
    for (let i = 1; i <= totalSwaps; i++) {
      if (!transactionRunning) {
        return;
      }
      if (i % 2 === 1) {
        try {
          const randomBtc = (Math.random() * (0.05 - 0.01) + 0.01).toFixed(6);
          const btcAmount = ethers.parseUnits(randomBtc, 18);
          const btcContract = new ethers.Contract(BTC_ADDRESS, BTC_ABI, provider);
          const currentBtcBalance = await btcContract.balanceOf(wallet.address);
          if (currentBtcBalance < btcAmount) {
            addLog(`0G: Saldo BTC (${ethers.formatUnits(currentBtcBalance, 18)}) tidak cukup untuk swap BTC->ETH`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(BTC_ADDRESS, BTC_ABI, btcAmount, 18);
              await swapAuto("btcToEth", btcAmount);
              await updateWalletData();
            }, `BTC ➯ ETH, ${randomBtc} BTC`);
          }
        } catch (error) {
          addLog("0G: Swap BTC ➯ ETH error: " + error.message, "error");
        }
      } else {
        try {
          const randomEth = (Math.random() * (0.3 - 0.1) + 0.1).toFixed(6);
          const ethAmount = ethers.parseUnits(randomEth, 18);
          const ethContract = new ethers.Contract(ETH_ADDRESS, ETH_ABI, provider);
          const currentEthBalance = await ethContract.balanceOf(wallet.address);
          if (currentEthBalance < ethAmount) {
            addLog(`0G: Saldo ETH (${ethers.formatUnits(currentEthBalance, 18)}) tidak cukup untuk swap ETH->BTC`, "error");
          } else {
            await addTransactionToQueue(async (nonce) => {
              await approveToken(ETH_ADDRESS, ETH_ABI, ethAmount, 18);
              await swapAuto("ethToBtc", ethAmount);
              await updateWalletData();
            }, `ETH ➯ BTC, ${randomEth} ETH`);
          }
        } catch (error) {
          addLog("0G: Swap ETH ➯ BTC error: " + error.message, "error");
        }
      }
      addLog(`0GSwap: Swap Ke${i} selesai.`, "0g");
      if (i < totalSwaps) {
        const delaySeconds = Math.floor(Math.random() * (60 - 30 + 1)) + 30;
        addLog(`0GSwap: Menunggu ${delaySeconds} detik sebelum swap berikutnya...`, "progress");
        await interruptibleDelay(delaySeconds * 1000);
        if (!transactionRunning) {
          addLog("0GSwap: Auto swap dihentikan saat waktu tunggu.", "0g");
          break;
        }
      }
    }
    addLog("0GSwap: Semua swap BTC & ETH selesai.", "success");
  } catch (error) {
    addLog(`0GSwap: Error autoSwapBtcEth: ${error.message}`, "error");
  } finally {
    stopTransaction();
  }
}

function addTransactionToQueue(transactionFunction, description = "Transaksi") {
  const transactionId = ++transactionIdCounter;
  transactionQueueList.push({
    id: transactionId,
    description,
    timestamp: new Date().toLocaleTimeString(),
    status: "queued"
  });
  addLog(`Transaksi [${transactionId}] ditambahkan ke antrean: ${description}`, "system");
  updateQueueDisplay();
  transactionQueue = transactionQueue.then(async () => {
    updateTransactionStatus(transactionId, "processing");
    addLog(`Transaksi [${transactionId}] mulai diproses.`, "system");
    try {
      if (nextNonce === null) {
        nextNonce = await provider.getTransactionCount(wallet.address, "pending");
      }
      const result = await transactionFunction(nextNonce);
      nextNonce++;
      updateTransactionStatus(transactionId, "completed");
      addLog(`Transaksi [${transactionId}] selesai.`, "system");
      return result;
    } catch (error) {
      if (error.message && error.message.toLowerCase().includes("nonce")) {
        nextNonce = await provider.getTransactionCount(wallet.address, "pending");
        addLog(`Nonce direfresh: ${nextNonce}`, "system");
      }
      updateTransactionStatus(transactionId, "error");
      addLog(`Transaksi [${transactionId}] gagal: ${error.message}`, "system");
    } finally {
      removeTransactionFromQueue(transactionId);
      updateQueueDisplay();
    }
  });
  return transactionQueue;
}
function updateTransactionStatus(id, status) {
  transactionQueueList.forEach(tx => {
    if (tx.id === id) tx.status = status;
  });
  updateQueueDisplay();
}
function removeTransactionFromQueue(id) {
  transactionQueueList = transactionQueueList.filter(tx => tx.id !== id);
  updateQueueDisplay();
}
function getTransactionQueueContent() {
  if (transactionQueueList.length === 0) return "Tidak ada transaksi dalam antrean.";
  return transactionQueueList.map(tx => `ID: ${tx.id} | ${tx.description} | ${tx.status} | ${tx.timestamp}`).join("\n");
}
function updateQueueDisplay() {
  if (queueMenu.visible) {
    queueMenu.setContent(getTransactionQueueContent());
    screen.render();
  }
}
function showTransactionQueueMenu() {
  queueMenu.setContent(getTransactionQueueContent());
  queueMenu.show();
  queueMenu.focus();
  screen.render();
  queueMenu.key(["escape", "q", "C-c"], () => {
    queueMenu.hide();
    mainMenu.show();
    mainMenu.focus();
    screen.render();
  });
}

function stopTransaction() {
  transactionRunning = false;
  chosenSwap = null;
  updateMainMenuItems();
  update0gSwapSubMenuItems();
  screen.render();
}
function stopAllTransactions() {
  if (transactionRunning) {
    stopTransaction();
    addLog("Stop All Transactions command received. Semua transaksi telah dihentikan.", "system");
  } else {
    addLog("Tidak ada transaksi yang berjalan.", "system");
  }
}

function startTransactionProcess(pair, totalSwaps) {
  chooseGasFee().then(gasPrice => {
    selectedGasPrice = gasPrice;
    addLog(`Gas fee yang dipilih: ${ethers.formatUnits(selectedGasPrice, "gwei")} Gwei`, "system");
    transactionRunning = true;
    chosenSwap = pair;
    updateMainMenuItems();
    update0gSwapSubMenuItems();
    addLog(`Memulai ${pair} sebanyak ${totalSwaps} kali...`, "progress");
    if (pair === "USDT & ETH") {
      autoSwapUsdtEth(totalSwaps);
    } else if (pair === "USDT & BTC") {
      autoSwapUsdtBtc(totalSwaps);
    } else if (pair === "BTC & ETH") {
      autoSwapBtcEth(totalSwaps);
    } else {
      addLog(`Logika swap untuk pasangan ${pair} belum diimplementasikan.`, "error");
      stopTransaction();
    }
  }).catch(err => {
    addLog("Pemilihan gas fee dibatalkan: " + err, "system");
  });
}

async function chooseGasFee() {
  return new Promise((resolve, reject) => {
    const container = blessed.box({
      label: ' Pilih Gas Fee ',
      top: 'center',
      left: 'center',
      width: '50%',
      height: 8,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
    });

    const gasFeeList = blessed.list({
      top: 0,
      left: 0,
      width: '100%',
      height: 5,
      items: ['Gas Normal', 'Gas Rendah', 'Gas Fee x2'],
      keys: true,
      mouse: true,
      style: { selected: { bg: 'blue', fg: 'white' } },
      tags: true,
    });
    container.append(gasFeeList);

    const cancelButton = blessed.button({
      content: 'Cancel',
      bottom: 0,
      left: 'center',
      shrink: true,
      padding: { left: 1, right: 1 },
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'red',
        border: { fg: 'white' },
        hover: { bg: 'blue' }
      },
      mouse: true,
      keys: true,
      tags: true,
    });
    cancelButton.on('press', () => {
      container.destroy();
      autoSwapSubMenu.focus();
      screen.render();
    });
    container.append(cancelButton);

    screen.append(container);
    gasFeeList.focus();
    screen.render();

    gasFeeList.on('select', (item, index) => {
      container.destroy();
      provider.getFeeData().then((feeData) => {
        const gasPriceBN = feeData.gasPrice;
        if (index === 0) {
          resolve(gasPriceBN);
        } else if (index === 1) {
          resolve(gasPriceBN * 80n / 100n);
        } else if (index === 2) {
          resolve(gasPriceBN * 2n); 
        }
        autoSwapSubMenu.focus();
        screen.render();
        resolve(selected);

      }).catch(reject);
    });
  });
}

mainMenu.on("select", (item) => {
  const selected = item.getText();
  if (selected === "Jaine Swap") {
    mainMenu.hide();
    autoSwapSubMenu.show();
    autoSwapSubMenu.focus();
    screen.render();
  } else if (selected === "Antrian Transaksi") {
    showTransactionQueueMenu();
  } else if (selected === "Stop All Transactions") {
    stopAllTransactions();
  } else if (selected === "Clear Transaction Logs") {
    logsBox.setContent("");
    clearTransactionLogs();
  } else if (selected === "Refresh") {
    updateWalletData();
  } else if (selected === "Exit") {
    process.exit(0);
  }
});
autoSwapSubMenu.on("select", (item) => {
  const selected = item.getText();
  if (transactionRunning && !["Stop Transaction", "Clear Transaction Logs", "Back To Main Menu", "Exit"].includes(selected)) {
    addLog("Sedang Ada Transaksi Yang Berjalan . Stop transaction terlebih dahulu.", "system");
    return;
  }
  if (selected.startsWith("Auto Swap USDT & ETH")) {
    promptBox.setLabel("{bright-blue-fg}Jumlah Swap (USDT & ETH){/bright-blue-fg}");
    promptBox.setFront();
    promptBox.readInput("Masukkan jumlah swap:", "", async (err, value) => {
      promptBox.hide();
      screen.render();
      if (err || !value) {
        addLog("Input jumlah swap dibatalkan.", "system");
        return;
      }
      const totalSwaps = parseInt(value);
      if (isNaN(totalSwaps) || totalSwaps <= 0) {
        addLog("Jumlah swap tidak valid. Masukkan angka > 0.", "error");
        return;
      }
      startTransactionProcess("USDT & ETH", totalSwaps);
    });
  } else if (selected.startsWith("Auto Swap USDT & BTC")) {
    promptBox.setLabel("{bright-blue-fg}Jumlah Swap (USDT & BTC){/bright-blue-fg}");
    promptBox.setFront();
    promptBox.readInput("Masukkan jumlah swap:", "", async (err, value) => {
      promptBox.hide();
      screen.render();
      if (err || !value) {
        addLog("Input jumlah swap dibatalkan.", "system");
        return;
      }
      const totalSwaps = parseInt(value);
      if (isNaN(totalSwaps) || totalSwaps <= 0) {
        addLog("Jumlah swap tidak valid. Masukkan angka > 0.", "error");
        return;
      }
      startTransactionProcess("USDT & BTC", totalSwaps);
    });
  } else if (selected.startsWith("Auto Swap BTC & ETH")) {
    promptBox.setLabel("{bright-blue-fg}Jumlah Swap (BTC & ETH){/bright-blue-fg}");
    promptBox.setFront();
    promptBox.readInput("Masukkan jumlah swap:", "", async (err, value) => {
      promptBox.hide();
      screen.render();
      if (err || !value) {
        addLog("Input jumlah swap dibatalkan.", "system");
        return;
      }
      const totalSwaps = parseInt(value);
      if (isNaN(totalSwaps) || totalSwaps <= 0) {
        addLog("Jumlah swap tidak valid. Masukkan angka > 0.", "error");
        return;
      }
      startTransactionProcess("BTC & ETH", totalSwaps);
    });
  } else if (selected === "Stop Transaction") {
    stopTransaction();
  } else if (selected === "Clear Transaction Logs") {
    logsBox.setContent("");
    clearTransactionLogs();
  } else if (selected === "Back To Main Menu") {
    autoSwapSubMenu.hide();
    mainMenu.show();
    mainMenu.focus();
    screen.render();
  } else if (selected === "Exit") {
    process.exit(0);
  }
});

screen.append(headerBox);
screen.append(descriptionBox);
screen.append(logsBox);
screen.append(gasPriceBox);
screen.append(walletBox);
screen.append(mainMenu);
screen.append(autoSwapSubMenu);
screen.append(queueMenu);

function adjustLayout() {
  const screenWidth = screen.width;
  const screenHeight = screen.height;
  const headerHeight = Math.max(8, Math.floor(screenHeight * 0.15));
  headerBox.top = 0;
  headerBox.width = "100%";
  headerBox.height = headerHeight;
  descriptionBox.top = "25%";
  descriptionBox.height = Math.floor(screenHeight * 0.05);
  logsBox.top = headerHeight + descriptionBox.height;
  logsBox.left = 0;
  logsBox.width = Math.floor(screenWidth * 0.6);
  logsBox.height = Math.floor(screenHeight * 0.5); 
  gasPriceBox.top = logsBox.top + logsBox.height;
  gasPriceBox.left = logsBox.left;
  gasPriceBox.width = logsBox.width;
  gasPriceBox.height = Math.floor(screenHeight * 0.22);
  walletBox.top = headerHeight + descriptionBox.height;
  walletBox.left = Math.floor(screenWidth * 0.6);
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);
  mainMenu.top = walletBox.top + walletBox.height;
  mainMenu.left = Math.floor(screenWidth * 0.6);
  mainMenu.width = Math.floor(screenWidth * 0.4);
  mainMenu.height = screenHeight - (headerHeight + descriptionBox.height + walletBox.height);
  autoSwapSubMenu.top = mainMenu.top;
  autoSwapSubMenu.left = mainMenu.left;
  autoSwapSubMenu.width = mainMenu.width;
  autoSwapSubMenu.height = mainMenu.height;

  screen.render();
}
screen.on("resize", () => {
  adjustLayout();
  screen.render();
});
adjustLayout();

screen.key(["escape", "q", "C-c"], () => process.exit(0));

mainMenu.focus();
updateWalletData();
updateMainMenuItems();
update0gSwapSubMenuItems();
screen.render();