import { FATIGUE_POS } from "../../common/constants.football.ts";
import { choice, randInt, truncGauss } from "../../common/random.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { g, helpers } from "../util/index.ts";
import type { FunctionalRole } from "./player/roleOvr.football.ts";
import GameSimBaseball from "./GameSim.baseball/index.ts";
import GameSimBasketball from "./GameSim.basketball/index.ts";
import formations from "./GameSim.football/formations.ts";
import {
	getBaseDefensiveFront,
	getFormationDepth,
	getOffensivePersonnelFit,
} from "./GameSim.football/getPlayers.ts";
import GameSimFootball from "./GameSim.football/index.ts";
import type {
	Formation,
	OffensivePersonnel,
	OffensivePlayConcept,
	PassConcept,
	PlayerGameSim,
	RunConcept,
	TeamGameSim,
} from "./GameSim.football/types.ts";
import GameSimHockey from "./GameSim.hockey/index.ts";

const footballFatigue = (
	energy: number,
	injured: boolean,
): number => {
	if (injured) {
		return 0;
	}

	energy += 0.05;

	if (energy > 1) {
		energy = 1;
	}

	return energy;
};

const applyBaseDefensiveFront = (
	formation: Formation,
	defense: GameSimFootball["team"][number],
): Formation => {
	const defensiveFront =
		getBaseDefensiveFront(
			defense,
		);

	if (
		defensiveFront ===
		"BASE_3_4"
	) {
		return {
			...formation,
			defensiveFront,
			def: {
				DL: 3,
				LB: 4,
				CB: 2,
				S: 2,
			},
		};
	}

	return {
		...formation,
		defensiveFront,
		def: {
			DL: 4,
			LB: 3,
			CB: 2,
			S: 2,
		},
	};
};

const getNormalFormation = (
	formation: Formation,
	defense: GameSimFootball["team"][number],
): Formation => {
	if (
		formation
			.offensivePersonnel ===
		"11"
	) {
		return formation;
	}

	return applyBaseDefensiveFront(
		formation,
		defense,
	);
};

const getPersonnelSituationWeight = (
	personnel: OffensivePersonnel,
	playType: "run" | "pass",
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight: number;

	if (playType === "pass") {
		if (personnel === "11") {
			weight = 5.5;
		} else if (personnel === "12") {
			weight = 3.5;
		} else if (personnel === "21") {
			weight = 2.25;
		} else {
			weight = 0.75;
		}
	} else {
		if (personnel === "11") {
			weight = 2.5;
		} else if (personnel === "12") {
			weight = 3.5;
		} else if (personnel === "21") {
			weight = 4;
		} else {
			weight = 3;
		}
	}

	if (toGo <= 2) {
		if (personnel === "11") {
			weight *= 0.75;
		} else if (personnel === "12") {
			weight *= 1.15;
		} else if (personnel === "21") {
			weight *= 1.25;
		} else {
			weight *= 1.6;
		}
	}

	if (toGo >= 7) {
		if (personnel === "11") {
			weight *= 1.55;
		} else if (personnel === "12") {
			weight *= 1.05;
		} else if (personnel === "21") {
			weight *= 0.8;
		} else {
			weight *= 0.55;
		}
	}

	if (
		down >= 3 &&
		toGo >= 5
	) {
		if (personnel === "11") {
			weight *= 1.5;
		} else if (personnel === "12") {
			weight *= 1.05;
		} else if (personnel === "21") {
			weight *= 0.75;
		} else {
			weight *= 0.45;
		}
	}

	if (scrimmage >= 95) {
		if (personnel === "11") {
			weight *= 0.7;
		} else if (personnel === "12") {
			weight *= 1.2;
		} else if (personnel === "21") {
			weight *= 1.25;
		} else {
			weight *= 1.75;
		}
	}

	return weight;
};

const chooseOffensiveFormation = (
	offense: TeamGameSim,
	playType: "run" | "pass",
	down: number,
	toGo: number,
	scrimmage: number,
): Formation => {
	const fits = new Map<
		OffensivePersonnel,
		number
	>();

	for (
		const formation of
			formations.normal
	) {
		const personnel =
			formation
				.offensivePersonnel;

		if (
			personnel ===
			undefined
		) {
			continue;
		}

		const fit =
			getOffensivePersonnelFit(
				offense,
				personnel,
			);

		if (fit !== undefined) {
			fits.set(
				personnel,
				fit,
			);
		}
	}

	let averageFit:
		| number
		| undefined;

	if (fits.size > 0) {
		let total = 0;

		for (
			const fit of
				fits.values()
		) {
			total += fit;
		}

		averageFit =
			total / fits.size;
	}

	return choice(
		formations.normal,
		(formation) => {
			const personnel =
				formation
					.offensivePersonnel;

			if (
				personnel ===
				undefined
			) {
				return 0.01;
			}

			const situationWeight =
				getPersonnelSituationWeight(
					personnel,
					playType,
					down,
					toGo,
					scrimmage,
				);

			const fit =
				fits.get(
					personnel,
				);

			const fitFactor =
				fit !== undefined &&
				averageFit !==
					undefined
					? helpers.bound(
							1 +
								(fit -
									averageFit) /
									50,
							0.7,
							1.3,
						)
					: 1;

			return (
				situationWeight *
				fitFactor
			);
		},
	);
};

