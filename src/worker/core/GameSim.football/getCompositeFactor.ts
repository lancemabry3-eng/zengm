import type { Position } from "../../../common/types.football.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import getPlayers from "./getPlayers.ts";
import type {
	DefensivePlayConcept,
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

export type PassBlockingResult = {
	type:
		| "OL"
		| "Other";
	won: boolean;
};

export const getPassPressureLevel = (
	offense: PlayersOnField,
	results: Map<
		PlayerGameSim,
		PassBlockingResult
	>,
	matchups: Map<
		PlayerGameSim,
		PlayerGameSim
	>,
	teamPassRushing: number,
): number => {
	const ol =
		offense.OL ?? [];

	const te =
		offense.TE ?? [];

	const rb =
		offense.RB ?? [];

	let weightedPressure = 0;
	let totalWeight = 0;

	for (
		const [
			blocker,
			result,
		] of results
	) {
		const slotIndex =
			result.type ===
				"OL"
				? ol.indexOf(
						blocker,
					)
				: -1;

		let weight:
			number;

		if (
			result.type ===
			"OL"
		) {
			weight =
				slotIndex === 0 ||
				slotIndex === 4
					? 1.15
					: 1;
		} else if (
			rb.includes(
				blocker,
			)
		) {
			weight = 0.55;
		} else if (
			te.includes(
				blocker,
			)
		) {
			weight = 0.45;
		} else {
			weight = 0.35;
		}

		totalWeight +=
			weight;

		if (result.won) {
			continue;
		}

		let opponentStrength =
			Math.max(
				0.05,
				teamPassRushing,
			);

		if (slotIndex >= 0) {
			const defender =
				matchups.get(
					blocker,
				);

			if (defender) {
				opponentStrength =
					0.35 *
						opponentStrength +
					0.65 *
						getPassRushMatchupStrength(
							defender,
							slotIndex,
						);
			}
		}

		const blockerStrength =
			Math.max(
				0.05,
				blocker
					.compositeRating
					.passBlocking,
			);

		const matchupRatio =
			opponentStrength /
			blockerStrength;

		const severity =
			Math.min(
				1.35,
				Math.max(
					0.4,
					0.65 +
						(matchupRatio -
							1) *
							0.75,
				),
			);

		weightedPressure +=
			weight *
			severity;
	}

	if (totalWeight <= 0) {
		return 0;
	}

	return Math.min(
		1,
		Math.max(
			0,
			(weightedPressure /
				totalWeight) *
				1.9,
		),
	);
};

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

export type RunBlockingResult =
	PassBlockingResult;

export const getRunDisruptionLevel = (
	offense: PlayersOnField,
	results: Map<
		PlayerGameSim,
		RunBlockingResult
	>,
	matchups: Map<
		PlayerGameSim,
		PlayerGameSim
	>,
	concept: RunConcept,
	teamRunStopping: number,
): number => {
	const ol =
		offense.OL ?? [];

	const te =
		offense.TE ?? [];

	const rb =
		offense.RB ?? [];

	const wr =
		offense.WR ?? [];

	let weightedDisruption = 0;
	let totalWeight = 0;

	for (
		const [
			blocker,
			result,
		] of results
	) {
		const slotIndex =
			result.type ===
				"OL"
				? ol.indexOf(
						blocker,
					)
				: -1;

		let weight:
			number;

		if (slotIndex >= 0) {
			weight =
				getRunBlockSlotWeight(
					concept,
					slotIndex,
				);
		} else if (
			te.includes(
				blocker,
			)
		) {
			weight =
				getRunExtraBlockWeight(
					concept,
					"TE",
				);
		} else if (
			rb.includes(
				blocker,
			)
		) {
			weight =
				getRunExtraBlockWeight(
					concept,
					"RB",
				);
		} else if (
			wr.includes(
				blocker,
			)
		) {
			weight =
				getRunExtraBlockWeight(
					concept,
					"WR",
				);
		} else {
			weight = 0.25;
		}

		totalWeight +=
			weight;

		if (result.won) {
			continue;
		}

		let opponentStrength =
			Math.max(
				0.05,
				teamRunStopping,
			);

		if (slotIndex >= 0) {
			const defender =
				matchups.get(
					blocker,
				);

			if (defender) {
				opponentStrength =
					0.35 *
						opponentStrength +
					0.65 *
						getRunStopMatchupStrength(
							defender,
							slotIndex,
						);
			}
		}

		const blockerStrength =
			Math.max(
				0.05,
				blocker
					.compositeRating
					.runBlocking,
			);

		const matchupRatio =
			opponentStrength /
			blockerStrength;

		const severity =
			Math.min(
				1.4,
				Math.max(
					0.4,
					0.65 +
						(matchupRatio -
							1) *
							0.8,
				),
			);

		weightedDisruption +=
			weight *
			severity;
	}

	if (totalWeight <= 0) {
		return 0;
	}

	return Math.min(
		1,
		Math.max(
			0,
			(weightedDisruption /
				totalWeight) *
				1.8,
		),
	);
};

/*
 * PASS-RUSH PARTICIPATION
 *
 * Normal coverage calls send four.
 * BLITZ sends six.
 * RUN_BLITZ sends five.
 */
export type PassRushPlan = {
	matchups: Map<
		PlayerGameSim,
		PlayerGameSim
	>;
	extraRushers: PlayerGameSim[];
	rushers: PlayerGameSim[];
};

export const getPassRushFreeRusherStrength = (
	p: PlayerGameSim,
): number => {
	return Math.max(
		getPassRushMatchupStrength(
			p,
			0,
		),
		getPassRushMatchupStrength(
			p,
			2,
		),
		getPassRushMatchupStrength(
			p,
			4,
		),
	);
};

const getEdgePassRushSelectionStrength = (
	p: PlayerGameSim,
): number => {
	return Math.max(
		getPassRushMatchupStrength(
			p,
			0,
		),
		getPassRushMatchupStrength(
			p,
			4,
		),
	);
};

const getPassRushers = (
	defense: PlayersOnField,
	concept: DefensivePlayConcept,
): PlayerGameSim[] => {
	const dl =
		(defense.DL ?? [])
			.slice();

	const lb =
		(defense.LB ?? [])
			.slice();

	const safeties =
		(defense.S ?? [])
			.slice();

	dl.sort(
		(a, b) =>
			getPassRushFreeRusherStrength(
				b,
			) -
			getPassRushFreeRusherStrength(
				a,
			),
	);

	lb.sort(
		(a, b) =>
			getEdgePassRushSelectionStrength(
				b,
			) -
			getEdgePassRushSelectionStrength(
				a,
			),
	);

	const rushers:
		PlayerGameSim[] =
		dl.slice(
			0,
			4,
		);

	for (
		const p of lb
	) {
		if (
			rushers.length >=
			4
		) {
			break;
		}

		if (
			!rushers.includes(
				p,
			)
		) {
			rushers.push(
				p,
			);
		}
	}

	const desiredRushers =
		concept === "BLITZ"
			? 6
			: concept ===
				  "RUN_BLITZ"
				? 5
				: 4;

	if (
		rushers.length >=
		desiredRushers
	) {
		return rushers.slice(
			0,
			desiredRushers,
		);
	}

	const pressureCandidates = [
		...lb,
		...safeties,
	].filter(
		(p) =>
			!rushers.includes(
				p,
			),
	);

	pressureCandidates.sort(
		(a, b) =>
			getPassRushFreeRusherStrength(
				b,
			) -
			getPassRushFreeRusherStrength(
				a,
			),
	);

	for (
		const p of
			pressureCandidates
	) {
		if (
			rushers.length >=
			desiredRushers
		) {
			break;
		}

		rushers.push(
			p,
		);
	}

	return rushers;
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

const buildPassRushMatchups = (
	offense: PlayersOnField,
	rushers: PlayerGameSim[],
): {
	matchups: Map<
		PlayerGameSim,
		PlayerGameSim
	>;
	extraRushers:
		PlayerGameSim[];
} => {
	const ol =
		offense.OL ?? [];

	const targetAssignments =
		Math.min(
			ol.length,
			rushers.length,
		);

	if (
		targetAssignments ===
			0
	) {
		return {
			matchups:
				new Map(),
			extraRushers:
				rushers.slice(),
		};
	}

	let bestScore =
		-Infinity;

	let bestPairs:
		Array<
			[
				PlayerGameSim,
				PlayerGameSim,
			]
		> = [];

	const search = (
		blockerSlot: number,
		remainingRushers:
			PlayerGameSim[],
		pairs:
			Array<
				[
					PlayerGameSim,
					PlayerGameSim,
				]
			>,
		score: number,
	) => {
		const assignmentsLeft =
			targetAssignments -
			pairs.length;

		if (
			assignmentsLeft ===
			0
		) {
			if (
				score >
				bestScore
			) {
				bestScore =
					score;

				bestPairs =
					pairs.slice();
			}

			return;
		}

		if (
			blockerSlot >=
			ol.length
		) {
			return;
		}

		const blockersLeft =
			ol.length -
			blockerSlot;

		if (
			blockersLeft <
			assignmentsLeft
		) {
			return;
		}

		if (
			blockersLeft >
			assignmentsLeft
		) {
			search(
				blockerSlot +
					1,
				remainingRushers,
				pairs,
				score,
			);
		}

		const blocker =
			ol[
				blockerSlot
			];

		if (!blocker) {
			return;
		}

		for (
			let i = 0;
			i <
			remainingRushers.length;
			i++
		) {
			const rusher =
				remainingRushers[
					i
				]!;

			const nextRemaining =
				remainingRushers.filter(
					(
						,
						index,
					) =>
						index !==
						i,
				);

			search(
				blockerSlot +
					1,
				nextRemaining,
				[
					...pairs,
					[
						blocker,
						rusher,
					],
				],
				score +
					getPassRushMatchupStrength(
						rusher,
						blockerSlot,
					),
			);
		}
	};

	search(
		0,
		rushers,
		[],
		0,
	);

	const matchups =
		new Map<
			PlayerGameSim,
			PlayerGameSim
		>(
			bestPairs,
		);

	const usedRushers =
		new Set(
			bestPairs.map(
				([
					,
					rusher,
				]) =>
					rusher,
			),
		);

	const extraRushers =
		rushers.filter(
			(p) =>
				!usedRushers.has(
					p,
				),
		);

	return {
		matchups,
		extraRushers,
	};
};

export const getPassRushPlan = (
	offense: PlayersOnField,
	defense: PlayersOnField,
	concept: DefensivePlayConcept,
): PassRushPlan => {
	const rushers =
		getPassRushers(
			defense,
			concept,
		);

	const {
		matchups,
		extraRushers,
	} =
		buildPassRushMatchups(
			offense,
			rushers,
		);

	return {
		matchups,
		extraRushers,
		rushers,
	};
};

/*
 * Keep the old helper available until the live simulator
 * switches over to the full concept-aware rush plan.
 */
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