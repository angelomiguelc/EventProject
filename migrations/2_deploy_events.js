const Events = artifacts.require("Events");
const { ADMIN_WALLET } = require("../config/adminWallet");

module.exports = function (deployer) {
  deployer.deploy(Events, ADMIN_WALLET);
};
