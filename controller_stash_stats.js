const { ApiPromise, WsProvider } = require("@polkadot/api");
const { isHex } = require("@polkadot/util");
const fs = require("fs");
const axios = require("axios");
const Ora = require("ora");
const { isNil } = require("lodash");
const commaNumber = require("comma-number");
const json2xls = require("json2xls");

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

	const spinnerAccounts = new Ora({
		text: "Fetching Accounts",
	});

	spinnerAccounts.start();

	const accountIds = getAccountId(await api.query.system.account.keys());
	// get all account identity info

	spinnerAccounts.succeed();

	console.log("====================");
	console.log(`Total Accounts: ${commaNumber(accountIds.length)}`);

	// console.log(accountIds.length);
	console.log("\n=========================");

	const chunkedAccounts = chunkArray(accountIds, 10000);
	const accountsInfo = [];

	const spinnerValidators = new Ora({
		text: "Fetching Validators",
	});

	spinnerValidators.start();

	const validators = await fetchValidators(api);

	spinnerValidators.succeed();

	console.log("\n=========================");

	const spinnerControllerStashInfo = new Ora({
		text: "Fetching Controller Stash Info",
	});

	spinnerControllerStashInfo.start();

	const controllerStashArr = await fetchControllerStashInfo(
		api,
		chunkedAccounts
	);

	spinnerControllerStashInfo.succeed();

	console.log("\n=========================");

	console.log(
		"Total staking accounts(this includes validators account too):",
		controllerStashArr.length
	);

	const controllerStashArrWithoutValidators = controllerStashArr.filter(
		(x) => !validators.includes(x.stash)
	);

	const xlsControllerStashArrWithoutValidators = json2xls(
		controllerStashArrWithoutValidators
	);
	fs.writeFileSync(
		network + "controllerStashArrWithoutValidators.xlsx",
		xlsControllerStashArrWithoutValidators,
		"binary"
	);

	console.log(
		"Total staking accounts(excluding validators):",
		controllerStashArrWithoutValidators.length
	);

	const diffControllerStash = controllerStashArrWithoutValidators.filter(
		(x) => x.stash !== x.controller
	);

	const xlsDiffControllerStash = json2xls(diffControllerStash);
	fs.writeFileSync(
		network + "diffControllerStash.xlsx",
		xlsDiffControllerStash,
		"binary"
	);

	console.log(
		"different controller stash accounts:",
		diffControllerStash.length
	);

	const sameControllerStash = controllerStashArrWithoutValidators.filter(
		(x) => x.stash === x.controller
	);

	const xlsSameControllerStash = json2xls(sameControllerStash);
	fs.writeFileSync(
		network + "sameControllerStash.xlsx",
		xlsSameControllerStash,
		"binary"
	);

	console.log("same controller stash accounts:", sameControllerStash.length);

	process.exit();
})();

const chunkArray = (array, size) => {
	const result = [];
	for (let i = 0; i < array.length; i += size) {
		const chunk = array.slice(i, i + size);
		result.push(chunk);
	}
	return result;
};

const fetchAccountStaking = async (accountId, api, validators) => {
	if (validators.includes(accountId)) {
		return true;
	}
	const staking = await api.query.staking.nominators(accountId);
	return !staking.isEmpty;
};

const fetchValidators = async (api) => {
	const validators = await api.query.staking.validators.keys();
	return getAccountId(validators);
};

const fetchValidatorsStakingInfo = async (api, validators) => {
	const chunkedStashes = chunkArray(validators, 100);
	const stakingInfo = [];
	const activeNominators = [];
	const overSubscribedNominators = [];

	const maxNominatorRewardedPerValidator = await api.consts.staking.maxNominatorRewardedPerValidator.toNumber();

	for (let i = 0; i < chunkedStashes.length; i++) {
		const info = await Promise.all(
			chunkedStashes[i].map((valId) => api.derive.staking.account(valId))
		);
		stakingInfo.push(...info);
	}
	stakingInfo.map((x) => {
		const nominators = x.exposure.others.map((nom) => {
			const stashtId = nom.who.toString();
			const stake = parseInt(nom.value);
			return { stashtId: stashtId, stake: stake };
		});
		activeNominators.push(...nominators);
		if (nominators.length > maxNominatorRewardedPerValidator) {
			const ascNom = nominators.sort(function (a, b) {
				return b.stake - a.stake;
			});
			const overSub = ascNom.slice(maxNominatorRewardedPerValidator);
			overSubscribedNominators.push(...overSub);
		}
	});
	return { activeNominators, overSubscribedNominators };
};

const fetchControllerStashInfo = async (api, chunkedAccounts) => {
	const controllerStashArr = [];

	for (let i = 0; i < chunkedAccounts.length; i++) {
		const info = await Promise.all(
			chunkedAccounts[i].map(async (id) => {
				const ledgerInfo = (await api.query.staking.ledger(id)).toJSON();
				if (!isNil(ledgerInfo)) {
					controllerStashArr.push({
						controller: id,
						stash: ledgerInfo.stash.toString(),
						active: parseInt(ledgerInfo.active),
						total: parseInt(ledgerInfo.total),
					});
				}
			})
		);
	}

	return controllerStashArr;
};

const getAccountId = (account) =>
	account
		.map((e) => e.args)
		.map(([e]) => e)
		.map((e) => e.toHuman());

function getSuffix() {
	if (network == "kusama") return "KSM";
	else return "DOT";
}