const RUN_CONCEPTS: RunConcept[] = [
	"INSIDE_ZONE",
	"OUTSIDE_ZONE",
	"POWER",
	"COUNTER",
	"DRAW",
];

const PASS_CONCEPTS: PassConcept[] = [
	"QUICK_GAME",
	"INTERMEDIATE",
	"DEEP_SHOT",
	"PLAY_ACTION",
	"SCREEN",
];

const averageDefined = (
	values: Array<
		number | undefined
	>,
): number | undefined => {
	const defined =
		values.filter(
			(
				value,
			): value is number =>
				value !==
				undefined,
		);

	if (defined.length === 0) {
		return undefined;
	}

	return (
		defined.reduce(
			(sum, value) =>
				sum + value,
			0,
		) / defined.length
	);
};

const getBestRoleScore = (
	team: TeamGameSim,
	pos:
		| "QB"
		| "RB"
		| "WR"
		| "TE"
		| "OL",
	roles: FunctionalRole[],
): number | undefined => {
	let best:
		| number
		| undefined;

	for (
		const p of
			team.depth[pos]
	) {
		for (
			const role of
				roles
		) {
			const score =
				p.roleOvrs?.[
					role
				];

			if (
				score !==
					undefined &&
				(best ===
					undefined ||
					score > best)
			) {
				best = score;
			}
		}
	}

	return best;
};

const getTeamCompositeScore = (
	team: TeamGameSim,
	rating: string,
): number | undefined => {
	const value =
		team.compositeRating?.[
			rating
		];

	if (
		typeof value !==
		"number"
	) {
		return undefined;
	}

	return helpers.bound(
		value * 100,
		0,
		100,
	);
};

const getRunConceptRosterScore = (
	team: TeamGameSim,
	concept: RunConcept,
): number | undefined => {
	if (
		concept ===
		"INSIDE_ZONE"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"RB",
				[
					"RB_FEATURE",
				],
			),
			getBestRoleScore(
				team,
				"OL",
				[
					"LG",
					"C",
					"RG",
				],
			),
			getTeamCompositeScore(
				team,
				"runBlocking",
			),
		]);
	}

	if (
		concept ===
		"OUTSIDE_ZONE"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"RB",
				[
					"RB_FEATURE",
					"RB_RECEIVING",
				],
			),
			getBestRoleScore(
				team,
				"OL",
				[
					"LT",
					"RT",
				],
			),
			getTeamCompositeScore(
				team,
				"rushing",
			),
		]);
	}

	if (
		concept ===
		"POWER"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"RB",
				[
					"RB_POWER",
					"RB_SHORT_YARDAGE",
				],
			),
			getBestRoleScore(
				team,
				"OL",
				[
					"LG",
					"C",
					"RG",
				],
			),
			getTeamCompositeScore(
				team,
				"runBlocking",
			),
		]);
	}

	if (
		concept ===
		"COUNTER"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"RB",
				[
					"RB_FEATURE",
					"RB_POWER",
				],
			),
			getBestRoleScore(
				team,
				"OL",
				[
					"LG",
					"RG",
				],
			),
			getTeamCompositeScore(
				team,
				"rushing",
			),
		]);
	}

	return averageDefined([
		getBestRoleScore(
			team,
			"RB",
			[
				"RB_THIRD_DOWN",
				"RB_RECEIVING",
			],
		),
		getBestRoleScore(
			team,
			"OL",
			[
				"LT",
				"RT",
			],
		),
		getTeamCompositeScore(
			team,
			"rushing",
		),
	]);
};

const getPassConceptRosterScore = (
	team: TeamGameSim,
	concept: PassConcept,
): number | undefined => {
	if (
		concept ===
		"QUICK_GAME"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"QB",
				[
					"QB_POCKET",
					"QB_CREATOR",
				],
			),
			getBestRoleScore(
				team,
				"WR",
				[
					"WR_SLOT",
					"WR_POSSESSION",
				],
			),
			getTeamCompositeScore(
				team,
				"passingAccuracy",
			),
		]);
	}

	if (
		concept ===
		"INTERMEDIATE"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"QB",
				[
					"QB_POCKET",
				],
			),
			getBestRoleScore(
				team,
				"WR",
				[
					"WR_X",
					"WR_Z",
					"WR_POSSESSION",
				],
			),
			getBestRoleScore(
				team,
				"TE",
				[
					"TE_RECEIVING",
				],
			),
			getTeamCompositeScore(
				team,
				"passingVision",
			),
		]);
	}

	if (
		concept ===
		"DEEP_SHOT"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"QB",
				[
					"QB_POCKET",
					"QB_CREATOR",
				],
			),
			getBestRoleScore(
				team,
				"WR",
				[
					"WR_DEEP_THREAT",
				],
			),
			getTeamCompositeScore(
				team,
				"passingDeep",
			),
		]);
	}

	if (
		concept ===
		"PLAY_ACTION"
	) {
		return averageDefined([
			getBestRoleScore(
				team,
				"QB",
				[
					"QB_POCKET",
					"QB_CREATOR",
				],
			),
			getBestRoleScore(
				team,
				"RB",
				[
					"RB_FEATURE",
					"RB_POWER",
				],
			),
			getBestRoleScore(
				team,
				"TE",
				[
					"TE_RECEIVING",
				],
			),
			getTeamCompositeScore(
				team,
				"passingVision",
			),
		]);
	}

	return averageDefined([
		getBestRoleScore(
			team,
			"QB",
			[
				"QB_CREATOR",
				"QB_DUAL_THREAT",
			],
		),
		getBestRoleScore(
			team,
			"RB",
			[
				"RB_RECEIVING",
				"RB_THIRD_DOWN",
			],
		),
		getBestRoleScore(
			team,
			"WR",
			[
				"WR_SLOT",
			],
		),
		getTeamCompositeScore(
			team,
			"passingAccuracy",
		),
	]);
};

