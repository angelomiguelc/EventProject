const Events = artifacts.require("Events");
const Membership = artifacts.require("Membership");

const { toBN, toWei } = web3.utils;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number(value.toString());
};

const expectRevert = async (promise, message) => {
  try {
    await promise;
    assert.fail("Expected revert not received");
  } catch (err) {
    const hasRevert = err.message.includes("revert");
    assert(hasRevert, `Expected revert, got: ${err.message}`);
    if (message) {
      assert(
        err.message.includes(message),
        `Expected revert message "${message}", got: ${err.message}`
      );
    }
  }
};

const createSampleEvent = async (events, from, overrides = {}) => {
  const data = {
    name: "Test Event",
    date: "2026-02-01",
    location: "Test City",
    price: toWei("1", "ether"),
    ticketsAvailable: 2,
    about: "Sample event",
    ...overrides,
  };
  await events.createEvent(
    data.name,
    data.date,
    data.location,
    data.price,
    data.ticketsAvailable,
    data.about,
    { from }
  );
  const ids = await events.getEventIds();
  return ids[ids.length - 1].toNumber();
};

contract("Events", (accounts) => {
  const owner = accounts[0];
  const buyer = accounts[1];
  const other = accounts[2];
  const payout = accounts[accounts.length - 1];

  let events;

  beforeEach(async () => {
    events = await Events.new(payout, { from: owner });
  });

  it("deploys with payout wallet and owner", async () => {
    const payoutWallet = await events.payoutWallet();
    const contractOwner = await events.owner();
    assert.equal(payoutWallet, payout);
    assert.equal(contractOwner, owner);
  });

  it("rejects zero payout wallet", async () => {
    await expectRevert(Events.new(ZERO_ADDRESS, { from: owner }), "Invalid payout wallet");
  });

  it("creates and retrieves events", async () => {
    const eventId = await createSampleEvent(events, owner, {
      name: "Launch",
      location: "Austin",
    });
    const info = await events.getEvent(eventId);
    assert.equal(toNumber(info.id), eventId);
    assert.equal(info.name, "Launch");
    assert.equal(info.location, "Austin");
  });

  it("tracks event count and ids", async () => {
    await createSampleEvent(events, owner);
    await createSampleEvent(events, owner);
    const count = await events.getEventCount();
    const ids = await events.getEventIds();
    assert.equal(count.toNumber(), 2);
    assert.equal(ids.length, 2);
    assert.equal(ids[0].toNumber(), 1);
    assert.equal(ids[1].toNumber(), 2);
  });

  it("reverts ticket price lookup for missing event", async () => {
    await expectRevert(events.getTicketPrice(999, buyer));
  });

  it("buys ticket at base price and updates ownership", async () => {
    const eventId = await createSampleEvent(events, owner, { ticketsAvailable: 1 });
    const price = await events.getTicketPrice(eventId, buyer);

    const payoutBefore = toBN(await web3.eth.getBalance(payout));
    await events.buyTicket(eventId, { from: buyer, value: price });
    const payoutAfter = toBN(await web3.eth.getBalance(payout));

    const hasTicket = await events.hasTicket(eventId, buyer);
    const updated = await events.getEvent(eventId);

    assert.equal(hasTicket, true);
    assert.equal(toNumber(updated.ticketsAvailable), 0);
    if (!sameAddress(payout, buyer)) {
      assert.equal(payoutAfter.sub(payoutBefore).toString(), price.toString());
    }
  });

  it("reverts purchase with incorrect price", async () => {
    const eventId = await createSampleEvent(events, owner);
    const price = await events.getTicketPrice(eventId, buyer);
    await expectRevert(
      events.buyTicket(eventId, { from: buyer, value: toBN(price).subn(1) }),
      "Incorrect price"
    );
  });

  it("reverts when sold out", async () => {
    const eventId = await createSampleEvent(events, owner, { ticketsAvailable: 1 });
    const price = await events.getTicketPrice(eventId, buyer);
    await events.buyTicket(eventId, { from: buyer, value: price });
    const otherPrice = await events.getTicketPrice(eventId, other);
    await expectRevert(
      events.buyTicket(eventId, { from: other, value: otherPrice }),
      "Sold out"
    );
  });

  it("reverts when buyer already owns a ticket", async () => {
    const eventId = await createSampleEvent(events, owner, { ticketsAvailable: 2 });
    const price = await events.getTicketPrice(eventId, buyer);
    await events.buyTicket(eventId, { from: buyer, value: price });
    await expectRevert(
      events.buyTicket(eventId, { from: buyer, value: price }),
      "Already owned"
    );
  });

  it("transfers tickets between accounts", async () => {
    const eventId = await createSampleEvent(events, owner);
    const price = await events.getTicketPrice(eventId, buyer);
    await events.buyTicket(eventId, { from: buyer, value: price });

    await events.transferTicket(eventId, other, { from: buyer });
    const buyerHas = await events.hasTicket(eventId, buyer);
    const otherHas = await events.hasTicket(eventId, other);

    assert.equal(buyerHas, false);
    assert.equal(otherHas, true);
  });

  it("reverts invalid transfers", async () => {
    const eventId = await createSampleEvent(events, owner);
    const price = await events.getTicketPrice(eventId, buyer);
    await events.buyTicket(eventId, { from: buyer, value: price });

    await expectRevert(
      events.transferTicket(eventId, buyer, { from: buyer }),
      "Cannot transfer to self"
    );
    await expectRevert(
      events.transferTicket(eventId, ZERO_ADDRESS, { from: buyer }),
      "Invalid recipient"
    );
    await expectRevert(
      events.transferTicket(eventId, owner, { from: other }),
      "Not owner"
    );
  });

  it("only owner can set membership contract", async () => {
    const membership = await Membership.new(payout, { from: owner });
    await expectRevert(
      events.setMembershipContract(membership.address, { from: other }),
      "Not owner"
    );
    await expectRevert(
      events.setMembershipContract(ZERO_ADDRESS, { from: owner }),
      "Invalid membership address"
    );

    await events.setMembershipContract(membership.address, { from: owner });
    const stored = await events.membershipContract();
    assert.equal(stored, membership.address);
  });

  it("applies membership discounts", async () => {
    const membership = await Membership.new(payout, { from: owner });
    await events.setMembershipContract(membership.address, { from: owner });

    const bronze = await membership.TIER_BRONZE();
    const bronzePrice = await membership.priceForTier(bronze);
    await membership.buyMembership(bronze, { from: buyer, value: bronzePrice });

    const eventId = await createSampleEvent(events, owner, {
      price: toWei("1", "ether"),
    });
    const basePrice = toBN(toWei("1", "ether"));
    const expected = basePrice.muln(9000).divn(10000);
    const discounted = await events.getTicketPrice(eventId, buyer);

    assert.equal(discounted.toString(), expected.toString());
  });
});

