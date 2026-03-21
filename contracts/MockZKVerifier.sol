// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IZKVerifier.sol";

/// @title MockZKVerifier
/// @notice Always returns true. Used as a demo fallback when the real Groth16
///         verifier is not yet deployed or when running with zkEnabled=true
///         but no production artifacts.
/// @dev NEVER deploy this as the production verifier.
///      Swap for the snarkjs-generated ZKVerifier.sol before mainnet.
contract MockZKVerifier is IZKVerifier {
    function verifyProof(
        uint256[2]    calldata, /* a  */
        uint256[2][2] calldata, /* b  */
        uint256[2]    calldata, /* c  */
        uint256[1]    calldata  /* input */
    ) external pure override returns (bool) {
        // Mock: always valid. In production, replace with real Groth16 check.
        return true;
    }
}