const getConceptRosterFactor = (
	score: number | undefined,
): number => {
	if (
		score ===
		undefined
	) {
		return 1;
	}

	return helpers.bound(
		1 +
			(score - 50) /
				150,
		0.8,
		1.2,
	);
};

const getRunConceptSituationWeight = (
	concept: RunConcept,
	personnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight =
		concept ===
		"INSIDE_ZONE"
			? 4.5
			: concept ===
				  "OUTSIDE_ZONE"
				? 3.5
				: concept ===
					  "POWER"
					? 3
					: concept ===
						  "COUNTER"
						? 2.5
						: 1.2;

	if (
		personnel === "11"
	) {
		if (
			concept ===
			"OUTSIDE_ZONE"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"DRAW"
		) {
			weight *= 1.5;
		} else if (
			concept ===
			"POWER"
		) {
			weight *= 0.75;
		}
	} else if (
		personnel === "12"
	) {
		if (
			concept ===
			"INSIDE_ZONE"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"POWER"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"DRAW"
		) {
			weight *= 0.8;
		}
	} else if (
		personnel === "21"
	) {
		if (
			concept ===
			"INSIDE_ZONE"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"POWER"
		) {
			weight *= 1.35;
		} else if (
			concept ===
			"COUNTER"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"DRAW"
		) {
			weight *= 0.65;
		}
	} else {
		if (
			concept ===
			"POWER"
		) {
			weight *= 1.6;
		} else if (
			concept ===
			"INSIDE_ZONE"
		) {
			weight *= 1.25;
		} else if (
			concept ===
			"COUNTER"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"OUTSIDE_ZONE"
		) {
			weight *= 0.7;
		} else {
			weight *= 0.4;
		}
	}

	if (toGo <= 2) {
		if (
			concept ===
			"POWER"
		) {
			weight *= 2;
		} else if (
			concept ===
			"INSIDE_ZONE"
		) {
			weight *= 1.35;
		} else if (
			concept ===
			"COUNTER"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"DRAW"
		) {
			weight *= 0.4;
		}
	}

	if (toGo >= 7) {
		if (
			concept ===
			"DRAW"
		) {
			weight *= 2;
		} else if (
			concept ===
			"OUTSIDE_ZONE"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"POWER"
		) {
			weight *= 0.6;
		} else if (
			concept ===
			"COUNTER"
		) {
			weight *= 0.75;
		}
	}

	if (
		down >= 3 &&
		toGo >= 5
	) {
		if (
			concept ===
			"DRAW"
		) {
			weight *= 1.8;
		} else if (
			concept ===
			"OUTSIDE_ZONE"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"POWER"
		) {
			weight *= 0.5;
		}
	}

	if (
		scrimmage >= 95
	) {
		if (
			concept ===
			"POWER"
		) {
			weight *= 2.2;
		} else if (
			concept ===
			"INSIDE_ZONE"
		) {
			weight *= 1.5;
		} else if (
			concept ===
			"COUNTER"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"OUTSIDE_ZONE"
		) {
			weight *= 0.7;
		} else {
			weight *= 0.3;
		}
	}

	return weight;
};

const getPassConceptSituationWeight = (
	concept: PassConcept,
	personnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight =
		concept ===
		"QUICK_GAME"
			? 4
			: concept ===
				  "INTERMEDIATE"
				? 4.5
				: concept ===
					  "DEEP_SHOT"
					? 2.3
					: concept ===
						  "PLAY_ACTION"
						? 2.5
						: 1.5;

	if (
		personnel === "11"
	) {
		if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"INTERMEDIATE"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 0.85;
		} else {
			weight *= 1.15;
		}
	} else if (
		personnel === "12"
	) {
		if (
			concept ===
			"INTERMEDIATE"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 1.35;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 0.8;
		}
	} else if (
		personnel === "21"
	) {
		if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 1.5;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 0.75;
		} else if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 0.85;
		}
	} else {
		if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 1.7;
		} else if (
			concept ===
			"INTERMEDIATE"
		) {
			weight *= 0.8;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 0.5;
		} else if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 0.7;
		} else {
			weight *= 0.75;
		}
	}

	if (toGo <= 3) {
		if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 1.4;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 0.6;
		} else if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 1.1;
		}
	}

	if (toGo >= 10) {
		if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 1.5;
		} else if (
			concept ===
			"INTERMEDIATE"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 0.7;
		} else {
			weight *= 0.8;
		}
	}

	if (
		down >= 3 &&
		toGo >= 5
	) {
		if (
			concept ===
			"INTERMEDIATE"
		) {
			weight *= 1.25;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 0.9;
		} else if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 0.65;
		}
	}

	if (
		scrimmage >= 95
	) {
		if (
			concept ===
			"QUICK_GAME"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"PLAY_ACTION"
		) {
			weight *= 1.5;
		} else if (
			concept ===
			"DEEP_SHOT"
		) {
			weight *= 0.5;
		} else if (
			concept ===
			"SCREEN"
		) {
			weight *= 0.8;
		}
	}

	return weight;
};