contract("Membership", (accounts) => {
  const buyer = accounts[1];
  const payout = accounts[accounts.length - 1];

  let membership;

  beforeEach(async () => {
    membership = await Membership.new(payout);
  });

  it("deploys with payout wallet", async () => {
    const payoutWallet = await membership.payoutWallet();
    assert.equal(payoutWallet, payout);
  });

  it("rejects zero payout wallet", async () => {
    await expectRevert(Membership.new(ZERO_ADDRESS), "Invalid payout wallet");
  });

  it("returns prices for tiers", async () => {
    const bronze = await membership.TIER_BRONZE();
    const silver = await membership.TIER_SILVER();
    const gold = await membership.TIER_GOLD();

    const bronzePrice = await membership.priceForTier(bronze);
    const silverPrice = await membership.priceForTier(silver);
    const goldPrice = await membership.priceForTier(gold);

    assert.equal(bronzePrice.toString(), toWei("0.1", "ether"));
    assert.equal(silverPrice.toString(), toWei("0.25", "ether"));
    assert.equal(goldPrice.toString(), toWei("0.5", "ether"));
  });

  it("reverts invalid tiers", async () => {
    await expectRevert(membership.priceForTier(0));
    await expectRevert(membership.priceForTier(4));
  });

  it("buys membership and updates tier", async () => {
    const bronze = await membership.TIER_BRONZE();
    const price = await membership.priceForTier(bronze);

    const payoutBefore = toBN(await web3.eth.getBalance(payout));
    await membership.buyMembership(bronze, { from: buyer, value: price });
    const payoutAfter = toBN(await web3.eth.getBalance(payout));

    const tier = await membership.getTier(buyer);
    assert.equal(tier.toString(), bronze.toString());
    if (!sameAddress(payout, buyer)) {
      assert.equal(payoutAfter.sub(payoutBefore).toString(), price.toString());
    }
  });

  it("prevents downgrades and requires correct price", async () => {
    const bronze = await membership.TIER_BRONZE();
    const silver = await membership.TIER_SILVER();
    const bronzePrice = await membership.priceForTier(bronze);
    const silverPrice = await membership.priceForTier(silver);

    await membership.buyMembership(bronze, { from: buyer, value: bronzePrice });
    await expectRevert(
      membership.buyMembership(bronze, { from: buyer, value: bronzePrice }),
      "Cannot downgrade"
    );
    await expectRevert(
      membership.buyMembership(silver, { from: buyer, value: bronzePrice }),
      "Incorrect price"
    );

    await membership.buyMembership(silver, { from: buyer, value: silverPrice });
    const tier = await membership.getTier(buyer);
    assert.equal(tier.toString(), silver.toString());
  });
});
