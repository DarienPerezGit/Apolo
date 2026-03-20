pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/RebytEscrow.sol";

contract DeployRebytEscrow is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address relayerAddress = vm.envAddress("SOLVER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        new RebytEscrow(relayerAddress);
        vm.stopBroadcast();
    }
}