const chooseOffensivePlayConcept = (
	team: TeamGameSim,
	playType: "run" | "pass",
	personnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): OffensivePlayConcept => {
	if (
		playType === "run"
	) {
		const concept =
			choice(
				RUN_CONCEPTS,
				(candidate) =>
					getRunConceptSituationWeight(
						candidate,
						personnel,
						down,
						toGo,
						scrimmage,
					) *
					getConceptRosterFactor(
						getRunConceptRosterScore(
							team,
							candidate,
						),
					),
			);

		return {
			type: "run",
			concept,
		};
	}

	const concept =
		choice(
			PASS_CONCEPTS,
			(candidate) =>
				getPassConceptSituationWeight(
					candidate,
					personnel,
					down,
					toGo,
					scrimmage,
				) *
				getConceptRosterFactor(
					getPassConceptRosterScore(
						team,
						candidate,
					),
				),
		);

	return {
		type: "pass",
		concept,
	};
};

type PassConceptEffects = {
	sackMultiplier: number;
	completionMultiplier: number;
	interceptionMultiplier: number;
	teProtectionChance: number;
	rbProtectionChance: number;
	clockMin: number;
	clockMax: number;
};

const getPassConceptEffects = (
	concept: PassConcept,
): PassConceptEffects => {
	if (
		concept ===
		"QUICK_GAME"
	) {
		return {
			sackMultiplier: 0.6,
			completionMultiplier: 1.14,
			interceptionMultiplier: 0.65,
			teProtectionChance: 0.05,
			rbProtectionChance: 0.2,
			clockMin: 2,
			clockMax: 4,
		};
	}

	if (
		concept ===
		"DEEP_SHOT"
	) {
		return {
			sackMultiplier: 1.35,
			completionMultiplier: 0.72,
			interceptionMultiplier: 1.3,
			teProtectionChance: 0.2,
			rbProtectionChance: 0.7,
			clockMin: 4,
			clockMax: 7,
		};
	}

	if (
		concept ===
		"PLAY_ACTION"
	) {
		return {
			sackMultiplier: 1.12,
			completionMultiplier: 1.03,
			interceptionMultiplier: 0.9,
			teProtectionChance: 0.18,
			rbProtectionChance: 0.5,
			clockMin: 4,
			clockMax: 7,
		};
	}

	if (
		concept === "SCREEN"
	) {
		return {
			sackMultiplier: 0.45,
			completionMultiplier: 1.18,
			interceptionMultiplier: 0.45,
			teProtectionChance: 0.05,
			rbProtectionChance: 0,
			clockMin: 2,
			clockMax: 5,
		};
	}

	return {
		sackMultiplier: 1,
		completionMultiplier: 0.98,
		interceptionMultiplier: 1,
		teProtectionChance: 0.1,
		rbProtectionChance: 0.5,
		clockMin: 3,
		clockMax: 6,
	};
};

const getRunConceptExecutionModifiers = (
	team: TeamGameSim,
	concept: RunConcept,
): {
	offenseRunBlocking: number;
	defenseRunStopping: number;
} => {
	const score =
		getRunConceptRosterScore(
			team,
			concept,
		);

	const fitFactor =
		score === undefined
			? 1
			: helpers.bound(
					1 +
						(score - 50) /
							500,
					0.95,
					1.05,
				);

	if (
		concept ===
		"INSIDE_ZONE"
	) {
		return {
			offenseRunBlocking:
				1.02 *
				fitFactor,
			defenseRunStopping:
				1.01,
		};
	}

	if (
		concept ===
		"OUTSIDE_ZONE"
	) {
		return {
			offenseRunBlocking:
				0.99 *
				fitFactor,
			defenseRunStopping:
				0.98,
		};
	}

	if (
		concept === "POWER"
	) {
		return {
			offenseRunBlocking:
				1.05 *
				fitFactor,
			defenseRunStopping:
				1.04,
		};
	}

	if (
		concept === "COUNTER"
	) {
		return {
			offenseRunBlocking:
				1 *
				fitFactor,
			defenseRunStopping:
				0.98,
		};
	}

	return {
		offenseRunBlocking:
			0.96 *
			fitFactor,
		defenseRunStopping:
			0.93,
	};
};

/*
 * Football realism layer.
 *
 * The base Football GameSim still handles the overall game.
 * This subclass layers functional roles, personnel packages,
 * schemes, and play concepts over the existing simulation.
 */
class GameSimFootballRealism extends GameSimFootball {
	currentOffensivePlayConcept:
		| OffensivePlayConcept
		| undefined;

