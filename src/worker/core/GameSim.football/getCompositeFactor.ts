import getPlayers from "./getPlayers.ts";
import type { Position } from "../../../common/types.football.ts";
import type { PlayerGameSim, PlayersOnField } from "./types.ts";

export type CompositeFactorParams = {
	positions: Position[];
	orderFunc: (a: PlayerGameSim) => number;
	weightsMain: number[];
	weightsBonus: number[];
	valFunc: (a: PlayerGameSim) => number;
};

// weightsBonus is not added to denominator, it just gives a bonus in situations e.g. with extra receivers or blockers beyond normal
export const getCompositeFactor = (
	playersOnField: PlayersOnField,
	{
		positions,
		orderFunc,
		weightsMain,
		weightsBonus,
		valFunc,
	}: CompositeFactorParams,
) => {
	const maxNum = weightsMain.length + weightsBonus.length;
	const players = getPlayers(playersOnField, positions);
	players.sort((a, b) => orderFunc(b) - orderFunc(a));
	const numPlayers = Math.min(players.length, maxNum);

	if (numPlayers > 0) {
		let numerator = 0;
		let denominator = 0;

		for (let i = 0; i < numPlayers; i++) {
			const p = players[i]!;
			const main = i < weightsMain.length;
			const weight = main
				? weightsMain[i]
				: weightsBonus[i - weightsMain.length];

			if (typeof weight !== "number") {
				throw new Error("weight should always be number");
			}

			numerator += weight * valFunc(p);

			if (main) {
				denominator += weight;
			}
		}

		return numerator / denominator;
	}

	return 0;
};

/*
 * REALISM OVERHAUL
 *
 * Normal offensive line order:
 *
 * 0 = LT
 * 1 = LG
 * 2 = C
 * 3 = RG
 * 4 = RT
 *
 * The old blocking calculation re-sorted every blocker by
 * generic OL OVR. That meant a player's actual spot on the
 * offensive line did not matter.
 *
 * These weights preserve the five-man line and make each
 * position contribute differently.
 */

const PASS_BLOCKING_WEIGHTS = [
	4.5, // LT
	3.25, // LG
	2.75, // C
	3.25, // RG
	4.25, // RT
];

const RUN_BLOCKING_WEIGHTS = [
	3, // LT
	4, // LG
	4, // C
	4, // RG
	3, // RT
];

/*
 * Keep the same total main-line weight as Football GM's
 * original blocking formula.
 *
 * Original:
 * 5 + 4 + 3 + 3 + 3 = 18
 *
 * New pass blocking:
 * 4.5 + 3.25 + 2.75 + 3.25 + 4.25 = 18
 *
 * New run blocking:
 * 3 + 4 + 4 + 4 + 3 = 18
 *
 * This helps preserve overall statistical balance while
 * changing where the blocking value comes from.
 */

const BLOCKING_BONUS_WEIGHTS = [1, 0.5];

const getBlockerValue = (
	p: PlayerGameSim,
	type: "pass" | "run",
) => {
	const ovr = p.ovrs.OL / 100;

	const blocking =
		type === "pass"
			? p.compositeRating.passBlocking
			: p.compositeRating.runBlocking;

	return (ovr + blocking) / 2;
};

const getExtraBlockers = (
	playersOnField: PlayersOnField,
	type: "pass" | "run",
) => {
	/*
	 * Tight ends and running backs remain bonus blockers.
	 * They do not replace one of the five starting OL in
	 * the main blocking calculation.
	 */

	const extraBlockers = getPlayers(
		playersOnField,
		["TE", "RB"],
	);

	extraBlockers.sort(
		(a, b) =>
			getBlockerValue(b, type) -
			getBlockerValue(a, type),
	);

	return extraBlockers.slice(
		0,
		BLOCKING_BONUS_WEIGHTS.length,
	);
};

const getOlBlockingFactor = (
	playersOnField: PlayersOnField,
	type: "pass" | "run",
) => {
	const ol = playersOnField.OL ?? [];

	const weights =
		type === "pass"
			? PASS_BLOCKING_WEIGHTS
			: RUN_BLOCKING_WEIGHTS;

	let numerator = 0;
	let denominator = 0;

	/*
	 * Do NOT sort these players.
	 *
	 * Their array position represents their real OL role:
	 *
	 * LT / LG / C / RG / RT
	 */
	const numOl = Math.min(
		ol.length,
		weights.length,
	);

	for (let i = 0; i < numOl; i++) {
		const p = ol[i]!;
		const weight = weights[i]!;

		numerator +=
			weight * getBlockerValue(p, type);

		denominator += weight;
	}

	if (denominator === 0) {
		return 0;
	}

	/*
	 * TE/RB blocking remains a bonus on top of the main
	 * offensive line, matching the spirit of the original
	 * Football GM calculation.
	 */
	const extraBlockers =
		getExtraBlockers(playersOnField, type);

	for (
		let i = 0;
		i < extraBlockers.length;
		i++
	) {
		const p = extraBlockers[i]!;
		const weight =
			BLOCKING_BONUS_WEIGHTS[i]!;

		numerator +=
			weight * getBlockerValue(p, type);
	}

	return numerator / denominator;
};

export const getBlockingFactors = (
	playersOnField: PlayersOnField,
): [number, number] => {
	const passBlocking =
		getOlBlockingFactor(
			playersOnField,
			"pass",
		);

	const runBlocking =
		getOlBlockingFactor(
			playersOnField,
			"run",
		);

	return [
		passBlocking,
		runBlocking,
	];
};