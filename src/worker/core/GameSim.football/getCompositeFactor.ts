import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import getPlayers from "./getPlayers.ts";
import type {
	PlayerGameSim,
	PlayersOnField,
	RunConcept,
} from "./types.ts";

export type CompositeFactorParams = {
	positions: Position[];
	orderFunc: (
		a: PlayerGameSim,
	) => number;
	weightsMain: number[];
	weightsBonus: number[];
	valFunc: (
		a: PlayerGameSim,
	) => number;
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
	const maxNum =
		weightsMain.length +
		weightsBonus.length;

	const players =
		getPlayers(
			playersOnField,
			positions,
		);

	players.sort(
		(a, b) =>
			orderFunc(b) -
			orderFunc(a),
	);

	const numPlayers =
		Math.min(
			players.length,
			maxNum,
		);

	if (numPlayers > 0) {
		let numerator = 0;
		let denominator = 0;

		for (
			let i = 0;
			i < numPlayers;
			i++
		) {
			const p =
				players[i]!;

			const main =
				i <
				weightsMain.length;

			const weight =
				main
					? weightsMain[i]
					: weightsBonus[
							i -
								weightsMain.length
						];

			if (
				typeof weight !==
				"number"
			) {
				throw new Error(
					"weight should always be number",
				);
			}

			numerator +=
				weight *
				valFunc(p);

			if (main) {
				denominator +=
					weight;
			}
		}

		return (
			numerator /
			denominator
		);
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

const BLOCKING_BONUS_WEIGHTS = [
	1,
	0.5,
];

const getBlockerValue = (
	p: PlayerGameSim,
	type: "pass" | "run",
) => {
	const ovr =
		p.ovrs.OL / 100;

	const blocking =
		type === "pass"
			? p.compositeRating
					.passBlocking
			: p.compositeRating
					.runBlocking;

	return (
		ovr +
		blocking
	) / 2;
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

	const extraBlockers =
		getPlayers(
			playersOnField,
			[
				"TE",
				"RB",
			],
		);

	extraBlockers.sort(
		(a, b) =>
			getBlockerValue(
				b,
				type,
			) -
			getBlockerValue(
				a,
				type,
			),
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
	const ol =
		playersOnField.OL ??
		[];

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

	const numOl =
		Math.min(
			ol.length,
			weights.length,
		);

	for (
		let i = 0;
		i < numOl;
		i++
	) {
		const p =
			ol[i]!;

		const weight =
			weights[i]!;

		numerator +=
			weight *
			getBlockerValue(
				p,
				type,
			);

		denominator +=
			weight;
	}

	if (
		denominator ===
		0
	) {
		return 0;
	}

	/*
	 * TE/RB blocking remains a bonus on top of the main
	 * offensive line, matching the spirit of the original
	 * Football GM calculation.
	 */

	const extraBlockers =
		getExtraBlockers(
			playersOnField,
			type,
		);

	for (
		let i = 0;
		i <
		extraBlockers.length;
		i++
	) {
		const p =
			extraBlockers[i]!;

		const weight =
			BLOCKING_BONUS_WEIGHTS[
				i
			]!;

		numerator +=
			weight *
			getBlockerValue(
				p,
				type,
			);
	}

	return (
		numerator /
		denominator
	);
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

/*
 * RUN-CONCEPT LANE WEIGHTS
 *
 * These weights describe which blockers matter most to the
 * success of a particular rushing concept.
 *
 * OL slot order:
 *
 * 0 = LT
 * 1 = LG
 * 2 = C
 * 3 = RG
 * 4 = RT
 *
 * The average OL weight for every concept is kept close to 1
 * so this changes where execution comes from more than it
 * changes league-wide rushing efficiency.
 */
const RUN_BLOCK_SLOT_WEIGHTS: Record<
	RunConcept,
	readonly [
		number,
		number,
		number,
		number,
		number,
	]
> = {
	INSIDE_ZONE: [
		0.75,
		1.15,
		1.2,
		1.15,
		0.75,
	],
	OUTSIDE_ZONE: [
		1.25,
		1.05,
		0.7,
		1.05,
		1.25,
	],
	POWER: [
		0.8,
		1.25,
		1.15,
		1.25,
		0.8,
	],
	COUNTER: [
		1.05,
		1.3,
		0.7,
		1.3,
		1.05,
	],
	DRAW: [
		1,
		1,
		1,
		1,
		1,
	],
	READ_OPTION: [
		1.2,
		1,
		0.8,
		1,
		1.2,
	],
	QB_POWER: [
		0.85,
		1.25,
		1.15,
		1.25,
		0.85,
	],
	JET_SWEEP: [
		1.35,
		0.95,
		0.55,
		0.95,
		1.35,
	],
};

export const getRunBlockSlotWeight = (
	concept: RunConcept,
	slotIndex: number,
): number => {
	return (
		RUN_BLOCK_SLOT_WEIGHTS[
			concept
		][slotIndex] ??
		1
	);
};

/*
 * Extra blockers also matter differently by concept.
 *
 * TE:
 *   Most important on perimeter runs and heavy downhill runs.
 *
 * RB:
 *   Most important as a lead/help blocker on Power and
 *   designed QB runs.
 *
 * WR:
 *   Most important when the run is trying to reach the edge.
 */
export const getRunExtraBlockWeight = (
	concept: RunConcept,
	position: "TE" | "RB" | "WR",
): number => {
	if (position === "TE") {
		if (
			concept === "OUTSIDE_ZONE" ||
			concept === "JET_SWEEP"
		) {
			return 0.75;
		}

		if (
			concept === "POWER" ||
			concept === "QB_POWER"
		) {
			return 0.65;
		}

		if (
			concept === "INSIDE_ZONE" ||
			concept === "COUNTER" ||
			concept === "READ_OPTION"
		) {
			return 0.5;
		}

		return 0.3;
	}

	if (position === "RB") {
		if (
			concept === "POWER" ||
			concept === "QB_POWER"
		) {
			return 0.8;
		}

		if (concept === "COUNTER") {
			return 0.6;
		}

		if (
			concept === "INSIDE_ZONE" ||
			concept === "OUTSIDE_ZONE"
		) {
			return 0.4;
		}

		if (concept === "READ_OPTION") {
			return 0.25;
		}

		return 0.2;
	}

	if (
		concept === "JET_SWEEP"
	) {
		return 0.9;
	}

	if (
		concept === "OUTSIDE_ZONE" ||
		concept === "READ_OPTION"
	) {
		return 0.55;
	}

	if (concept === "COUNTER") {
		return 0.35;
	}

	return 0.2;
};

/*
 * INDIVIDUAL TRENCH MATCHUPS
 *
 * Team composite ratings are still useful for keeping the
 * simulator fast and statistically stable, but they should
 * not erase the player directly across from a blocker.
 *
 * These helpers create lightweight one-on-one matchup
 * assignments for the five offensive-line slots.
 *
 * They do not attempt to simulate physical coordinates.
 * Instead, they identify the most relevant defender for
 * each blocking lane:
 *
 * LT / RT:
 *   Prefer EDGE-style threats.
 *
 * LG / C / RG:
 *   Prefer interior defensive linemen and inside/front-seven
 *   defenders.
 *
 * Each defender is used once when enough defenders are
 * available. This prevents one superstar pass rusher from
 * magically attacking all five OL on the same snap.
 *
 * Team-level ratings remain in the larger simulation, so
 * double teams, stunts, coverage pressure, blitz structure,
 * and help protection can still be represented abstractly.
 */

const EDGE_PASS_RUSH_ROLES:
	FunctionalRole[] = [
		"DL_EDGE",
		"LB_EDGE",
		"DE",
	];

const INTERIOR_PASS_RUSH_ROLES:
	FunctionalRole[] = [
		"DT",
		"NT",
		"DE",
		"MIKE",
		"SAM",
	];

const EDGE_RUN_STOP_ROLES:
	FunctionalRole[] = [
		"DL_EDGE",
		"DE",
		"LB_EDGE",
		"SAM",
	];

const INTERIOR_RUN_STOP_ROLES:
	FunctionalRole[] = [
		"DT",
		"NT",
		"DE",
		"MIKE",
		"SAM",
	];

const getBestRoleFit = (
	p: PlayerGameSim,
	roles: FunctionalRole[],
): number => {
	let best:
		| number
		| undefined;

	for (
		const role of
			roles
	) {
		const value =
			p.roleOvrs?.[
				role
			];

		if (
			value !==
				undefined &&
			(best ===
				undefined ||
				value >
					best)
		) {
			best =
				value;
		}
	}

	/*
	 * Older/manual PlayerGameSim objects may not carry
	 * functional-role ratings. Treat missing role data as
	 * neutral rather than making those players unusable.
	 */
	return (
		(best ?? 50) /
		100
	);
};

const getFrontOvr = (
	p: PlayerGameSim,
): number => {
	return (
		Math.max(
			p.ovrs.DL ?? 0,
			p.ovrs.LB ?? 0,
		) /
		100
	);
};

const getTrenchEnergyFactor = (
	p: PlayerGameSim,
): number => {
	if (p.injured) {
		return 0.8;
	}

	const energy =
		Math.min(
			1,
			Math.max(
				0.25,
				p.stat.energy ??
					1,
			),
		);

	return (
		0.85 +
		0.15 *
			energy
	);
};

const isEdgeOlSlot = (
	slotIndex: number,
): boolean => {
	return (
		slotIndex === 0 ||
		slotIndex === 4
	);
};

export const getPassRushMatchupStrength = (
	p: PlayerGameSim,
	blockerSlot: number,
): number => {
	const roles =
		isEdgeOlSlot(
			blockerSlot,
		)
			? EDGE_PASS_RUSH_ROLES
			: INTERIOR_PASS_RUSH_ROLES;

	const roleFit =
		getBestRoleFit(
			p,
			roles,
		);

	const rawRush =
		Math.max(
			0.05,
			p.compositeRating
				.passRushing,
		);

	const frontOvr =
		getFrontOvr(p);

	return (
		(
			rawRush *
				0.55 +
			roleFit *
				0.3 +
			frontOvr *
				0.15
		) *
		getTrenchEnergyFactor(
			p,
		)
	);
};

export const getRunStopMatchupStrength = (
	p: PlayerGameSim,
	blockerSlot: number,
): number => {
	const roles =
		isEdgeOlSlot(
			blockerSlot,
		)
			? EDGE_RUN_STOP_ROLES
			: INTERIOR_RUN_STOP_ROLES;

	const roleFit =
		getBestRoleFit(
			p,
			roles,
		);

	const rawRunStop =
		Math.max(
			0.05,
			p.compositeRating
				.runStopping,
		);

	const frontOvr =
		getFrontOvr(p);

	return (
		(
			rawRunStop *
				0.55 +
			roleFit *
				0.3 +
			frontOvr *
				0.15
		) *
		getTrenchEnergyFactor(
			p,
		)
	);
};

type MatchupStrengthFunction = (
	p: PlayerGameSim,
	blockerSlot: number,
) => number;

const buildOlMatchups = (
	offense: PlayersOnField,
	defense: PlayersOnField,
	strengthFunction:
		MatchupStrengthFunction,
): Map<
	PlayerGameSim,
	PlayerGameSim
> => {
	const matchups =
		new Map<
			PlayerGameSim,
			PlayerGameSim
		>();

	const ol =
		offense.OL ?? [];

	const front =
		getPlayers(
			defense,
			[
				"DL",
				"LB",
			],
		);

	if (
		ol.length === 0 ||
		front.length === 0
	) {
		return matchups;
	}

	const remaining =
		front.slice();

	/*
	 * Assign tackles first because edge matchups are the
	 * most specialized, then guards, then the center.
	 *
	 * OL slots:
	 *
	 * 0 LT
	 * 1 LG
	 * 2 C
	 * 3 RG
	 * 4 RT
	 */
	const assignmentOrder = [
		0,
		4,
		1,
		3,
		2,
	];

	for (
		const blockerSlot of
			assignmentOrder
	) {
		const blocker =
			ol[blockerSlot];

		if (!blocker) {
			continue;
		}

		const candidates =
			remaining.length >
			0
				? remaining
				: front;

		let bestDefender =
			candidates[0];

		if (!bestDefender) {
			continue;
		}

		let bestStrength =
			strengthFunction(
				bestDefender,
				blockerSlot,
			);

		for (
			let i = 1;
			i <
			candidates.length;
			i++
		) {
			const defender =
				candidates[i]!;

			const strength =
				strengthFunction(
					defender,
					blockerSlot,
				);

			if (
				strength >
				bestStrength
			) {
				bestDefender =
					defender;

				bestStrength =
					strength;
			}
		}

		matchups.set(
			blocker,
			bestDefender,
		);

		const remainingIndex =
			remaining.indexOf(
				bestDefender,
			);

		if (
			remainingIndex >=
			0
		) {
			remaining.splice(
				remainingIndex,
				1,
			);
		}
	}

	return matchups;
};

export const getPassProtectionMatchups = (
	offense: PlayersOnField,
	defense: PlayersOnField,
): Map<
	PlayerGameSim,
	PlayerGameSim
> => {
	return buildOlMatchups(
		offense,
		defense,
		getPassRushMatchupStrength,
	);
};

export const getRunBlockingMatchups = (
	offense: PlayersOnField,
	defense: PlayersOnField,
): Map<
	PlayerGameSim,
	PlayerGameSim
> => {
	return buildOlMatchups(
		offense,
		defense,
		getRunStopMatchupStrength,
	);
};