	updatePlayersOnField(
		playType:
			| "starters"
			| "startersFake"
			| "run"
			| "pass"
			| "extraPoint"
			| "fieldGoal"
			| "punt"
			| "kickoff",
	) {
		let formation: Formation;

		this.currentOffensivePlayConcept =
			undefined;

		if (
			playType ===
			"starters"
		) {
			formation =
				applyBaseDefensiveFront(
					formations
						.normal[0]!,
					this.team[
						this.d
					],
				);
		} else if (
			playType ===
			"startersFake"
		) {
			formation =
				formations
					.normal[0]!;
		} else if (
			playType === "run" ||
			playType === "pass"
		) {
			const offensiveFormation =
				chooseOffensiveFormation(
					this.team[
						this.o
					],
					playType,
					this.down,
					this.toGo,
					this.scrimmage,
				);

			const personnel =
				offensiveFormation
					.offensivePersonnel;

			if (
				personnel !==
				undefined
			) {
				this.currentOffensivePlayConcept =
					chooseOffensivePlayConcept(
						this.team[
							this.o
						],
						playType,
						personnel,
						this.down,
						this.toGo,
						this.scrimmage,
					);
			}

			formation =
				getNormalFormation(
					offensiveFormation,
					this.team[
						this.d
					],
				);
		} else if (
			playType ===
				"extraPoint" ||
			playType ===
				"fieldGoal"
		) {
			formation =
				choice(
					formations
						.fieldGoal,
				);
		} else if (
			playType === "punt"
		) {
			formation =
				choice(
					formations.punt,
				);
		} else if (
			playType ===
			"kickoff"
		) {
			formation =
				choice(
					formations
						.kickoff,
				);
		} else {
			throw new Error(
				`Unknown playType "${playType}"`,
			);
		}

		const sides = [
			"off",
			"def",
		] as const;

		for (
			const i of
				[0, 1] as const
		) {
			const t =
				i === 0
					? this.o
					: this.d;

			const side =
				sides[i];

			const pidsUsed =
				new Set<number>();

			this.playersOnField[
				t
			] = {};

			for (
				const pos of
					helpers.keys(
						formation[
							side
						],
					)
			) {
				const numPlayers =
					formation[
						side
					][pos]!;

				const FATIGUE_MODIFIER =
					pos === "WR"
						? 0.75
						: 1;

				const depth =
					getFormationDepth(
						this.team[
							t
						].depth[
							pos
						],
						formation,
						side,
						pos,
					);

				const players:
					PlayerGameSim[] =
						[];

				if (
					pos === "OL" &&
					numPlayers ===
						5 &&
					depth.length >=
						5
				) {
					const getOlBackup = (
						healthyOnly:
							boolean,
					) => {
						for (
							let depthIndex =
								5;
							depthIndex <
							depth.length;
							depthIndex++
						) {
							const p =
								depth[
									depthIndex
								]!;

							if (
								pidsUsed.has(
									p.id,
								)
							) {
								continue;
							}

							if (
								healthyOnly &&
								p.injured
							) {
								continue;
							}

							return p;
						}
					};

					for (
						let slotIndex =
							0;
						slotIndex <
						5;
						slotIndex++
					) {
						const starter =
							depth[
								slotIndex
							]!;

						let p:
							| PlayerGameSim
							| undefined;

						if (
							!starter
								.injured &&
							!pidsUsed.has(
								starter.id,
							)
						) {
							p =
								starter;
						} else {
							p =
								getOlBackup(
									true,
								);
						}

						if (
							!p &&
							!pidsUsed.has(
								starter.id,
							)
						) {
							p =
								starter;
						}

						if (!p) {
							p =
								getOlBackup(
									false,
								);
						}

						if (p) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				} else if (
					FATIGUE_POS.has(
						pos,
					)
				) {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						const p =
							depth[
								depthIndex
							]!;

						if (
							p.injured ||
							pidsUsed.has(
								p.id,
							)
						) {
							continue;
						}

						if (
							Math.random() <
							FATIGUE_MODIFIER *
								footballFatigue(
									p.stat
										.energy,
									p.injured,
								)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				} else {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						const p =
							depth[
								depthIndex
							]!;

						if (
							!p.injured &&
							!pidsUsed.has(
								p.id,
							)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}
				}

				this.playersOnField[
					t
				][pos] =
					players;

				if (
					players.length <
					numPlayers
				) {
					for (
						let depthIndex =
							0;
						depthIndex <
						depth.length;
						depthIndex++
					) {
						const p =
							depth[
								depthIndex
							]!;

						if (
							players.length >=
							numPlayers
						) {
							break;
						}

						if (
							!p.injured &&
							!pidsUsed.has(
								p.id,
							)
						) {
							players.push(
								p,
							);

							pidsUsed.add(
								p.id,
							);
						}
					}

					if (
						players.length <
						numPlayers
					) {
						for (
							let depthIndex =
								0;
							depthIndex <
							depth.length;
							depthIndex++
						) {
							const p =
								depth[
									depthIndex
								]!;

							if (
								players.length >=
								numPlayers
							) {
								break;
							}

							if (
								!pidsUsed.has(
									p.id,
								)
							) {
								players.push(
									p,
								);

								pidsUsed.add(
									p.id,
								);
							}
						}
					}
				}

				for (
					const p of
						this
							.playersOnField[
							t
						][pos]
				) {
					if (
						playType ===
						"starters"
					) {
						this.recordStat(
							t,
							p,
							"gs",
						);
					}

					this.recordStat(
						t,
						p,
						"gp",
					);
				}
			}
		}

		this.updateTeamCompositeRatings();

		/*
		 * Run concepts alter the efficiency of the blocking
		 * structure attacking the defense.
		 *
		 * The next call to updateTeamCompositeRatings resets
		 * these values, so modifiers never accumulate.
		 */
		if (
			this.currentOffensivePlayConcept
				?.type ===
			"run"
		) {
			const modifiers =
				getRunConceptExecutionModifiers(
					this.team[
						this.o
					],
					this
						.currentOffensivePlayConcept
						.concept,
				);

			this.team[
				this.o
			].compositeRating
				.runBlocking *=
				modifiers
					.offenseRunBlocking;

			this.team[
				this.d
			].compositeRating
				.runStopping *=
				modifiers
					.defenseRunStopping;
		}
	}

	probSack(
		qb: PlayerGameSim,
		pbw?: Map<
			PlayerGameSim,
			{
				type:
					| "OL"
					| "Other";
				won: boolean;
			}
		>,
	) {
		const base =
			super.probSack(
				qb,
				pbw,
			);

		const current =
			this
				.currentOffensivePlayConcept;

		if (
			current?.type !==
			"pass"
		) {
			return base;
		}

		const effects =
			getPassConceptEffects(
				current.concept,
			);

		return helpers.bound(
			base *
				effects
					.sackMultiplier,
			0,
			0.5,
		);
	}

	probComplete(
		qb: PlayerGameSim,
		target: PlayerGameSim,
		defender: PlayerGameSim,
	) {
		const base =
			super.probComplete(
				qb,
				target,
				defender,
			);

		const current =
			this
				.currentOffensivePlayConcept;

		if (
			current?.type !==
			"pass"
		) {
			return base;
		}

		const effects =
			getPassConceptEffects(
				current.concept,
			);

		return helpers.bound(
			base *
				effects
					.completionMultiplier,
			0,
			0.98,
		);
	}

	probInt(
		qb: PlayerGameSim,
		defender: PlayerGameSim,
	) {
		const base =
			super.probInt(
				qb,
				defender,
			);

		const current =
			this
				.currentOffensivePlayConcept;

		if (
			current?.type !==
			"pass"
		) {
			return base;
		}

		const effects =
			getPassConceptEffects(
				current.concept,
			);

		return helpers.bound(
			base *
				effects
					.interceptionMultiplier,
			0,
			0.2,
		);
	}

	probScramble(
		qb?: PlayerGameSim,
	) {
		const base =
			super.probScramble(
				qb,
			);

		const current =
			this
				.currentOffensivePlayConcept;

		if (
			current?.type !==
			"pass"
		) {
			return base;
		}

		const multiplier =
			current.concept ===
			"QUICK_GAME"
				? 0.55
				: current.concept ===
					  "DEEP_SHOT"
					? 1.2
					: current.concept ===
						  "PLAY_ACTION"
						? 1.1
						: current.concept ===
							  "SCREEN"
							? 0.35
							: 1;

		return helpers.bound(
			base *
				multiplier,
			0,
			0.6,
		);
	}

	doPass() {
		const o = this.o;
		const d = this.d;

		this.updatePlayersOnField(
			"pass",
		);

		const passConcept =
			this
				.currentOffensivePlayConcept
				?.type ===
			"pass"
				? this
						.currentOffensivePlayConcept
						.concept
				: "INTERMEDIATE";

		const conceptEffects =
			getPassConceptEffects(
				passConcept,
			);

		const penInfo =
			this.checkPenalties(
				"beforeSnap",
			);

		if (penInfo) {
			return 0;
		}

		const pbw = new Map<
			PlayerGameSim,
			{
				type:
					| "OL"
					| "Other";
				won: boolean;
			}
		>();

		const pbCounts = {
			aOL: 0,
			aOther: 0,
			wOL: 0,
			wOther: 0,
		};

		const addBlockAttempt = (
			p: PlayerGameSim,
			type:
				| "OL"
				| "Other",
			baselineRatio: number,
		) => {
			const ratio =
				p.compositeRating
					.passBlocking /
				this.team[d]
					.compositeRating
					.passRushing;

			const probWin =
				helpers.bound(
					(ratio -
						baselineRatio) *
						(0.45 /
							0.25) +
						0.5,
					0,
					0.96,
				);

			const won =
				Math.random() <
				probWin;

			pbw.set(
				p,
				{
					type,
					won,
				},
			);

			pbCounts[
				`a${type}`
			] += 1;

			if (won) {
				pbCounts[
					`w${type}`
				] += 1;
			}
		};

		const ol =
			this.playersOnField[
				o
			].OL;

		if (ol) {
			const passBlockBaselines = [
				1.03,
				0.99,
				0.98,
				0.99,
				1.02,
			];

			for (
				let i = 0;
				i < ol.length;
				i++
			) {
				addBlockAttempt(
					ol[i]!,
					"OL",
					passBlockBaselines[
						i
					] ?? 1,
				);
			}
		}

		const te =
			this.playersOnField[
				o
			].TE;

		if (te) {
			for (
				const p of te
			) {
				if (
					Math.random() <
					conceptEffects
						.teProtectionChance
				) {
					addBlockAttempt(
						p,
						"Other",
						0.75,
					);
				}
			}
		}

		const rb =
			this.playersOnField[
				o
			].RB;

		if (rb) {
			for (
				const p of rb
			) {
				if (
					Math.random() <
					conceptEffects
						.rbProtectionChance
				) {
					addBlockAttempt(
						p,
						"Other",
						0.5,
					);
				}
			}
		}

		const qb =
			this.getTopPlayerOnField(
				o,
				"QB",
			);

		this.currentPlay.addEvent(
			{
				type:
					"dropback",
				pbw,
			},
		);

		this.playByPlay.logEvent(
			{
				type:
					"dropback",
				clock:
					this.clock,
				names: [
					qb.name,
				],
				t: o,
			},
		);

		let dt =
			randInt(
				conceptEffects
					.clockMin,
				conceptEffects
					.clockMax,
			);

		if (
			Math.random() <
				0.75 &&
			Math.random() <
				this.probFumble(
					qb,
				)
		) {
			const yds =
				this.currentPlay
					.boundedYds(
						randInt(
							-1,
							-10,
						),
					);

			return (
				dt +
				this.doFumble(
					qb,
					yds,
				)
			);
		}

		const sack =
			Math.random() <
			this.probSack(
				qb,
				pbw,
			);

		if (sack) {
			return this.doSack(
				qb,
				pbw,
			);
		}

		if (
			this.probScramble(
				this.playersOnField[
					o
				].QB?.[0],
			) >
			Math.random()
		) {
			return this.doRun(
				true,
			);
		}

		const target =
			passConcept ===
				"SCREEN" &&
			(this.playersOnField[
				o
			].RB?.length ??
				0) >
				0 &&
			Math.random() <
				0.75
				? this.pickPlayer(
						o,
						"catching",
						[
							"RB",
						],
						2,
					)
				: passConcept ===
					  "SCREEN"
					? this.pickPlayer(
							o,
							"gettingOpen",
							[
								"WR",
							],
							1.75,
						)
					: passConcept ===
						  "DEEP_SHOT"
						? this.pickPlayer(
								o,
								"gettingOpen",
								[
									"WR",
									"TE",
								],
								2,
							)
						: passConcept ===
							  "QUICK_GAME"
							? this.pickPlayer(
									o,
									Math.random() <
										0.55
										? "catching"
										: "gettingOpen",
									[
										"WR",
										"TE",
										"RB",
									],
									1.75,
								)
							: passConcept ===
								  "PLAY_ACTION"
								? this.pickPlayer(
										o,
										"gettingOpen",
										[
											"WR",
											"TE",
											"RB",
										],
										1.75,
									)
								: this.pickPlayer(
										o,
										"gettingOpen",
										[
											"WR",
											"TE",
											"RB",
										],
										1.5,
									);

		const isRbTarget =
			this.playersOnField[
				o
			].RB?.includes(
				target,
			) ?? false;

		const rbFactor =
			isRbTarget &&
			passConcept !==
				"SCREEN" &&
			Math.random() <
				0.75
				? target
						.compositeRating
						.gettingOpen
				: 1;

		const protectionRatio =
			this.team[o]
				.compositeRating
				.passBlocking /
			this.team[d]
				.compositeRating
				.passRushing;

		let meanYds: number;
		let spreadYds: number;

		if (
			passConcept ===
			"QUICK_GAME"
		) {
			meanYds =
				helpers.bound(
					rbFactor *
						5.8 *
						protectionRatio,
					-5,
					45,
				);

			spreadYds =
				4.5;
		} else if (
			passConcept ===
			"DEEP_SHOT"
		) {
			meanYds =
				helpers.bound(
					rbFactor *
						16 *
						protectionRatio,
					-5,
					100,
				);

			spreadYds =
				10;
		} else if (
			passConcept ===
			"PLAY_ACTION"
		) {
			meanYds =
				helpers.bound(
					rbFactor *
						11.5 *
						protectionRatio,
					-5,
					80,
				);

			spreadYds =
				8;
		} else if (
			passConcept ===
			"SCREEN"
		) {
			const tackling =
				Math.max(
					0.05,
					this.team[d]
						.compositeRating
						.tackling,
				);

			meanYds =
				helpers.bound(
					6.5 *
						(this.team[
							o
						]
							.compositeRating
							.runBlocking /
							tackling),
					-3,
					45,
				);

			spreadYds =
				8.5;
		} else {
			meanYds =
				helpers.bound(
					rbFactor *
						9.5 *
						protectionRatio,
					-5,
					65,
				);

			spreadYds =
				7;
		}

		let ydsRaw =
			Math.round(
				truncGauss(
					meanYds,
					spreadYds,
					-5,
					100,
				),
			);

		if (
			passConcept ===
				"DEEP_SHOT" &&
			Math.random() <
				qb.compositeRating
					.passingDeep *
					0.08
		) {
			ydsRaw +=
				randInt(
					12,
					55,
				);
		} else if (
			passConcept ===
				"PLAY_ACTION" &&
			Math.random() <
				qb.compositeRating
					.passingDeep *
					0.04
		) {
			ydsRaw +=
				randInt(
					8,
					45,
				);
		} else if (
			passConcept ===
				"INTERMEDIATE" &&
			Math.random() <
				qb.compositeRating
					.passingDeep *
					0.02
		) {
			ydsRaw +=
				randInt(
					5,
					30,
				);
		}

		const speedScale =
			passConcept ===
				"SCREEN"
				? 9
				: passConcept ===
					  "DEEP_SHOT"
					? 8
					: passConcept ===
						  "QUICK_GAME"
						? 7
						: 6;

		ydsRaw +=
			Math.round(
				(
					target
						.compositeRating
						.speed -
					0.5
				) *
					speedScale,
			);

		const speedExplosiveChance =
			passConcept ===
				"SCREEN"
				? 0.03
				: passConcept ===
					  "QUICK_GAME"
					? 0.02
					: passConcept ===
						  "DEEP_SHOT"
						? 0.02
						: 0.015;

		if (
			Math.random() <
			target
				.compositeRating
				.speed *
				speedExplosiveChance
		) {
			ydsRaw +=
				randInt(
					0,
					passConcept ===
						"DEEP_SHOT"
						? 55
						: 40,
				);
		}

		if (
			ydsRaw < 0
		) {
			ydsRaw +=
				randInt(
					0,
					5,
				);
		}

		ydsRaw =
			Math.round(
				ydsRaw *
					g.get(
						"passYdsFactor",
					),
			);

		const yds =
			this.currentPlay
				.boundedYds(
					ydsRaw,
				);

		const defender =
			passConcept ===
			"DEEP_SHOT"
				? this.pickPlayer(
						d,
						"passCoverage",
						[
							"CB",
							"S",
						],
						2,
					)
				: passConcept ===
					  "QUICK_GAME"
					? this.pickPlayer(
							d,
							"passCoverage",
							[
								"CB",
								"LB",
								"S",
							],
							2,
						)
					: passConcept ===
						  "SCREEN"
						? this.pickPlayer(
								d,
								"passCoverage",
								[
									"LB",
									"CB",
									"S",
								],
								2,
							)
						: this.pickPlayer(
								d,
								"passCoverage",
								[
									"CB",
									"S",
									"LB",
								],
								2,
							);

		const complete =
			Math.random() <
			this.probComplete(
				qb,
				target,
				defender,
			);

		const interception =
			Math.random() <
			this.probInt(
				qb,
				defender,
			);

		this.checkPenalties(
			"pass",
			{
				ballCarrier:
					target,
				playYds:
					yds,
				incompletePass:
					!complete &&
					!interception,
			},
		);

		this.currentPlay.addEvent(
			{
				type: "pss",
				qb,
				target,
			},
		);

		if (interception) {
			dt +=
				this.doInterception(
					qb,
					yds,
					defender,
				);
		} else {
			dt +=
				Math.abs(
					yds,
				) / 20;

			if (complete) {
				const {
					td,
					safety,
				} =
					this.currentPlay
						.addEvent(
							{
								type:
									"pssCmp",
								qb,
								target,
								yds,
							},
						);

				const completeEvent = {
					type:
						"passComplete" as const,
					clock:
						this.clock,
					names: [
						qb.name,
						target.name,
					],
					safety,
					t: o,
					td,
					twoPointConversionTeam:
						this
							.twoPointConversionTeam,
					yds,
				};

				if (
					!td &&
					!safety &&
					Math.random() <
						this.probFumble(
							target,
						)
				) {
					this.playByPlay
						.logEvent(
							{
								totalPssTD:
									undefined,
								totalRecTD:
									undefined,
								...completeEvent,
							},
						);

					return (
						dt +
						this.doFumble(
							target,
							0,
						)
					);
				}

				if (td) {
					this.currentPlay
						.addEvent(
							{
								type:
									"pssTD",
								qb,
								target,
							},
						);
				}

				if (safety) {
					this.doSafety();
				}

				this.playByPlay
					.logEvent(
						{
							totalPssTD:
								this
									.allStarGame
									? undefined
									: qb
											.seasonStats[
											"pssTD"
										] +
										qb
											.stat[
											"pssTD"
										],
							totalRecTD:
								this
									.allStarGame
									? undefined
									: target
											.seasonStats[
											"recTD"
										] +
										target
											.stat[
											"recTD"
										],
							...completeEvent,
						},
					);

				if (
					!td &&
					!safety
				) {
					this.doTackle(
						{
							ydsFromScrimmage:
								yds,
						},
					);
				}
			} else {
				this.currentPlay
					.addEvent(
						{
							type:
								"pssInc",
							defender:
								Math.random() <
								0.28
									? defender
									: undefined,
						},
					);

				this.playByPlay
					.logEvent(
						{
							type:
								"passIncomplete",
							clock:
								this.clock,
							names: [
								qb.name,
								target.name,
							],
							t: o,
							yds,
						},
					);
			}
		}

		return dt;
	}
}

const GameSim = bySport<
	| typeof GameSimBaseball
	| typeof GameSimFootballRealism
	| typeof GameSimBasketball
	| typeof GameSimHockey
>({
	baseball:
		GameSimBaseball,
	basketball:
		GameSimBasketball,
	football:
		GameSimFootballRealism,
	hockey:
		GameSimHockey,
});

export default GameSim;