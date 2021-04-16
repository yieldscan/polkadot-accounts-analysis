const { ApiPromise, WsProvider } = require("@polkadot/api");
const axios = require("axios");
const Ora = require("ora");
const commaNumber = require("comma-number");
const { isNil } = require("lodash");

let DOT_DECIMAL_PLACES = 10000000000;
let fiat = 0;
let network = "polkadot"; // default to polkadot network (can be changed to kusama using command line arg)
let networkName = "Polkadot";
let networkDenom = "DOT";

(async () => {
	args = process.argv;
	let provider = null;
	if (args.length > 2 && args[2] === "kusama") {
		// if there is a command line arg for kusama, use kusama network
		console.log("Generating real time staking activity analysis for Kusama");
		network = "kusama";
		networkName = "Kusama";
		networkDenom = "KSM";
		const res = await axios(
			`https://api.coingecko.com/api/v3/simple/price?ids=${network}&vs_currencies=usd`
		);
		fiat = res.data.kusama.usd;
		provider = new WsProvider("wss://kusama-rpc.polkadot.io");
		DOT_DECIMAL_PLACES *= 100;
	} else {
		// default to polkadot
		console.log("Generating real time staking activity analysis for Polkadot");
		const res = await axios(
			`https://api.coingecko.com/api/v3/simple/price?ids=${network}&vs_currencies=usd`
		);
		fiat = res.data.polkadot.usd;
		provider = new WsProvider("wss://rpc.polkadot.io");
	}

	console.log(`\nNetwork Name: ${networkName}`);
	console.log(
		`1 ${networkDenom} current price: ${commaNumber(fiat.toFixed(2))} USD`
	);
	console.log(
		`$1k in ${networkDenom}: ${commaNumber(
			((1 / fiat) * 1000).toFixed(2)
		)} ${networkDenom}`
	);
	console.log(
		`$10k in ${networkDenom}: ${commaNumber(
			((1 / fiat) * 10000).toFixed(2)
		)} ${networkDenom}`
	);
	const api = await ApiPromise.create({ provider });

	// controller stash map tests

	// const testAccount1 = "15j4dg5GzsL1bw2U2AWgeyAk6QTxq43V7ZPbXdAmbVLjvDCK";
	// const testAccount2 = "11DYEa2iQ1jBLBcjqs9pZ4m8GWTwGbpVffJfh9A8Cq2Wf9e";
	// const ledgerInfo = (await api.query.staking.ledger(testAccount1)).toJSON();
	// console.log(isNil(ledgerInfo));
	// console.log(ledgerInfo);
	// console.log(ledgerInfo.stash.toString());
	// console.log(parseInt(ledgerInfo.active));
	// console.log(parseInt(ledgerInfo.total));
	// console.log(typeof ledgerInfo);
	// console.log(ledgerInfo === undefined);
	// console.log(Object.keys(ledgerInfo).length);
	// console.log(Object.keys(ledgerInfo));
	// console.log(JSON.stringify(Object.values(ledgerInfo)[0]));
	// console.log(JSON.stringify(Object.values(ledgerInfo)[1]));

	// Validator tests

	const validators = await fetchValidators(api);
	console.log(validators);

	console.log(typeof validators[0]);

	process.exit();
})();

const fetchValidators = async (api) => {
	const validators = await api.query.staking.validators.keys();
	return getAccountId(validators);
};

const getAccountId = (account) =>
	account
		.map((e) => e.args)
		.map(([e]) => e)
		.map((e) => e.toHuman());
