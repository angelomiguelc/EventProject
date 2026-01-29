// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Membership {
    uint8 public constant TIER_NONE = 0;
    uint8 public constant TIER_BRONZE = 1;
    uint8 public constant TIER_SILVER = 2;
    uint8 public constant TIER_GOLD = 3;

    uint256 public constant BRONZE_PRICE = 0.1 ether;
    uint256 public constant SILVER_PRICE = 0.25 ether;
    uint256 public constant GOLD_PRICE = 0.5 ether;

    address payable public immutable payoutWallet;
    mapping(address => uint8) private memberTier;

    event MembershipPurchased(address indexed buyer, uint8 tier, uint256 price);

    constructor(address payable payout) {
        require(payout != address(0), "Invalid payout wallet");
        payoutWallet = payout;
    }

    function getTier(address account) external view returns (uint8) {
        return memberTier[account];
    }

    function priceForTier(uint8 tier) public pure returns (uint256) {
        if (tier == TIER_BRONZE) {
            return BRONZE_PRICE;
        }
        if (tier == TIER_SILVER) {
            return SILVER_PRICE;
        }
        if (tier == TIER_GOLD) {
            return GOLD_PRICE;
        }
        revert("Invalid tier");
    }

    function buyMembership(uint8 tier) external payable {
        require(tier >= TIER_BRONZE && tier <= TIER_GOLD, "Invalid tier");
        uint8 currentTier = memberTier[msg.sender];
        require(tier > currentTier, "Cannot downgrade");
        uint256 price = priceForTier(tier);
        require(msg.value == price, "Incorrect price");

        memberTier[msg.sender] = tier;
        (bool sent, ) = payoutWallet.call{value: msg.value}("");
        require(sent, "Transfer failed");

        emit MembershipPurchased(msg.sender, tier, msg.value);
    }
}
