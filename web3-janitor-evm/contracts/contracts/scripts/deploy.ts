import { ethers } from "hardhat";

async function main() {
  // CONFIG FOR BASE MAINNET
  // Uniswap V3 Router on Base
  const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; 
  // WETH on Base
  const WETH = "0x4200000000000000000000000000000000000006";

  console.log("Deploying JanitorSweeper...");

  const Janitor = await ethers.getContractFactory("JanitorSweeper");
  const janitor = await Janitor.deploy(ROUTER, WETH);

  await janitor.waitForDeployment();

  console.log(`Janitor deployed to: ${janitor.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});