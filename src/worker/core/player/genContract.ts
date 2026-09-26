import { g, helpers } from "../../util/index.ts";
import type {
	PlayerContract,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { last } from "../../../common/utils.ts";
import { realGauss } from "../../../common/random.ts";

const FOOTBALL_POSITION_MARKET_MULTIPLIERS: Record<string, number> = {
	RB: 0.82,
	WR: 1.08,
	TE: 0.92,
	OL: 1.08,
	DL: 1.06,
	LB: 0.94,
	CB: 1.07,
	S: 0.95,
};

const getFootballPositionMarketMultiplier = (
	pos: string,
	value: number,
): number => {
	const target =
		FOOTBALL_POSITION_MARKET_MULTIPLIERS[pos] ?? 1;

	/*
	 * Replacement-level players should still live near the
	 * minimum-contract market. Positional premiums become more
	 * important as the player becomes a legitimate starter/star.
	 */
	const marketWeight = helpers.bound(
		(value - 45) / 35,
		0,
		1,
	);

	return (
		1 +
		(target - 1) *
			marketWeight
	);
};

/**
 * Generate a contract for a player.
 *
 * @memberOf core.player
 * @param {Object} ratings Player object. At a minimum, this must have one entry in the ratings array.
 * @param {boolean} randomizeExp If true, then it is assumed that some random amount of years has elapsed since the contract was signed, thus decreasing the expiration date. This is used when generating players in a new league.
 * @return {Object.<string, number>} Object containing two properties with integer values, "amount" with the contract amount in thousands of dollars and "exp" with the contract expiration year.
 */
const genContract = (
	p: PlayerWithoutKey,
	randomizeAmount: boolean = true,
	noLimit: boolean = false,
): PlayerContract => {
	const ratings = last(p.ratings);
	let factor = g.get("salaryCapType") === "hard" ? 1.6 : 2;
	let factor2 = 1;

	if (__SPORT === "basketball") {
		factor *= 1.7;
	}

	if (__SPORT === "football") {
		if (ratings.pos === "QB") {
			if (p.value >= 75) {
				factor2 *= 1.25;
			} else if (p.value >= 50) {
				factor2 *= 0.75 + ((p.value - 50) * 0.5) / 25;
			}
		} else if (ratings.pos === "K" || ratings.pos === "P") {
			factor *= 0.25;
		} else {
			factor2 *=
				getFootballPositionMarketMultiplier(
					ratings.pos,
					p.value,
				);
		}
	}

	if (__SPORT === "baseball") {
		factor *= 1.4;
	}

	if (__SPORT === "hockey") {
		factor *= 1.4;
	}

	let amount =
		((factor2 * p.value) / 100 - 0.47) *
			factor *
			(g.get("maxContract") - g.get("minContract")) +
		g.get("minContract");

	if (randomizeAmount) {
		amount *= helpers.bound(realGauss(1, 0.1), 0, 2); // Randomize
	}

	if (!noLimit) {
		if (amount < g.get("minContract") * 1.1) {
			amount = g.get("minContract");
		} else if (amount > g.get("maxContract")) {
			amount = g.get("maxContract");
		}
	} else if (amount < 0) {
		// Well, at least keep it positive
		amount = 0;
	}

	amount = helpers.roundContract(amount);

	return {
		amount,
		exp: g.get("season"),
	};
};

export default genContract;