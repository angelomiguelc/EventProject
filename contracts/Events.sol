// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IMembership {
    function getTier(address account) external view returns (uint8);
}

contract Events {
    address payable public immutable payoutWallet;
    address public owner;
    IMembership public membershipContract;
    uint8 public constant TIER_BRONZE = 1;
    uint8 public constant TIER_SILVER = 2;
    uint8 public constant TIER_GOLD = 3;
    uint16 public constant BPS_DENOMINATOR = 10000;
    uint16 public constant BRONZE_DISCOUNT_BPS = 1000;
    uint16 public constant SILVER_DISCOUNT_BPS = 1500;
    uint16 public constant GOLD_DISCOUNT_BPS = 2500;

    struct EventInfo {
        uint256 id;
        string name;
        string date;
        string location;
        uint256 price;
        uint256 ticketsAvailable;
        string about;
    }

    uint256 public nextEventId = 1;
    mapping(uint256 => EventInfo) private eventsById;
    uint256[] private eventIds;
    mapping(uint256 => mapping(address => bool)) private ticketOwners;

    event EventCreated(
        uint256 indexed id,
        string name,
        string date,
        string location,
        uint256 price,
        uint256 ticketsAvailable,
        string about
    );

    event TicketPurchased(uint256 indexed id, address indexed buyer);
    event TicketTransferred(uint256 indexed id, address indexed from, address indexed to);
    event MembershipContractUpdated(address indexed membership);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address payable payout) {
        require(payout != address(0), "Invalid payout wallet");
        payoutWallet = payout;
        owner = msg.sender;
    }

    function setMembershipContract(address membership) external onlyOwner {
        require(membership != address(0), "Invalid membership address");
        membershipContract = IMembership(membership);
        emit MembershipContractUpdated(membership);
    }

    function createEvent(
        string calldata name,
        string calldata date,
        string calldata location,
        uint256 price,
        uint256 ticketsAvailable,
        string calldata about
    ) external {
        uint256 eventId = nextEventId;
        nextEventId += 1;

        EventInfo memory info = EventInfo({
            id: eventId,
            name: name,
            date: date,
            location: location,
            price: price,
            ticketsAvailable: ticketsAvailable,
            about: about
        });

        eventsById[eventId] = info;
        eventIds.push(eventId);

        emit EventCreated(eventId, name, date, location, price, ticketsAvailable, about);
    }

    function getEvent(uint256 eventId) external view returns (EventInfo memory) {
        return eventsById[eventId];
    }

    function getEventCount() external view returns (uint256) {
        return eventIds.length;
    }

    function getEventIds() external view returns (uint256[] memory) {
        return eventIds;
    }

    function getTicketPrice(uint256 eventId, address buyer) public view returns (uint256) {
        EventInfo storage info = eventsById[eventId];
        require(info.id != 0, "Event not found");
        uint256 basePrice = info.price;
        if (address(membershipContract) == address(0) || buyer == address(0)) {
            return basePrice;
        }
        uint8 tier = membershipContract.getTier(buyer);
        uint16 discountBps = _discountBpsForTier(tier);
        if (discountBps == 0) {
            return basePrice;
        }
        return (basePrice * (BPS_DENOMINATOR - discountBps)) / BPS_DENOMINATOR;
    }

    function buyTicket(uint256 eventId) external payable {
        EventInfo storage info = eventsById[eventId];
        require(info.id != 0, "Event not found");
        require(info.ticketsAvailable > 0, "Sold out");
        require(!ticketOwners[eventId][msg.sender], "Already owned");
        uint256 expectedPrice = getTicketPrice(eventId, msg.sender);
        require(msg.value == expectedPrice, "Incorrect price");

        ticketOwners[eventId][msg.sender] = true;
        info.ticketsAvailable -= 1;
        (bool sent, ) = payoutWallet.call{value: msg.value}("");
        require(sent, "Transfer failed");
        emit TicketPurchased(eventId, msg.sender);
    }

    function hasTicket(uint256 eventId, address buyer) external view returns (bool) {
        return ticketOwners[eventId][buyer];
    }

    function transferTicket(uint256 eventId, address to) external {
        require(to != address(0), "Invalid recipient");
        require(to != msg.sender, "Cannot transfer to self");
        require(ticketOwners[eventId][msg.sender], "Not owner");
        ticketOwners[eventId][msg.sender] = false;
        ticketOwners[eventId][to] = true;
        emit TicketTransferred(eventId, msg.sender, to);
    }

    function _discountBpsForTier(uint8 tier) internal pure returns (uint16) {
        if (tier == TIER_BRONZE) {
            return BRONZE_DISCOUNT_BPS;
        }
        if (tier == TIER_SILVER) {
            return SILVER_DISCOUNT_BPS;
        }
        if (tier == TIER_GOLD) {
            return GOLD_DISCOUNT_BPS;
        }
        return 0;
    }
}
