const Membership = artifacts.require("Membership");
const Events = artifacts.require("Events");
const { ADMIN_WALLET } = require("../config/adminWallet");

module.exports = async function (deployer) {
  await deployer.deploy(Membership, ADMIN_WALLET);
  const membership = await Membership.deployed();
  const events = await Events.deployed();
  await events.setMembershipContract(membership.address);
};
