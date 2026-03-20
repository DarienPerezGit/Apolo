pragma solidity ^0.8.20;

contract RebytEscrow {
    enum IntentState {
        PENDING,
        FUNDED,
        VALIDATING,
        RELEASED,
        REFUNDED
    }

    struct IntentData {
        address recipient;
        uint256 amount;
        IntentState state;
        uint256 fundedAt;
        uint256 settledAt;
    }

    address public immutable relayer;
    mapping(bytes32 => IntentData) private intents;

    event Funded(bytes32 indexed intentHash, uint256 amount, uint256 timestamp);
    event Released(bytes32 indexed intentHash, address indexed recipient, uint256 amount);
    event Refunded(bytes32 indexed intentHash, uint256 amount);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only relayer");
        _;
    }

    constructor(address relayerAddress) {
        require(relayerAddress != address(0), "Invalid relayer");
        relayer = relayerAddress;
    }

    function fund(bytes32 intentHash, uint256 amount) external payable {
        require(intentHash != bytes32(0), "Invalid intentHash");
        require(amount > 0, "Invalid amount");
        require(msg.value == amount, "Invalid value");

        IntentData storage intent = intents[intentHash];
        require(intent.state == IntentState.PENDING, "Already funded");

        intent.recipient = msg.sender;
        intent.amount = amount;
        intent.state = IntentState.FUNDED;
        intent.fundedAt = block.timestamp;

        emit Funded(intentHash, amount, block.timestamp);
    }

    function markValidating(bytes32 intentHash) external onlyRelayer {
        IntentData storage intent = intents[intentHash];
        require(intent.state == IntentState.FUNDED, "Not funded");
        intent.state = IntentState.VALIDATING;
    }

    function release(bytes32 intentHash) external onlyRelayer {
        IntentData storage intent = intents[intentHash];
        require(
            intent.state == IntentState.FUNDED || intent.state == IntentState.VALIDATING,
            "Not releasable"
        );

        intent.state = IntentState.RELEASED;
        intent.settledAt = block.timestamp;

        (bool success, ) = payable(intent.recipient).call{value: intent.amount}("");
        require(success, "Transfer failed");

        emit Released(intentHash, intent.recipient, intent.amount);
    }

    function refund(bytes32 intentHash) external onlyRelayer {
        IntentData storage intent = intents[intentHash];
        require(
            intent.state == IntentState.FUNDED || intent.state == IntentState.VALIDATING,
            "Not refundable"
        );

        intent.state = IntentState.REFUNDED;
        intent.settledAt = block.timestamp;

        (bool success, ) = payable(msg.sender).call{value: intent.amount}("");
        require(success, "Refund failed");

        emit Refunded(intentHash, intent.amount);
    }

    function getIntent(bytes32 intentHash) external view returns (IntentData memory) {
        return intents[intentHash];
    }
}
