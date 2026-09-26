import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { FATIGUE_POS } from "../../common/constants.football.ts";
import { choice, randInt, truncGauss } from "../../common/random.ts";
import { bySport } from "../../common/sportFunctions.ts";
import { g, helpers } from "../util/index.ts";
import type { FunctionalRole } from "./player/roleOvr.football.ts";
import GameSimBaseball from "./GameSim.baseball/index.ts";
import GameSimBasketball from "./GameSim.basketball/index.ts";
import formations from "./GameSim.football/formations.ts";
import {
	getPassPressureLevel,
	getPassProtectionHelpFactor,
	getPassProtectionHelpTarget,
	getPassRushFreeRusherStrength,
	getPassRushMatchupStrength,
	getPassRushPlan,
	getRunBlockingComboHelpFactor,
	getRunBlockingPlan,
	getRunBlockSlotWeight,
	getRunDisruptionLevel,
	getRunExtraBlockWeight,
	getRunStopMatchupStrength,
} from "./GameSim.football/getCompositeFactor.ts";
import {
	chooseDefensivePlayConcept,
	getBaseDefensiveFront,
	getCoverageDefenderWeight,
	getFormationDepth,
	getOffensivePersonnelFit,
	getPassTargetWeight,
} from "./GameSim.football/getPlayers.ts";
import GameSimFootball from "./GameSim.football/index.ts";
import type {
	DefensivePlayConcept,
	Formation,
	OffensivePersonnel,
	OffensivePlayConcept,
	PassConcept,
	PlayerGameSim,
	RunConcept,
	RunDirection,
	TeamGameSim,
} from "./GameSim.football/types.ts";
import GameSimHockey from "./GameSim.hockey/index.ts";

const getCoachingDecisionExponent = (
	team: TeamGameSim,
): number => {
	const level =
		team.coachingLevel;

	if (
		level === undefined ||
		Number.isNaN(level)
	) {
		return 1;
	}

	const centered =
		level >= DEFAULT_LEVEL
			? (level - DEFAULT_LEVEL) /
				(100 - DEFAULT_LEVEL)
			: (level - DEFAULT_LEVEL) /
				(DEFAULT_LEVEL - 1);

	return helpers.bound(
		1 +
			0.28 *
				centered,
		0.72,
		1.28,
	);
};

const applyCoachingDecisionWeight = (
	team: TeamGameSim,
	weight: number,
): number => {
	const safeWeight =
		Math.max(
			0.0001,
			weight,
		);

	return (
		safeWeight **
		getCoachingDecisionExponent(
			team,
		)
	);
};

const footballFatigue = (energy: number, injured: boolean): number => {
	if (injured) {
		return 0;
	}

	return Math.min(1, energy + 0.05);
};

const applyBaseDefensiveFront = (
	formation: Formation,
	defense: TeamGameSim,
): Formation => {
	const defensiveFront = getBaseDefensiveFront(defense);

	if (defensiveFront === "BASE_3_4") {
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
	defense: TeamGameSim,
): Formation => {
	if (formation.offensivePersonnel === "11") {
		return formation;
	}

	return applyBaseDefensiveFront(formation, defense);
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
		weight =
			personnel === "11"
				? 5.5
				: personnel === "12"
					? 3.5
					: personnel === "21"
						? 2.25
						: 0.75;
	} else {
		weight =
			personnel === "11"
				? 2.5
				: personnel === "12"
					? 3.5
					: personnel === "21"
						? 4
						: 3;
	}

	if (toGo <= 2) {
		weight *=
			personnel === "11"
				? 0.75
				: personnel === "12"
					? 1.15
					: personnel === "21"
						? 1.25
						: 1.6;
	}

	if (toGo >= 7) {
		weight *=
			personnel === "11"
				? 1.55
				: personnel === "12"
					? 1.05
					: personnel === "21"
						? 0.8
						: 0.55;
	}

	if (down >= 3 && toGo >= 5) {
		weight *=
			personnel === "11"
				? 1.5
				: personnel === "12"
					? 1.05
					: personnel === "21"
						? 0.75
						: 0.45;
	}

	if (scrimmage >= 95) {
		weight *=
			personnel === "11"
				? 0.7
				: personnel === "12"
					? 1.2
					: personnel === "21"
						? 1.25
						: 1.75;
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
	const fits = new Map<OffensivePersonnel, number>();

	for (const formation of formations.normal) {
		const personnel = formation.offensivePersonnel;

		if (personnel === undefined) {
			continue;
		}

		const fit = getOffensivePersonnelFit(offense, personnel);

		if (fit !== undefined) {
			fits.set(personnel, fit);
		}
	}

	let averageFit: number | undefined;

	if (fits.size > 0) {
		let total = 0;

		for (const fit of fits.values()) {
			total += fit;
		}

		averageFit = total / fits.size;
	}

	return choice(formations.normal, (formation) => {
		const personnel = formation.offensivePersonnel;

		if (personnel === undefined) {
			return 0.01;
		}

		const situationWeight = getPersonnelSituationWeight(
			personnel,
			playType,
			down,
			toGo,
			scrimmage,
		);

		const fit = fits.get(personnel);

		const fitFactor =
			fit !== undefined && averageFit !== undefined
				? helpers.bound(1 + (fit - averageFit) / 50, 0.7, 1.3)
				: 1;

		return applyCoachingDecisionWeight(
			offense,
			situationWeight *
				fitFactor,
		);
	});
};

const RUN_CONCEPTS: RunConcept[] = [
	"INSIDE_ZONE",
	"OUTSIDE_ZONE",
	"POWER",
	"COUNTER",
	"DRAW",
	"READ_OPTION",
	"QB_POWER",
	"JET_SWEEP",
];

const PASS_CONCEPTS: PassConcept[] = [
	"QUICK_GAME",
	"INTERMEDIATE",
	"DEEP_SHOT",
	"PLAY_ACTION",
	"SCREEN",
];

const RUN_DIRECTIONS: RunDirection[] = [
	"LEFT",
	"MIDDLE",
	"RIGHT",
];

const averageDefined = (
	values: Array<number | undefined>,
): number | undefined => {
	const defined = values.filter(
		(value): value is number => value !== undefined,
	);

	if (defined.length === 0) {
		return undefined;
	}

	return defined.reduce((sum, value) => sum + value, 0) / defined.length;
};

const getBestRoleScore = (
	team: TeamGameSim,
	pos: "QB" | "RB" | "WR" | "TE" | "OL",
	roles: FunctionalRole[],
): number | undefined => {
	let best: number | undefined;

	for (const p of team.depth[pos]) {
		for (const role of roles) {
			const score = p.roleOvrs?.[role];

			if (
				score !== undefined &&
				(best === undefined || score > best)
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
	const value = team.compositeRating?.[rating];

	if (typeof value !== "number") {
		return undefined;
	}

	return helpers.bound(value * 100, 0, 100);
};

const getBestPlayerCompositeScore = (
	team: TeamGameSim,
	pos: "QB" | "RB" | "WR" | "TE" | "OL",
	rating: string,
): number | undefined => {
	let best: number | undefined;

	for (const p of team.depth[pos]) {
		const value = p.compositeRating?.[rating];

		if (
			typeof value === "number" &&
			(best === undefined || value * 100 > best)
		) {
			best = value * 100;
		}
	}

	return best;
};

const getRunConceptRosterScore = (
	team: TeamGameSim,
	concept: RunConcept,
): number | undefined => {
	if (concept === "INSIDE_ZONE") {
		return averageDefined([
			getBestRoleScore(team, "RB", ["RB_FEATURE"]),
			getBestRoleScore(team, "OL", ["LG", "C", "RG"]),
			getTeamCompositeScore(team, "runBlocking"),
		]);
	}

	if (concept === "OUTSIDE_ZONE") {
		return averageDefined([
			getBestRoleScore(team, "RB", ["RB_FEATURE", "RB_RECEIVING"]),
			getBestRoleScore(team, "OL", ["LT", "RT"]),
			getTeamCompositeScore(team, "rushing"),
		]);
	}

	if (concept === "POWER") {
		return averageDefined([
			getBestRoleScore(team, "RB", ["RB_POWER", "RB_SHORT_YARDAGE"]),
			getBestRoleScore(team, "OL", ["LG", "C", "RG"]),
			getTeamCompositeScore(team, "runBlocking"),
		]);
	}

	if (concept === "COUNTER") {
		return averageDefined([
			getBestRoleScore(team, "RB", ["RB_FEATURE", "RB_POWER"]),
			getBestRoleScore(team, "OL", ["LG", "RG"]),
			getTeamCompositeScore(team, "rushing"),
		]);
	}

	if (concept === "DRAW") {
		return averageDefined([
			getBestRoleScore(team, "RB", ["RB_THIRD_DOWN", "RB_RECEIVING"]),
			getBestRoleScore(team, "OL", ["LT", "RT"]),
			getTeamCompositeScore(team, "rushing"),
		]);
	}

	if (concept === "READ_OPTION") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_DUAL_THREAT", "QB_CREATOR"]),
			getBestRoleScore(team, "RB", ["RB_FEATURE"]),
			getTeamCompositeScore(team, "runBlocking"),
		]);
	}

	if (concept === "QB_POWER") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_DUAL_THREAT"]),
			getBestPlayerCompositeScore(team, "QB", "rushing"),
			getBestRoleScore(team, "OL", ["LG", "C", "RG"]),
			getTeamCompositeScore(team, "runBlocking"),
		]);
	}

	return averageDefined([
		getBestRoleScore(team, "WR", ["WR_Z", "WR_SLOT", "WR_DEEP_THREAT"]),
		getBestPlayerCompositeScore(team, "WR", "rushing"),
		getBestPlayerCompositeScore(team, "WR", "speed"),
		getTeamCompositeScore(team, "runBlocking"),
	]);
};

const getPassConceptRosterScore = (
	team: TeamGameSim,
	concept: PassConcept,
): number | undefined => {
	if (concept === "QUICK_GAME") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_POCKET", "QB_CREATOR"]),
			getBestRoleScore(team, "WR", ["WR_SLOT", "WR_POSSESSION"]),
			getTeamCompositeScore(team, "passingAccuracy"),
		]);
	}

	if (concept === "INTERMEDIATE") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_POCKET"]),
			getBestRoleScore(team, "WR", ["WR_X", "WR_Z", "WR_POSSESSION"]),
			getBestRoleScore(team, "TE", ["TE_RECEIVING"]),
			getTeamCompositeScore(team, "passingVision"),
		]);
	}

	if (concept === "DEEP_SHOT") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_POCKET", "QB_CREATOR"]),
			getBestRoleScore(team, "WR", ["WR_DEEP_THREAT"]),
			getTeamCompositeScore(team, "passingDeep"),
		]);
	}

	if (concept === "PLAY_ACTION") {
		return averageDefined([
			getBestRoleScore(team, "QB", ["QB_POCKET", "QB_CREATOR"]),
			getBestRoleScore(team, "RB", ["RB_FEATURE", "RB_POWER"]),
			getBestRoleScore(team, "TE", ["TE_RECEIVING"]),
			getTeamCompositeScore(team, "passingVision"),
		]);
	}

	return averageDefined([
		getBestRoleScore(team, "QB", ["QB_CREATOR", "QB_DUAL_THREAT"]),
		getBestRoleScore(team, "RB", ["RB_RECEIVING", "RB_THIRD_DOWN"]),
		getBestRoleScore(team, "WR", ["WR_SLOT"]),
		getTeamCompositeScore(team, "passingAccuracy"),
	]);
};

const getConceptRosterFactor = (score: number | undefined): number => {
	if (score === undefined) {
		return 1;
	}

	return helpers.bound(1 + (score - 50) / 150, 0.8, 1.2);
};

const getQbMobilityScore = (qb: PlayerGameSim): number => {
	const dualThreat = qb.roleOvrs?.QB_DUAL_THREAT;
	const rbOvr = qb.ovrs?.RB;

	const rushing =
		typeof qb.compositeRating?.rushing === "number"
			? qb.compositeRating.rushing * 100
			: undefined;

	return (
		averageDefined([
			dualThreat,
			typeof rbOvr === "number" ? rbOvr : undefined,
			rushing,
		]) ?? 0
	);
};

const getDesignedRunUsageFactor = (
	team: TeamGameSim,
	concept: RunConcept,
	qb?: PlayerGameSim,
): number => {
	if (
		concept !== "READ_OPTION" &&
		concept !== "QB_POWER" &&
		concept !== "JET_SWEEP"
	) {
		return 1;
	}

	if (concept === "JET_SWEEP") {
		const wrScore =
			averageDefined([
				getBestRoleScore(team, "WR", [
					"WR_Z",
					"WR_SLOT",
					"WR_DEEP_THREAT",
				]),
				getBestPlayerCompositeScore(team, "WR", "rushing"),
				getBestPlayerCompositeScore(team, "WR", "speed"),
			]) ?? 0;

		if (wrScore < 40) {
			return 0.05;
		}

		return helpers.bound(0.35 + (wrScore - 40) / 35, 0.1, 1.45);
	}

	let bestMobility = qb !== undefined ? getQbMobilityScore(qb) : 0;

	if (qb === undefined) {
		for (const depthQb of team.depth.QB) {
			bestMobility = Math.max(
				bestMobility,
				getQbMobilityScore(depthQb),
			);
		}
	}

	if (concept === "QB_POWER") {
		if (bestMobility < 52) {
			return 0.02;
		}

		return helpers.bound(0.15 + (bestMobility - 52) / 28, 0.05, 1.5);
	}

	if (bestMobility < 42) {
		return 0.04;
	}

	return helpers.bound(0.3 + (bestMobility - 42) / 35, 0.08, 1.5);
};

const getRunConceptSituationWeight = (
	concept: RunConcept,
	personnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight =
		concept === "INSIDE_ZONE"
			? 4.5
			: concept === "OUTSIDE_ZONE"
				? 3.5
				: concept === "POWER"
					? 3
					: concept === "COUNTER"
						? 2.5
						: concept === "DRAW"
							? 1.2
							: concept === "READ_OPTION"
								? 1.1
								: concept === "QB_POWER"
									? 0.45
									: 0.7;

	if (personnel === "11") {
		if (concept === "OUTSIDE_ZONE") {
			weight *= 1.2;
		} else if (concept === "DRAW") {
			weight *= 1.5;
		} else if (concept === "POWER") {
			weight *= 0.75;
		} else if (concept === "READ_OPTION") {
			weight *= 1.25;
		} else if (concept === "QB_POWER") {
			weight *= 0.65;
		} else if (concept === "JET_SWEEP") {
			weight *= 1.35;
		}
	} else if (personnel === "12") {
		if (concept === "INSIDE_ZONE") {
			weight *= 1.1;
		} else if (concept === "POWER") {
			weight *= 1.15;
		} else if (concept === "DRAW") {
			weight *= 0.8;
		} else if (concept === "READ_OPTION") {
			weight *= 1.1;
		} else if (concept === "QB_POWER") {
			weight *= 0.9;
		} else if (concept === "JET_SWEEP") {
			weight *= 0.75;
		}
	} else if (personnel === "21") {
		if (concept === "INSIDE_ZONE") {
			weight *= 1.15;
		} else if (concept === "POWER") {
			weight *= 1.35;
		} else if (concept === "COUNTER") {
			weight *= 1.2;
		} else if (concept === "DRAW") {
			weight *= 0.65;
		} else if (concept === "READ_OPTION") {
			weight *= 0.9;
		} else if (concept === "QB_POWER") {
			weight *= 1.1;
		} else if (concept === "JET_SWEEP") {
			weight *= 0.6;
		}
	} else {
		if (concept === "POWER") {
			weight *= 1.6;
		} else if (concept === "INSIDE_ZONE") {
			weight *= 1.25;
		} else if (concept === "COUNTER") {
			weight *= 1.2;
		} else if (concept === "OUTSIDE_ZONE") {
			weight *= 0.7;
		} else if (concept === "DRAW") {
			weight *= 0.4;
		} else if (concept === "READ_OPTION") {
			weight *= 0.65;
		} else if (concept === "QB_POWER") {
			weight *= 1.25;
		} else {
			weight *= 0.35;
		}
	}

	if (toGo <= 2) {
		if (concept === "POWER") {
			weight *= 2;
		} else if (concept === "INSIDE_ZONE") {
			weight *= 1.35;
		} else if (concept === "COUNTER") {
			weight *= 1.15;
		} else if (concept === "DRAW") {
			weight *= 0.4;
		} else if (concept === "READ_OPTION") {
			weight *= 1.25;
		} else if (concept === "QB_POWER") {
			weight *= 1.7;
		} else {
			weight *= 0.45;
		}
	}

	if (toGo >= 7) {
		if (concept === "DRAW") {
			weight *= 2;
		} else if (concept === "OUTSIDE_ZONE") {
			weight *= 1.1;
		} else if (concept === "POWER") {
			weight *= 0.6;
		} else if (concept === "COUNTER") {
			weight *= 0.75;
		} else if (concept === "READ_OPTION") {
			weight *= 1.25;
		} else if (concept === "QB_POWER") {
			weight *= 0.55;
		} else if (concept === "JET_SWEEP") {
			weight *= 1.15;
		}
	}

	if (down >= 3 && toGo >= 5) {
		if (concept === "DRAW") {
			weight *= 1.8;
		} else if (concept === "OUTSIDE_ZONE") {
			weight *= 1.1;
		} else if (concept === "POWER") {
			weight *= 0.5;
		} else if (concept === "READ_OPTION") {
			weight *= 1.15;
		} else if (concept === "QB_POWER") {
			weight *= 0.45;
		} else if (concept === "JET_SWEEP") {
			weight *= 1.15;
		}
	}

	if (scrimmage >= 95) {
		if (concept === "POWER") {
			weight *= 2.2;
		} else if (concept === "INSIDE_ZONE") {
			weight *= 1.5;
		} else if (concept === "COUNTER") {
			weight *= 1.1;
		} else if (concept === "OUTSIDE_ZONE") {
			weight *= 0.7;
		} else if (concept === "DRAW") {
			weight *= 0.3;
		} else if (concept === "READ_OPTION") {
			weight *= 1.25;
		} else if (concept === "QB_POWER") {
			weight *= 2;
		} else {
			weight *= 0.5;
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
		concept === "QUICK_GAME"
			? 4
			: concept === "INTERMEDIATE"
				? 4.5
				: concept === "DEEP_SHOT"
					? 2.3
					: concept === "PLAY_ACTION"
						? 2.5
						: 1.5;

	if (personnel === "11") {
		if (concept === "QUICK_GAME") {
			weight *= 1.2;
		} else if (concept === "INTERMEDIATE") {
			weight *= 1.15;
		} else if (concept === "DEEP_SHOT") {
			weight *= 1.3;
		} else if (concept === "PLAY_ACTION") {
			weight *= 0.85;
		} else {
			weight *= 1.15;
		}
	} else if (personnel === "12") {
		if (concept === "INTERMEDIATE") {
			weight *= 1.1;
		} else if (concept === "PLAY_ACTION") {
			weight *= 1.35;
		} else if (concept === "SCREEN") {
			weight *= 0.8;
		}
	} else if (personnel === "21") {
		if (concept === "PLAY_ACTION") {
			weight *= 1.5;
		} else if (concept === "SCREEN") {
			weight *= 1.2;
		} else if (concept === "DEEP_SHOT") {
			weight *= 0.75;
		} else if (concept === "QUICK_GAME") {
			weight *= 0.85;
		}
	} else {
		if (concept === "PLAY_ACTION") {
			weight *= 1.7;
		} else if (concept === "INTERMEDIATE") {
			weight *= 0.8;
		} else if (concept === "DEEP_SHOT") {
			weight *= 0.5;
		} else if (concept === "QUICK_GAME") {
			weight *= 0.7;
		} else {
			weight *= 0.75;
		}
	}

	if (toGo <= 3) {
		if (concept === "QUICK_GAME") {
			weight *= 1.4;
		} else if (concept === "SCREEN") {
			weight *= 1.3;
		} else if (concept === "DEEP_SHOT") {
			weight *= 0.6;
		} else if (concept === "PLAY_ACTION") {
			weight *= 1.1;
		}
	}

	if (toGo >= 10) {
		if (concept === "DEEP_SHOT") {
			weight *= 1.5;
		} else if (concept === "INTERMEDIATE") {
			weight *= 1.2;
		} else if (concept === "SCREEN") {
			weight *= 1.2;
		} else if (concept === "QUICK_GAME") {
			weight *= 0.7;
		} else {
			weight *= 0.8;
		}
	}

	if (down >= 3 && toGo >= 5) {
		if (concept === "INTERMEDIATE") {
			weight *= 1.25;
		} else if (concept === "DEEP_SHOT") {
			weight *= 1.3;
		} else if (concept === "SCREEN") {
			weight *= 0.9;
		} else if (concept === "PLAY_ACTION") {
			weight *= 0.65;
		}
	}

	if (scrimmage >= 95) {
		if (concept === "QUICK_GAME") {
			weight *= 1.2;
		} else if (concept === "PLAY_ACTION") {
			weight *= 1.5;
		} else if (concept === "DEEP_SHOT") {
			weight *= 0.5;
		} else if (concept === "SCREEN") {
			weight *= 0.8;
		}
	}

	return weight;
};

const RUN_DIRECTION_CONCEPT_WEIGHTS: Record<
	RunConcept,
	Record<RunDirection, number>
> = {
	INSIDE_ZONE: {
		LEFT: 0.9,
		MIDDLE: 1.55,
		RIGHT: 0.9,
	},
	OUTSIDE_ZONE: {
		LEFT: 1.45,
		MIDDLE: 0.2,
		RIGHT: 1.45,
	},
	POWER: {
		LEFT: 1.25,
		MIDDLE: 0.65,
		RIGHT: 1.25,
	},
	COUNTER: {
		LEFT: 1.35,
		MIDDLE: 0.35,
		RIGHT: 1.35,
	},
	DRAW: {
		LEFT: 0.55,
		MIDDLE: 1.6,
		RIGHT: 0.55,
	},
	READ_OPTION: {
		LEFT: 1.15,
		MIDDLE: 0.65,
		RIGHT: 1.15,
	},
	QB_POWER: {
		LEFT: 0.75,
		MIDDLE: 1.45,
		RIGHT: 0.75,
	},
	JET_SWEEP: {
		LEFT: 1.7,
		MIDDLE: 0.05,
		RIGHT: 1.7,
	},
};

const getRunDirectionOlScore = (
	team: TeamGameSim,
	direction: RunDirection,
): number | undefined => {
	const ol =
		team.depth.OL ?? [];

	const slots =
		direction === "LEFT"
			? [
					{
						index: 0,
						role: "LT" as FunctionalRole,
					},
					{
						index: 1,
						role: "LG" as FunctionalRole,
					},
				]
			: direction === "RIGHT"
				? [
						{
							index: 3,
							role: "RG" as FunctionalRole,
						},
						{
							index: 4,
							role: "RT" as FunctionalRole,
						},
					]
				: [
						{
							index: 1,
							role: "LG" as FunctionalRole,
						},
						{
							index: 2,
							role: "C" as FunctionalRole,
						},
						{
							index: 3,
							role: "RG" as FunctionalRole,
						},
					];

	const scores:
		number[] = [];

	for (
		const {
			index,
			role,
		} of slots
	) {
		const blocker =
			ol[index];

		if (!blocker) {
			continue;
		}

		const roleScore =
			blocker.roleOvrs?.[
				role
			];

		if (
			typeof roleScore ===
			"number"
		) {
			scores.push(
				roleScore,
			);
		} else if (
			typeof blocker
				.compositeRating
				.runBlocking ===
			"number"
		) {
			scores.push(
				blocker
					.compositeRating
					.runBlocking *
					100,
			);
		}
	}

	if (scores.length === 0) {
		return undefined;
	}

	return (
		scores.reduce(
			(sum, score) =>
				sum + score,
			0,
		) /
		scores.length
	);
};

const getRunDirectionRosterFactor = (
	team: TeamGameSim,
	direction: RunDirection,
): number => {
	const score =
		getRunDirectionOlScore(
			team,
			direction,
		);

	if (score === undefined) {
		return 1;
	}

	return helpers.bound(
		1 +
			(score - 50) /
				180,
		0.75,
		1.25,
	);
};

const chooseRunDirection = (
	team: TeamGameSim,
	concept: RunConcept,
): RunDirection => {
	return choice(
		RUN_DIRECTIONS,
		(direction) =>
			applyCoachingDecisionWeight(
				team,
				RUN_DIRECTION_CONCEPT_WEIGHTS[
					concept
				][direction] *
					getRunDirectionRosterFactor(
						team,
						direction,
					),
			),
	);
};

const chooseOffensivePlayConcept = (
	team: TeamGameSim,
	playType: "run" | "pass",
	personnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
	qb?: PlayerGameSim,
): OffensivePlayConcept => {
	if (playType === "run") {
		const concept = choice(
			RUN_CONCEPTS,
			(candidate) =>
				applyCoachingDecisionWeight(
					team,
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
						) *
						getDesignedRunUsageFactor(
							team,
							candidate,
							qb,
						),
				),
		);

		const direction =
			chooseRunDirection(
				team,
				concept,
			);

		return {
			type: "run",
			concept,
			direction,
		};
	}

	const concept = choice(
		PASS_CONCEPTS,
		(candidate) =>
			applyCoachingDecisionWeight(
				team,
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
	if (concept === "QUICK_GAME") {
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

	if (concept === "DEEP_SHOT") {
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

	if (concept === "PLAY_ACTION") {
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

	if (concept === "SCREEN") {
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

type PassPressureEffects = {
	completionMultiplier: number;
	interceptionMultiplier: number;
	scrambleMultiplier: number;
	yardageMultiplier: number;
	explosiveMultiplier: number;
};

const getEffectivePassPressure = (
	qb: PlayerGameSim,
	rawPressure: number,
): number => {
	const poise =
		(
			qb.compositeRating
				.passingVision +
			qb.compositeRating
				.avoidingSacks
		) /
		2;

	return helpers.bound(
		rawPressure *
			(
				1.15 -
					0.3 *
						poise
			),
		0,
		1,
	);
};

const getPassPressureEffects = (
	concept: PassConcept,
	pressureLevel: number,
): PassPressureEffects => {
	const pressure =
		helpers.bound(
			pressureLevel,
			0,
			1,
		);

	if (concept === "QUICK_GAME") {
		return {
			completionMultiplier:
				1 -
					0.1 *
						pressure,
			interceptionMultiplier:
				1 +
					0.08 *
						pressure,
			scrambleMultiplier:
				1 +
					0.55 *
						pressure,
			yardageMultiplier:
				1 -
					0.04 *
						pressure,
			explosiveMultiplier:
				1 -
					0.08 *
						pressure,
		};
	}

	if (concept === "DEEP_SHOT") {
		return {
			completionMultiplier:
				1 -
					0.24 *
						pressure,
			interceptionMultiplier:
				1 +
					0.28 *
						pressure,
			scrambleMultiplier:
				1 +
					1 *
						pressure,
			yardageMultiplier:
				1 -
					0.18 *
						pressure,
			explosiveMultiplier:
				1 -
					0.28 *
						pressure,
		};
	}

	if (concept === "PLAY_ACTION") {
		return {
			completionMultiplier:
				1 -
					0.18 *
						pressure,
			interceptionMultiplier:
				1 +
					0.18 *
						pressure,
			scrambleMultiplier:
				1 +
					0.85 *
						pressure,
			yardageMultiplier:
				1 -
					0.12 *
						pressure,
			explosiveMultiplier:
				1 -
					0.18 *
						pressure,
		};
	}

	if (concept === "SCREEN") {
		return {
			completionMultiplier:
				1 -
					0.06 *
						pressure,
			interceptionMultiplier:
				1 +
					0.04 *
						pressure,
			scrambleMultiplier:
				1 +
					0.25 *
						pressure,
			yardageMultiplier:
				1 -
					0.02 *
						pressure,
			explosiveMultiplier:
				1 -
					0.04 *
						pressure,
		};
	}

	return {
		completionMultiplier:
			1 -
				0.16 *
					pressure,
		interceptionMultiplier:
			1 +
				0.18 *
					pressure,
		scrambleMultiplier:
			1 +
				0.75 *
					pressure,
		yardageMultiplier:
			1 -
				0.09 *
					pressure,
		explosiveMultiplier:
			1 -
				0.14 *
					pressure,
	};
};

const getRunConceptExecutionModifiers = (
	team: TeamGameSim,
	concept: RunConcept,
): {
	offenseRunBlocking: number;
	defenseRunStopping: number;
} => {
	const score = getRunConceptRosterScore(team, concept);

	const fitFactor =
		score === undefined
			? 1
			: helpers.bound(1 + (score - 50) / 500, 0.95, 1.05);

	if (concept === "INSIDE_ZONE") {
		return {
			offenseRunBlocking: 1.02 * fitFactor,
			defenseRunStopping: 1.01,
		};
	}

	if (concept === "OUTSIDE_ZONE") {
		return {
			offenseRunBlocking: 0.99 * fitFactor,
			defenseRunStopping: 0.98,
		};
	}

	if (concept === "POWER") {
		return {
			offenseRunBlocking: 1.05 * fitFactor,
			defenseRunStopping: 1.04,
		};
	}

	if (concept === "COUNTER") {
		return {
			offenseRunBlocking: fitFactor,
			defenseRunStopping: 0.98,
		};
	}

	if (concept === "DRAW") {
		return {
			offenseRunBlocking: 0.96 * fitFactor,
			defenseRunStopping: 0.93,
		};
	}

	if (concept === "READ_OPTION") {
		return {
			offenseRunBlocking: fitFactor,
			defenseRunStopping: 0.96,
		};
	}

	if (concept === "QB_POWER") {
		return {
			offenseRunBlocking: 1.04 * fitFactor,
			defenseRunStopping: 1.03,
		};
	}

	return {
		offenseRunBlocking: 0.97 * fitFactor,
		defenseRunStopping: 0.95,
	};
};

const RUN_CARRIER_ROLES: Record<RunConcept, FunctionalRole[]> = {
	INSIDE_ZONE: ["RB_FEATURE", "RB_POWER"],
	OUTSIDE_ZONE: ["RB_FEATURE", "RB_RECEIVING"],
	POWER: ["RB_POWER", "RB_SHORT_YARDAGE"],
	COUNTER: ["RB_FEATURE", "RB_POWER"],
	DRAW: ["RB_THIRD_DOWN", "RB_RECEIVING"],
	READ_OPTION: [
		"QB_DUAL_THREAT",
		"QB_CREATOR",
		"RB_FEATURE",
		"RB_RECEIVING",
	],
	QB_POWER: ["QB_DUAL_THREAT", "QB_CREATOR"],
	JET_SWEEP: ["WR_Z", "WR_SLOT", "WR_DEEP_THREAT"],
};

const getRunCarrierWeight = (
	p: PlayerGameSim,
	concept: RunConcept,
): number => {
	let bestRoleScore: number | undefined;

	for (const role of RUN_CARRIER_ROLES[concept]) {
		const score = p.roleOvrs?.[role];

		if (
			score !== undefined &&
			(bestRoleScore === undefined || score > bestRoleScore)
		) {
			bestRoleScore = score;
		}
	}

	const roleFactor =
		bestRoleScore === undefined
			? 1
			: helpers.bound(
					0.75 + (bestRoleScore / 100) * 0.75,
					0.75,
					1.5,
				);

	const rushing = Math.max(
		0.05,
		p.compositeRating.rushing,
	);

	const energy = helpers.bound(
		p.stat.energy ?? 1,
		0.25,
		1,
	);

	return rushing ** 1.5 * roleFactor * energy;
};

const getReadOptionKeepProbability = (
	qb: PlayerGameSim,
): number => {
	const mobility = getQbMobilityScore(qb);

	return helpers.bound(
		0.06 + Math.max(0, mobility - 40) / 75,
		0.05,
		0.62,
	);
};

type RunConceptEffects = {
	meanMultiplier: number;
	spreadYds: number;
	minYds: number;
	maxYds: number;
	explosiveChance: number;
	explosiveMax: number;
	teBlockChance: number;
	extraRbBlockChance: number;
	wrBlockChance: number;
	olBaselines: number[];
	clockMin: number;
	clockMax: number;
};

const getRunConceptEffects = (
	concept: RunConcept,
): RunConceptEffects => {
	if (concept === "INSIDE_ZONE") {
		return {
			meanMultiplier: 1.02,
			spreadYds: 4.5,
			minYds: -4,
			maxYds: 15,
			explosiveChance: 0.006,
			explosiveMax: 35,
			teBlockChance: 0.78,
			extraRbBlockChance: 0.25,
			wrBlockChance: 0.08,
			olBaselines: [1, 0.98, 0.96, 0.98, 1],
			clockMin: 2,
			clockMax: 4,
		};
	}

	if (concept === "OUTSIDE_ZONE") {
		return {
			meanMultiplier: 0.98,
			spreadYds: 6.5,
			minYds: -5,
			maxYds: 18,
			explosiveChance: 0.014,
			explosiveMax: 55,
			teBlockChance: 0.65,
			extraRbBlockChance: 0.2,
			wrBlockChance: 0.28,
			olBaselines: [0.98, 1.01, 1.03, 1.01, 0.98],
			clockMin: 2,
			clockMax: 4,
		};
	}

	if (concept === "POWER") {
		return {
			meanMultiplier: 1.04,
			spreadYds: 3.8,
			minYds: -3,
			maxYds: 12,
			explosiveChance: 0.004,
			explosiveMax: 25,
			teBlockChance: 0.9,
			extraRbBlockChance: 0.65,
			wrBlockChance: 0.05,
			olBaselines: [1.01, 0.97, 0.98, 0.97, 1.01],
			clockMin: 3,
			clockMax: 5,
		};
	}

	if (concept === "COUNTER") {
		return {
			meanMultiplier: 1,
			spreadYds: 6,
			minYds: -5,
			maxYds: 18,
			explosiveChance: 0.012,
			explosiveMax: 50,
			teBlockChance: 0.8,
			extraRbBlockChance: 0.4,
			wrBlockChance: 0.15,
			olBaselines: [1.02, 0.97, 1, 0.97, 1.02],
			clockMin: 3,
			clockMax: 5,
		};
	}

	if (concept === "DRAW") {
		return {
			meanMultiplier: 0.95,
			spreadYds: 7,
			minYds: -5,
			maxYds: 20,
			explosiveChance: 0.015,
			explosiveMax: 45,
			teBlockChance: 0.4,
			extraRbBlockChance: 0.1,
			wrBlockChance: 0.12,
			olBaselines: [1.02, 1, 1, 1, 1.02],
			clockMin: 2,
			clockMax: 4,
		};
	}

	if (concept === "READ_OPTION") {
		return {
			meanMultiplier: 1,
			spreadYds: 6.5,
			minYds: -5,
			maxYds: 20,
			explosiveChance: 0.017,
			explosiveMax: 55,
			teBlockChance: 0.65,
			extraRbBlockChance: 0,
			wrBlockChance: 0.22,
			olBaselines: [0.99, 1, 1, 1, 0.99],
			clockMin: 2,
			clockMax: 4,
		};
	}

	if (concept === "QB_POWER") {
		return {
			meanMultiplier: 1.02,
			spreadYds: 4.5,
			minYds: -4,
			maxYds: 14,
			explosiveChance: 0.009,
			explosiveMax: 32,
			teBlockChance: 0.88,
			extraRbBlockChance: 0.7,
			wrBlockChance: 0.08,
			olBaselines: [1.02, 0.97, 0.97, 0.97, 1.02],
			clockMin: 3,
			clockMax: 5,
		};
	}

	return {
		meanMultiplier: 0.96,
		spreadYds: 7.5,
		minYds: -6,
		maxYds: 20,
		explosiveChance: 0.022,
		explosiveMax: 60,
		teBlockChance: 0.62,
		extraRbBlockChance: 0.12,
		wrBlockChance: 0.72,
		olBaselines: [0.96, 1.02, 1.04, 1.02, 0.96],
		clockMin: 2,
		clockMax: 4,
	};
};

type DefensivePassEffects = {
	sackMultiplier: number;
	completionMultiplier: number;
	interceptionMultiplier: number;
	yardageMultiplier: number;
	explosiveMultiplier: number;
	scrambleMultiplier: number;
};

const getDefensivePassEffects = (
	defenseConcept: DefensivePlayConcept | undefined,
	passConcept: PassConcept,
): DefensivePassEffects => {
	if (
		defenseConcept === undefined ||
		defenseConcept === "BASE"
	) {
		return {
			sackMultiplier: 1,
			completionMultiplier: 1,
			interceptionMultiplier: 1,
			yardageMultiplier: 1,
			explosiveMultiplier: 1,
			scrambleMultiplier: 1,
		};
	}

	if (defenseConcept === "MAN_PRESS") {
		return {
			sackMultiplier: 1.03,
			completionMultiplier:
				passConcept === "QUICK_GAME"
					? 0.93
					: passConcept === "DEEP_SHOT"
						? 1.04
						: 0.96,
			interceptionMultiplier: 1.04,
			yardageMultiplier:
				passConcept === "DEEP_SHOT"
					? 1.1
					: passConcept === "QUICK_GAME"
						? 0.95
						: 1,
			explosiveMultiplier:
				passConcept === "DEEP_SHOT" ? 1.18 : 0.95,
			scrambleMultiplier: 0.95,
		};
	}

	if (defenseConcept === "COVER_1") {
		return {
			sackMultiplier: 1.05,
			completionMultiplier:
				passConcept === "DEEP_SHOT" ? 1.01 : 0.97,
			interceptionMultiplier: 1.05,
			yardageMultiplier:
				passConcept === "DEEP_SHOT" ? 1.05 : 0.98,
			explosiveMultiplier:
				passConcept === "DEEP_SHOT" ? 1.1 : 0.98,
			scrambleMultiplier: 0.9,
		};
	}

	if (defenseConcept === "COVER_2") {
		return {
			sackMultiplier: 0.98,
			completionMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.91
					: passConcept === "QUICK_GAME" ||
						  passConcept === "SCREEN"
						? 1.05
						: 0.98,
			interceptionMultiplier: 1.03,
			yardageMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.82
					: passConcept === "SCREEN"
						? 1.08
						: passConcept === "QUICK_GAME"
							? 1.05
							: 0.96,
			explosiveMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.7
					: passConcept === "SCREEN"
						? 1.08
						: 0.95,
			scrambleMultiplier: 1.04,
		};
	}

	if (defenseConcept === "COVER_3") {
		return {
			sackMultiplier: 0.98,
			completionMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.93
					: passConcept === "QUICK_GAME"
						? 1.04
						: passConcept === "SCREEN"
							? 1.03
							: 0.97,
			interceptionMultiplier: 1.04,
			yardageMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.88
					: passConcept === "QUICK_GAME"
						? 1.04
						: passConcept === "SCREEN"
							? 1.05
							: 0.97,
			explosiveMultiplier:
				passConcept === "DEEP_SHOT" ? 0.78 : 0.96,
			scrambleMultiplier: 1,
		};
	}

	if (defenseConcept === "COVER_4") {
		return {
			sackMultiplier: 0.94,
			completionMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.86
					: passConcept === "QUICK_GAME"
						? 1.1
						: passConcept === "SCREEN"
							? 1.08
							: passConcept === "INTERMEDIATE"
								? 1.02
								: 0.98,
			interceptionMultiplier: 1.02,
			yardageMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.72
					: passConcept === "QUICK_GAME"
						? 1.1
						: passConcept === "SCREEN"
							? 1.12
							: passConcept === "INTERMEDIATE"
								? 1.04
								: 0.94,
			explosiveMultiplier:
				passConcept === "DEEP_SHOT"
					? 0.55
					: passConcept === "SCREEN"
						? 1.12
						: passConcept === "QUICK_GAME"
							? 1.08
							: 0.9,
			scrambleMultiplier: 1.08,
		};
	}

	if (defenseConcept === "BLITZ") {
		return {
			sackMultiplier: 1.35,
			completionMultiplier:
				passConcept === "SCREEN"
					? 1.12
					: passConcept === "PLAY_ACTION"
						? 1.08
						: passConcept === "QUICK_GAME"
							? 1.06
							: passConcept === "DEEP_SHOT"
								? 0.98
								: 1,
			interceptionMultiplier: 0.96,
			yardageMultiplier:
				passConcept === "SCREEN"
					? 1.22
					: passConcept === "PLAY_ACTION"
						? 1.16
						: passConcept === "DEEP_SHOT"
							? 1.12
							: passConcept === "QUICK_GAME"
								? 1.06
								: 1.05,
			explosiveMultiplier: 1.22,
			scrambleMultiplier: 1.08,
		};
	}

	if (defenseConcept === "RUN_BLITZ") {
		return {
			sackMultiplier: 1.06,
			completionMultiplier:
				passConcept === "PLAY_ACTION"
					? 1.15
					: passConcept === "SCREEN"
						? 1.1
						: 1.08,
			interceptionMultiplier: 0.96,
			yardageMultiplier:
				passConcept === "PLAY_ACTION"
					? 1.22
					: passConcept === "SCREEN"
						? 1.15
						: 1.08,
			explosiveMultiplier:
				passConcept === "PLAY_ACTION"
					? 1.32
					: passConcept === "SCREEN"
						? 1.18
						: 1.1,
			scrambleMultiplier: 0.9,
		};
	}

	return {
		sackMultiplier: 0.92,
		completionMultiplier: 1,
		interceptionMultiplier: 1,
		yardageMultiplier: 1,
		explosiveMultiplier: 0.95,
		scrambleMultiplier: 0.55,
	};
};

type DefensiveRunEffects = {
	meanMultiplier: number;
	explosiveMultiplier: number;
};

const getDefensiveRunEffects = (
	defenseConcept: DefensivePlayConcept | undefined,
	runConcept: RunConcept,
): DefensiveRunEffects => {
	if (
		defenseConcept === undefined ||
		defenseConcept === "BASE"
	) {
		return {
			meanMultiplier: 1,
			explosiveMultiplier: 1,
		};
	}

	if (defenseConcept === "MAN_PRESS") {
		return {
			meanMultiplier:
				runConcept === "JET_SWEEP" ? 0.94 : 0.97,
			explosiveMultiplier: 0.96,
		};
	}

	if (defenseConcept === "COVER_1") {
		return {
			meanMultiplier: 0.96,
			explosiveMultiplier: 0.95,
		};
	}

	if (defenseConcept === "COVER_2") {
		return {
			meanMultiplier: 1.06,
			explosiveMultiplier: 1.08,
		};
	}

	if (defenseConcept === "COVER_3") {
		return {
			meanMultiplier: 1,
			explosiveMultiplier: 0.96,
		};
	}

	if (defenseConcept === "COVER_4") {
		return {
			meanMultiplier: 1.11,
			explosiveMultiplier: 1.15,
		};
	}

	if (defenseConcept === "BLITZ") {
		const misdirection =
			runConcept === "COUNTER" ||
			runConcept === "READ_OPTION" ||
			runConcept === "JET_SWEEP";

		return {
			meanMultiplier: misdirection
				? 1.07
				: runConcept === "DRAW"
					? 0.9
					: 0.94,
			explosiveMultiplier: misdirection ? 1.18 : 0.85,
		};
	}

	if (defenseConcept === "RUN_BLITZ") {
		if (
			runConcept === "INSIDE_ZONE" ||
			runConcept === "POWER" ||
			runConcept === "QB_POWER"
		) {
			return {
				meanMultiplier: 0.82,
				explosiveMultiplier: 0.68,
			};
		}

		if (runConcept === "OUTSIDE_ZONE") {
			return {
				meanMultiplier: 0.9,
				explosiveMultiplier: 0.82,
			};
		}

		if (runConcept === "DRAW") {
			return {
				meanMultiplier: 0.86,
				explosiveMultiplier: 0.8,
			};
		}

		return {
			meanMultiplier: 1,
			explosiveMultiplier: 1.08,
		};
	}

	if (runConcept === "OUTSIDE_ZONE") {
		return {
			meanMultiplier: 0.82,
			explosiveMultiplier: 0.65,
		};
	}

	if (runConcept === "READ_OPTION") {
		return {
			meanMultiplier: 0.78,
			explosiveMultiplier: 0.58,
		};
	}

	if (runConcept === "QB_POWER") {
		return {
			meanMultiplier: 0.9,
			explosiveMultiplier: 0.8,
		};
	}

	if (runConcept === "JET_SWEEP") {
		return {
			meanMultiplier: 0.76,
			explosiveMultiplier: 0.55,
		};
	}

	if (runConcept === "COUNTER") {
		return {
			meanMultiplier: 0.9,
			explosiveMultiplier: 0.8,
		};
	}

	if (
		runConcept === "INSIDE_ZONE" ||
		runConcept === "POWER"
	) {
		return {
			meanMultiplier: 1.06,
			explosiveMultiplier: 1.02,
		};
	}

	return {
		meanMultiplier: 1,
		explosiveMultiplier: 1,
	};
};

const getDefensiveScrambleYardsMultiplier = (
	concept: DefensivePlayConcept | undefined,
): number => {
	if (concept === "EDGE_CONTAIN") {
		return 0.72;
	}

	if (concept === "RUN_BLITZ") {
		return 0.85;
	}

	if (concept === "COVER_1") {
		return 0.9;
	}

	if (concept === "BLITZ") {
		return 1.1;
	}

	if (concept === "COVER_4") {
		return 1.08;
	}

	return 1;
};

class GameSimFootballRealism extends GameSimFootball {
	currentPassPressureLevel = 0;

	currentFreePassRushers:
		PlayerGameSim[] = [];

	currentPassProtectionMatchups:
		| Map<PlayerGameSim, PlayerGameSim>
		| undefined;

	currentDefensivePlayConcept:
		| DefensivePlayConcept
		| undefined;

	currentOffensivePlayConcept:
		| OffensivePlayConcept
		| undefined;

	override updatePlayersOnField(
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

		let normalPlayType:
			| "run"
			| "pass"
			| undefined;

		let personnelForConcept:
			| OffensivePersonnel
			| undefined;

		this.currentPassPressureLevel =
			0;

		this.currentFreePassRushers =
			[];

		this.currentPassProtectionMatchups =
			undefined;

		this.currentDefensivePlayConcept =
			undefined;

		this.currentOffensivePlayConcept =
			undefined;

		if (playType === "starters") {
			formation = applyBaseDefensiveFront(
				formations.normal[0]!,
				this.team[this.d],
			);
		} else if (playType === "startersFake") {
			formation = formations.normal[0]!;
		} else if (
			playType === "run" ||
			playType === "pass"
		) {
			const offensiveFormation =
				chooseOffensiveFormation(
					this.team[this.o],
					playType,
					this.down,
					this.toGo,
					this.scrimmage,
				);

			normalPlayType = playType;
			personnelForConcept =
				offensiveFormation.offensivePersonnel;

			formation = getNormalFormation(
				offensiveFormation,
				this.team[this.d],
			);
		} else if (
			playType === "extraPoint" ||
			playType === "fieldGoal"
		) {
			formation = choice(
				formations.fieldGoal,
			);
		} else if (playType === "punt") {
			formation = choice(
				formations.punt,
			);
		} else if (playType === "kickoff") {
			formation = choice(
				formations.kickoff,
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

		for (const i of [0, 1] as const) {
			const t =
				i === 0
					? this.o
					: this.d;

			const side = sides[i];

			const pidsUsed =
				new Set<number>();

			this.playersOnField[t] =
				{};

			for (
				const pos of helpers.keys(
					formation[side],
				)
			) {
				const numPlayers =
					formation[side][pos]!;

				const FATIGUE_MODIFIER =
					pos === "WR"
						? 0.75
						: 1;

				const depth =
					getFormationDepth(
						this.team[t].depth[pos],
						formation,
						side,
						pos,
					);

				const players:
					PlayerGameSim[] = [];

				if (
					pos === "OL" &&
					numPlayers === 5 &&
					depth.length >= 5
				) {
					const getOlBackup = (
						healthyOnly:
							boolean,
					) => {
						for (
							let depthIndex = 5;
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
						let slotIndex = 0;
						slotIndex < 5;
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
							!starter.injured &&
							!pidsUsed.has(
								starter.id,
							)
						) {
							p = starter;
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
							p = starter;
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
						let depthIndex = 0;
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
						let depthIndex = 0;
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

				this.playersOnField[t][pos] =
					players;

				if (
					players.length <
					numPlayers
				) {
					for (
						let depthIndex = 0;
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
							let depthIndex = 0;
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

		if (
			normalPlayType !==
				undefined &&
			personnelForConcept !==
				undefined
		) {
			this.currentDefensivePlayConcept =
				chooseDefensivePlayConcept(
					this.team[
						this.d
					],
					personnelForConcept,
					this.down,
					this.toGo,
					this.scrimmage,
				);

			this.currentOffensivePlayConcept =
				chooseOffensivePlayConcept(
					this.team[
						this.o
					],
					normalPlayType,
					personnelForConcept,
					this.down,
					this.toGo,
					this.scrimmage,
					this.playersOnField[
						this.o
					].QB?.[0],
				);
		}

		if (
			this
				.currentOffensivePlayConcept
				?.type === "run"
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

	override doRun(
		qbScramble:
			boolean = false,
	) {
		const o = this.o;
		const d = this.d;

		let runConcept:
			| RunConcept
			| undefined;

		let runDirection:
			| RunDirection
			| undefined;

		if (!qbScramble) {
			this.updatePlayersOnField(
				"run",
			);

			const penInfo =
				this.checkPenalties(
					"beforeSnap",
				);

			if (penInfo) {
				return 0;
			}

			runConcept =
				this
					.currentOffensivePlayConcept
					?.type === "run"
					? this
							.currentOffensivePlayConcept
							.concept
					: "INSIDE_ZONE";

			runDirection =
				this
					.currentOffensivePlayConcept
					?.type === "run"
					? this
							.currentOffensivePlayConcept
							.direction ??
						"MIDDLE"
					: "MIDDLE";
		}

		const runEffects =
			runConcept !== undefined
				? getRunConceptEffects(
						runConcept,
					)
				: undefined;

		const defensiveRunEffects =
			runConcept !== undefined
				? getDefensiveRunEffects(
						this
							.currentDefensivePlayConcept,
						runConcept,
					)
				: {
						meanMultiplier:
							1,
						explosiveMultiplier:
							1,
					};

		let rbw:
			| Map<
					PlayerGameSim,
					{
						type:
							| "OL"
							| "Other";
						won: boolean;
					}
			  >
			| undefined;

		let runBlockingMatchups:
			| Map<
					PlayerGameSim,
					PlayerGameSim
			  >
			| undefined;

		const qb =
			this.getTopPlayerOnField(
				o,
				"QB",
			);

		const rbs =
			this.playersOnField[
				o
			].RB ?? [];

		const getPreferredRb =
			() =>
				rbs.length > 0 &&
				runConcept !==
					undefined
					? choice(
							rbs,
							(
								candidate,
							) =>
								getRunCarrierWeight(
									candidate,
									runConcept!,
								),
						)
					: undefined;

		let p:
			PlayerGameSim;

		if (qbScramble) {
			p = qb;
		} else if (
			runConcept ===
				"QB_POWER"
		) {
			p = qb;
		} else if (
			runConcept ===
				"JET_SWEEP"
		) {
			const wrs =
				this.playersOnField[
					o
				].WR ?? [];

			p =
				wrs.length > 0
					? choice(
							wrs,
							(
								candidate,
							) =>
								getRunCarrierWeight(
									candidate,
									"JET_SWEEP",
								),
						)
					: getPreferredRb() ??
						qb;
		} else if (
			runConcept ===
				"READ_OPTION"
		) {
			const rb =
				getPreferredRb();

			p =
				rb === undefined ||
				Math.random() <
					getReadOptionKeepProbability(
						qb,
					)
					? qb
					: rb;
		} else {
			p =
				getPreferredRb() ??
				qb;
		}

		if (
			!qbScramble &&
			runEffects &&
			runConcept !==
				undefined
		) {
			rbw =
				new Map();

			const runBlockingPlan =
				getRunBlockingPlan(
					this.playersOnField[
						o
					],
					this.playersOnField[
						d
					],
					runConcept,
					runDirection ??
						"MIDDLE",
				);

			runBlockingMatchups =
				runBlockingPlan.matchups;

			const runBlockingComboBonuses =
				new Map<
					PlayerGameSim,
					number
				>();

			const runBlockingComboHelperPenalties =
				new Map<
					PlayerGameSim,
					number
				>();

			for (
				const [
					target,
					helpersForTarget,
				] of runBlockingPlan
					.comboAssignments
			) {
				let bonus = 0;

				for (
					const helper of
						helpersForTarget
				) {
					const helpFactor =
						getRunBlockingComboHelpFactor(
							helper,
							runConcept,
						);

					bonus +=
						helpFactor;

					runBlockingComboHelperPenalties.set(
						helper,
						Math.min(
							0.08,
							helpFactor *
								0.55,
						),
					);
				}

				runBlockingComboBonuses.set(
					target,
					Math.min(
						0.18,
						bonus,
					),
				);
			}

			const addBlockAttempt = (
				blocker:
					PlayerGameSim,
				type:
					| "OL"
					| "Other",
				baselineRatio:
					number,
				matchupStrength?:
					number,
			) => {
				const teamRunStopping =
					this.team[
						d
					].compositeRating
						.runStopping;

				const opponentStrength =
					matchupStrength ===
						undefined
						? teamRunStopping
						: 0.35 *
								teamRunStopping +
							0.65 *
								matchupStrength;

				const ratio =
					blocker
						.compositeRating
						.runBlocking /
					Math.max(
						0.05,
						opponentStrength,
					);

				const comboBonus =
					type === "OL"
						? runBlockingComboBonuses.get(
								blocker,
							) ?? 0
						: 0;

				const comboHelperPenalty =
					type === "OL"
						? runBlockingComboHelperPenalties.get(
								blocker,
							) ?? 0
						: 0;

				const probWin =
					helpers.bound(
						(ratio -
							baselineRatio) *
							(0.65 /
								0.25) +
							0.3 +
							comboBonus -
							comboHelperPenalty,
						0,
						0.98,
					);

				rbw!.set(
					blocker,
					{
						type,
						won:
							Math.random() <
								probWin,
					},
				);
			};

			const ol =
				this.playersOnField[
					o
				].OL;

			if (ol) {
				for (
					let i = 0;
					i < ol.length;
					i++
				) {
					const blocker =
						ol[i]!;

					const defender =
						runBlockingMatchups.get(
							blocker,
						);

					const matchupStrength =
						defender
							? getRunStopMatchupStrength(
									defender,
									i,
								)
							: undefined;

					addBlockAttempt(
						blocker,
						"OL",
						runEffects
							.olBaselines[
							i
						] ?? 1,
						matchupStrength,
					);
				}
			}

			const te =
				this.playersOnField[
					o
				].TE;

			if (te) {
				for (
					const blocker of te
				) {
					if (
						blocker !== p &&
						Math.random() <
							runEffects
								.teBlockChance
					) {
						addBlockAttempt(
							blocker,
							"Other",
							0.85,
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
					const blocker of rb
				) {
					if (
						blocker !== p &&
						Math.random() <
							runEffects
								.extraRbBlockChance
					) {
						addBlockAttempt(
							blocker,
							"Other",
							0.6,
						);
					}
				}
			}

			const wr =
				this.playersOnField[
					o
				].WR;

			if (wr) {
				for (
					const blocker of wr
				) {
					if (
						blocker !== p &&
						Math.random() <
							runEffects
								.wrBlockChance
					) {
						addBlockAttempt(
							blocker,
							"Other",
							0.72,
						);
					}
				}
			}
		}

		let runBlockingExecutionMultiplier =
			1;

		if (
			!qbScramble &&
			rbw &&
			runConcept !==
				undefined
		) {
			const ol =
				this.playersOnField[
					o
				].OL ?? [];

			const te =
				this.playersOnField[
					o
				].TE ?? [];

			const rb =
				this.playersOnField[
					o
				].RB ?? [];

			const wr =
				this.playersOnField[
					o
				].WR ?? [];

			let weightedWins = 0;
			let totalWeight = 0;

			for (
				const [
					blocker,
					result,
				] of rbw
			) {
				let weight:
					number;

				if (
					result.type ===
						"OL"
				) {
					const slotIndex =
						ol.indexOf(
							blocker,
						);

					weight =
						getRunBlockSlotWeight(
							runConcept,
							slotIndex,
							runDirection ??
								"MIDDLE",
						);
				} else if (
					te.includes(
						blocker,
					)
				) {
					weight =
						getRunExtraBlockWeight(
							runConcept,
							"TE",
						);
				} else if (
					rb.includes(
						blocker,
					)
				) {
					weight =
						getRunExtraBlockWeight(
							runConcept,
							"RB",
						);
				} else if (
					wr.includes(
						blocker,
					)
				) {
					weight =
						getRunExtraBlockWeight(
							runConcept,
							"WR",
						);
				} else {
					weight = 0.25;
				}

				totalWeight += weight;

				if (result.won) {
					weightedWins += weight;
				}
			}

			if (totalWeight > 0) {
				const winRate =
					weightedWins /
						totalWeight;

				runBlockingExecutionMultiplier =
					helpers.bound(
						1 +
							(winRate -
								0.5) *
								0.18,
						0.9,
						1.1,
					);
			}
		}

		let runDisruptionLevel =
			0;

		if (
			!qbScramble &&
			rbw &&
			runBlockingMatchups &&
			runConcept !==
				undefined
		) {
			runDisruptionLevel =
				getRunDisruptionLevel(
					this.playersOnField[
						o
					],
					rbw,
					runBlockingMatchups,
					runConcept,
					this.team[
						d
					].compositeRating
						.runStopping,
					runDirection ??
						"MIDDLE",
				);
		}

		this.playByPlay.logEvent({
			type: "handoff",
			clock: this.clock,
			t: o,
			names:
				p === qb
					? [qb.name]
					: [
							qb.name,
							p.name,
						],
		});

		const scrambleModifier =
			qbScramble
				? 3
				: 1;

		const defensiveScrambleYardsMultiplier =
			qbScramble
				? getDefensiveScrambleYardsMultiplier(
						this
							.currentDefensivePlayConcept,
					)
				: 1;

		const baseMeanYds =
			helpers.bound(
				(defensiveScrambleYardsMultiplier *
					scrambleModifier *
					runBlockingExecutionMultiplier *
					(3.5 *
						0.5 *
						(p
							.compositeRating
							.rushing +
							this.team[
								o
							]
								.compositeRating
								.runBlocking))) /
					this.team[
						d
					].compositeRating
						.runStopping,
				-5,
				15,
			);

		const disruptionMeanMultiplier =
			1 -
				0.08 *
					runDisruptionLevel;

		const meanYds =
			runEffects
				? helpers.bound(
						baseMeanYds *
							runEffects
								.meanMultiplier *
							defensiveRunEffects
								.meanMultiplier *
							disruptionMeanMultiplier,
						runEffects
							.minYds,
						runEffects
							.maxYds,
					)
				: baseMeanYds;

		const spreadYds =
			runEffects
				?.spreadYds ??
				6;

		const minYds =
			runEffects?.minYds ??
				-5;

		const maxYds =
			runEffects?.maxYds ??
				15;

		let ydsRaw =
			Math.round(
				truncGauss(
					meanYds,
					spreadYds,
					minYds,
					maxYds,
				),
			);

		const disruptionStuffChance =
			qbScramble
				? 0
				: 0.16 *
					runDisruptionLevel **
						1.5;

		let runStuffed =
			false;

		if (
			Math.random() <
				disruptionStuffChance
		) {
			runStuffed =
				true;

			ydsRaw =
				Math.min(
					ydsRaw,
					randInt(
						-4,
						1,
					),
				);
		}

		const disruptionExplosiveMultiplier =
			1 -
				0.5 *
					runDisruptionLevel;

		if (
			!runStuffed &&
			Math.random() <
				(runEffects
					?.explosiveChance ??
					0.01) *
					defensiveRunEffects
						.explosiveMultiplier *
					disruptionExplosiveMultiplier
		) {
			ydsRaw +=
				randInt(
					0,
					runEffects
						?.explosiveMax ??
						109,
				);
		}

		if (
			ydsRaw < 0 &&
			!runStuffed
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
						"rushYdsFactor",
					),
			);

		const yds =
			this.currentPlay
				.boundedYds(
					ydsRaw,
				);

		const dt =
			randInt(
				runEffects
					?.clockMin ??
						2,
				runEffects
					?.clockMax ??
						4,
			) +
				Math.abs(
					yds,
				) /
					10;

		this.checkPenalties(
			"run",
			{
				ballCarrier:
					p,
				playYds:
					yds,
			},
		);

		const {
			td,
			safety,
		} =
			this.currentPlay
				.addEvent(
					{
						type:
							"rus",
						p,
						yds,
						rbw,
					},
				);

		if (td) {
			this.currentPlay
				.addEvent(
					{
						type:
							"rusTD",
						p,
					},
				);
		} else if (safety) {
			this.doSafety();
		} else {
			this.doRunTackle({
				ydsFromScrimmage:
					yds,
				rbw,
				runBlockingMatchups,
				runConcept,
				runDirection,
			});
		}

		this.playByPlay.logEvent(
			{
				type: "run",
				clock:
					this.clock,
				names: [
					p.name,
				],
				totalRusTD:
					this
						.allStarGame
						? undefined
						: p
								.seasonStats[
								"rusTD"
							] +
							p.stat[
								"rusTD"
							],
				safety,
				t: o,
				td,
				twoPointConversionTeam:
					this
						.twoPointConversionTeam,
				yds,
			},
		);

		if (
			!td &&
			!safety &&
			Math.random() <
				this.probFumble(
					p,
				)
		) {
			this.awaitingAfterTouchdown =
				false;

			return (
				dt +
					this.doFumble(
						p,
						0,
					)
			);
		}

		return dt;
	}

	doRunTackle({
		ydsFromScrimmage,
		rbw,
		runBlockingMatchups,
		runConcept,
		runDirection,
	}: {
		ydsFromScrimmage:
			number;
		rbw:
			| Map<
					PlayerGameSim,
					{
						type:
							| "OL"
							| "Other";
						won: boolean;
					}
			  >
			| undefined;
		runBlockingMatchups:
			| Map<
					PlayerGameSim,
					PlayerGameSim
			  >
			| undefined;
		runConcept:
			| RunConcept
			| undefined;
		runDirection:
			| RunDirection
			| undefined;
	}) {
		if (
			!rbw ||
			!runBlockingMatchups ||
			runConcept ===
				undefined
		) {
			super.doTackle({
				ydsFromScrimmage,
			});
			return;
		}

		const o =
			this
				.currentPlay
				.state.current.o;

		const d =
			this
				.currentPlay
				.state.current.d;

		const ol =
			this.playersOnField[
				o
			].OL ?? [];

		const failedMatchups =
			Array.from(
				rbw.entries(),
			).flatMap(
				([
					blocker,
					result,
				]) => {
					if (
						result.type !==
							"OL" ||
						result.won
					) {
						return [];
					}

					const defender =
						runBlockingMatchups.get(
							blocker,
						);

					if (!defender) {
						return [];
					}

					const slotIndex =
						ol.indexOf(
							blocker,
						);

					if (slotIndex < 0) {
						return [];
					}

					const strength =
						getRunStopMatchupStrength(
							defender,
							slotIndex,
						);

					const laneWeight =
						getRunBlockSlotWeight(
							runConcept,
							slotIndex,
							runDirection ??
								"MIDDLE",
						);

					return [
						{
							defender,
							weight:
								Math.max(
									0.05,
									strength,
								) *
								Math.max(
									0.25,
									laneWeight,
								),
						},
					];
				},
			);

		if (
			failedMatchups.length ===
				0
		) {
			super.doTackle({
				ydsFromScrimmage,
			});
			return;
		}

		const directMatchupChance =
			ydsFromScrimmage <
				0
				? 0.88
				: ydsFromScrimmage <
						2
					? 0.72
					: ydsFromScrimmage <
							7
						? 0.38
						: ydsFromScrimmage <
								15
							? 0.12
							: 0.04;

		if (
			Math.random() >=
				directMatchupChance
		) {
			super.doTackle({
				ydsFromScrimmage,
			});
			return;
		}

		if (
			Math.random() >=
				0.9
		) {
			return;
		}

		const primary =
			choice(
				failedMatchups,
				(candidate) =>
					candidate
						.weight **
						2,
			).defender;

		const tacklers =
			new Set<
				PlayerGameSim
			>([
				primary,
			]);

		if (
			Math.random() <
				0.25
		) {
			tacklers.add(
				this.pickPlayer(
					d,
					"tackling",
					undefined,
					1.5,
				),
			);
		}

		this.currentPlay.addEvent({
			type: "tck",
			tacklers,
			loss:
				ydsFromScrimmage <
					0,
		});
	}

	override doSack(
		qb: PlayerGameSim,
		pbw: Map<
			PlayerGameSim,
			{
				type:
					| "OL"
					| "Other";
				won: boolean;
			}
		>,
	) {
		const {
			d,
			o,
		} =
			this.currentPlay
				.state.initial;

		const ol =
			this.playersOnField[
				o
			].OL ?? [];

		const failedBlocks =
			Array.from(
				pbw.entries(),
			).filter(
				([
					,
					{
						won,
					},
				]) =>
					!won,
			);

		const failedOlBlocks =
			failedBlocks.filter(
				([
					,
					{
						type,
					},
				]) =>
					type ===
						"OL",
			);

		const failedMatchups =
			failedBlocks.flatMap(
				([
					blocker,
				]) => {
					const rusher =
						this
							.currentPassProtectionMatchups
							?.get(
								blocker,
							);

					if (!rusher) {
						return [];
					}

					const slotIndex =
						ol.indexOf(
							blocker,
						);

					const strength =
						slotIndex >=
							0
							? getPassRushMatchupStrength(
									rusher,
									slotIndex,
								)
							: getPassRushFreeRusherStrength(
									rusher,
								);

					const matchupFactor =
						slotIndex === 0 ||
						slotIndex === 4
							? 1.15
							: slotIndex <
									0
								? 1.2
								: 1;

					return [
						{
							blocker,
							rusher,
							weight:
								Math.max(
									0.05,
									strength,
								) *
									matchupFactor,
						},
					];
				},
			);

		const directMatchupChance =
			this
				.currentDefensivePlayConcept ===
				"BLITZ"
				? 0.75
				: this
						.currentDefensivePlayConcept ===
						"RUN_BLITZ"
					? 0.82
					: 0.92;

		let p:
			PlayerGameSim;

		let sackAllowedBlocker:
			| PlayerGameSim
			| undefined;

		if (
			this
				.currentFreePassRushers
				.length >
				0 &&
			Math.random() <
				0.88
		) {
			p =
				choice(
					this
						.currentFreePassRushers,
					(rusher) =>
						getPassRushFreeRusherStrength(
							rusher,
						) **
							2,
				);
		} else if (
			failedMatchups.length >
				0 &&
			Math.random() <
				directMatchupChance
		) {
			const matchup =
				choice(
					failedMatchups,
					(candidate) =>
						candidate
							.weight **
							2,
				);

			p = matchup.rusher;

			if (
				ol.includes(
					matchup.blocker,
				)
			) {
				sackAllowedBlocker =
					matchup.blocker;
			}
		} else {
			p =
				this.pickPlayer(
					d,
					"passRushing",
					undefined,
					5,
				);

			const dl =
				this.playersOnField[
					d
				].DL;

			const lb =
				this.playersOnField[
					d
				].LB;

			if (
				(dl &&
					dl.includes(
						p,
					)) ||
				(lb &&
					lb.includes(
						p,
					))
			) {
				const lostBlockers =
					failedOlBlocks.map(
						([
							blocker,
						]) =>
							blocker,
					);

				if (
					lostBlockers.length >
						0
				) {
					sackAllowedBlocker =
						choice(
							lostBlockers,
						);
				}
			}
		}

		const ydsRaw =
			randInt(
				-1,
				-12,
			);

		const yds =
			this.currentPlay
				.boundedYds(
					ydsRaw,
				);

		const {
			safety,
		} =
			this.currentPlay
				.addEvent(
					{
						type:
							"sk",
						qb,
						p,
						ol:
							sackAllowedBlocker,
						yds,
					},
				);

		if (safety) {
			this.doSafety(
				p,
			);
		}

		this.playByPlay
			.logEvent(
				{
					type:
						"sack",
					clock:
						this.clock,
					names: [
						qb.name,
						p.name,
					],
					totalDefSk:
						this
							.allStarGame
							? undefined
							: p
									.seasonStats[
									"defSk"
								] +
								p.stat[
									"defSk"
								],
					safety,
					t:
						this
							.currentPlay
							.state
							.initial
							.o,
					yds,
				},
			);

		return randInt(
			3,
			8,
		);
	}

	override probSack(
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

		const defensiveEffects =
			getDefensivePassEffects(
				this
					.currentDefensivePlayConcept,
				current.concept,
			);

		let freeRusherSackBoost =
			0;

		for (
			const rusher of
				this
					.currentFreePassRushers
		) {
			const strength =
				getPassRushFreeRusherStrength(
					rusher,
				);

			const individualBoost =
				helpers.bound(
					0.035 +
						0.065 *
							strength,
					0.035,
					0.1,
				);

			freeRusherSackBoost =
				1 -
					(1 -
						freeRusherSackBoost) *
						(1 -
							individualBoost);
		}

		return helpers.bound(
			base *
				effects
					.sackMultiplier *
				defensiveEffects
					.sackMultiplier +
				freeRusherSackBoost *
					effects
						.sackMultiplier,
			0,
			0.5,
		);
	}

	override probComplete(
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

		const defensiveEffects =
			getDefensivePassEffects(
				this
					.currentDefensivePlayConcept,
				current.concept,
			);

		const pressureEffects =
			getPassPressureEffects(
				current.concept,
				getEffectivePassPressure(
					qb,
					this
						.currentPassPressureLevel,
				),
			);

		return helpers.bound(
			base *
				effects
					.completionMultiplier *
				defensiveEffects
					.completionMultiplier *
				pressureEffects
					.completionMultiplier,
			0,
			0.98,
		);
	}

	override probInt(
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

		const defensiveEffects =
			getDefensivePassEffects(
				this
					.currentDefensivePlayConcept,
				current.concept,
			);

		const pressureEffects =
			getPassPressureEffects(
				current.concept,
				getEffectivePassPressure(
					qb,
					this
						.currentPassPressureLevel,
				),
			);

		return helpers.bound(
			base *
				effects
					.interceptionMultiplier *
				defensiveEffects
					.interceptionMultiplier *
				pressureEffects
					.interceptionMultiplier,
			0,
			0.2,
		);
	}

	override probScramble(
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

		const defensiveEffects =
			getDefensivePassEffects(
				this
					.currentDefensivePlayConcept,
				current.concept,
			);

		const pressureEffects =
			getPassPressureEffects(
				current.concept,
				qb
					? getEffectivePassPressure(
							qb,
							this
								.currentPassPressureLevel,
						)
					: this
							.currentPassPressureLevel,
			);

		return helpers.bound(
			base *
				multiplier *
				defensiveEffects
					.scrambleMultiplier *
				pressureEffects
					.scrambleMultiplier,
			0,
			0.6,
		);
	}

	override doPass() {
		const o = this.o;
		const d = this.d;

		this.updatePlayersOnField(
			"pass",
		);

		const passConcept =
			this
				.currentOffensivePlayConcept
				?.type === "pass"
				? this
						.currentOffensivePlayConcept
						.concept
				: "INTERMEDIATE";

		const conceptEffects =
			getPassConceptEffects(
				passConcept,
			);

		const defensivePassEffects =
			getDefensivePassEffects(
				this
					.currentDefensivePlayConcept,
				passConcept,
			);

		const penInfo =
			this.checkPenalties(
				"beforeSnap",
			);

		if (penInfo) {
			return 0;
		}

		const pbw =
			new Map<
				PlayerGameSim,
				{
					type:
						| "OL"
						| "Other";
					won: boolean;
				}
			>();

		const passRushPlan =
			getPassRushPlan(
				this.playersOnField[
					o
				],
				this.playersOnField[
					d
				],
				this
					.currentDefensivePlayConcept ??
					"BASE",
			);

		const passProtectionMatchups =
			passRushPlan.matchups;

		const unaccountedExtraRushers =
			passRushPlan
				.extraRushers
				.slice();

		unaccountedExtraRushers.sort(
			(a, b) =>
				getPassRushFreeRusherStrength(
					b,
				) -
					getPassRushFreeRusherStrength(
						a,
					),
		);

		this.currentPassProtectionMatchups =
			passProtectionMatchups;

		const passProtectionHelpBonuses =
			new Map<
				PlayerGameSim,
				number
			>();

		const addProtectionHelp = (
			blocker: PlayerGameSim,
			helper: PlayerGameSim,
		) => {
			const previous =
				passProtectionHelpBonuses.get(
					blocker,
				) ?? 0;

			passProtectionHelpBonuses.set(
				blocker,
				Math.min(
					0.28,
					previous +
						getPassProtectionHelpFactor(
							helper,
						),
				),
			);
		};

		for (
			const [
				blocker,
				helpersForBlocker,
			] of passRushPlan
				.helpAssignments
		) {
			for (
				const helper of
					helpersForBlocker
			) {
				addProtectionHelp(
					blocker,
					helper,
				);
			}
		}

		const passProtectors =
			new Set<
				PlayerGameSim
			>();

		const addBlockAttempt = (
			p: PlayerGameSim,
			type:
				| "OL"
				| "Other",
			baselineRatio:
				number,
			matchupStrength?:
				number,
		) => {
			const teamPassRushing =
				this.team[
					d
				].compositeRating
					.passRushing;

			const opponentStrength =
				matchupStrength ===
					undefined
					? teamPassRushing
					: 0.35 *
							teamPassRushing +
						0.65 *
							matchupStrength;

			const ratio =
				p.compositeRating
					.passBlocking /
					Math.max(
						0.05,
						opponentStrength,
					);

			const helpBonus =
				passProtectionHelpBonuses.get(
					p,
				) ?? 0;

			const probWin =
				helpers.bound(
					(ratio -
						baselineRatio) *
						(0.45 /
							0.25) +
						0.5 +
						helpBonus,
					0,
					0.98,
				);

			pbw.set(
				p,
				{
					type,
					won:
						Math.random() <
							probWin,
				},
			);
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
				const blocker =
					ol[i]!;

				const defender =
					passProtectionMatchups.get(
						blocker,
					);

				if (!defender) {
					continue;
				}

				const matchupStrength =
					getPassRushMatchupStrength(
						defender,
						i,
					);

				addBlockAttempt(
					blocker,
					"OL",
					passBlockBaselines[
						i
					] ?? 1,
					matchupStrength,
				);
			}
		}

		const addExtraProtectionAttempt = (
			p: PlayerGameSim,
			type: "TE" | "RB",
			baselineRatio:
				number,
		) => {
			passProtectors.add(
				p,
			);

			const extraRusher =
				unaccountedExtraRushers.shift();

			if (extraRusher) {
				passProtectionMatchups.set(
					p,
					extraRusher,
				);

				addBlockAttempt(
					p,
					"Other",
					baselineRatio,
					getPassRushFreeRusherStrength(
						extraRusher,
					),
				);

				return;
			}

			const helpTarget =
				getPassProtectionHelpTarget(
					this.playersOnField[
						o
					],
					passProtectionMatchups,
					p,
					type,
				);

			if (helpTarget) {
				addProtectionHelp(
					helpTarget,
					p,
				);

				const existingResult =
					pbw.get(
						helpTarget,
					);

				if (
					existingResult &&
					!existingResult.won
				) {
					const defender =
						passProtectionMatchups.get(
							helpTarget,
						);

					const ol =
						this.playersOnField[
							o
						].OL ?? [];

					const slotIndex =
						ol.indexOf(
							helpTarget,
						);

					if (
						defender &&
						slotIndex >=
							0
					) {
						const teamPassRushing =
							this.team[
								d
							]
								.compositeRating
								.passRushing;

						const opponentStrength =
							0.35 *
								teamPassRushing +
							0.65 *
								getPassRushMatchupStrength(
									defender,
									slotIndex,
								);

						const ratio =
							helpTarget
								.compositeRating
								.passBlocking /
								Math.max(
									0.05,
									opponentStrength,
								);

						const baselineRatio =
							[
								1.03,
								0.99,
								0.98,
								0.99,
								1.02,
							][
								slotIndex
							] ??
								1;

						const rescueProbability =
							helpers.bound(
								(
									(ratio -
										baselineRatio) *
										(0.45 /
											0.25) +
										0.5 +
										(passProtectionHelpBonuses.get(
											helpTarget,
										) ??
											0)
								) *
									0.6,
								0,
								0.75,
							);

						if (
							Math.random() <
								rescueProbability
						) {
							pbw.set(
								helpTarget,
								{
									...existingResult,
									won: true,
								},
							);
						}
					}
				}
			}
		};

		const te =
			this.playersOnField[
				o
			].TE;

		if (te) {
			for (const p of te) {
				if (
					Math.random() <
						conceptEffects
							.teProtectionChance
				) {
					addExtraProtectionAttempt(
						p,
						"TE",
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
			for (const p of rb) {
				if (
					Math.random() <
						conceptEffects
							.rbProtectionChance
				) {
					addExtraProtectionAttempt(
						p,
						"RB",
						0.5,
					);
				}
			}
		}

		this.currentFreePassRushers =
			unaccountedExtraRushers;

		const qb =
			this.getTopPlayerOnField(
				o,
				"QB",
			);

		const blockedPressure =
			getPassPressureLevel(
				this.playersOnField[
					o
				],
				pbw,
				passProtectionMatchups,
				this.team[
					d
				].compositeRating
					.passRushing,
			);

		let freeRusherPressure =
			0;

		for (
			const rusher of
				this
					.currentFreePassRushers
		) {
			const strength =
				getPassRushFreeRusherStrength(
					rusher,
				);

			const individualPressure =
				helpers.bound(
					0.32 +
						0.38 *
							strength,
					0.32,
					0.7,
				);

			freeRusherPressure =
				1 -
					(1 -
						freeRusherPressure) *
						(1 -
							individualPressure);
		}

		this.currentPassPressureLevel =
			helpers.bound(
				1 -
					(1 -
						blockedPressure) *
						(1 -
							freeRusherPressure),
				0,
				1,
			);

		const passPressureEffects =
			getPassPressureEffects(
				passConcept,
				getEffectivePassPressure(
					qb,
					this
						.currentPassPressureLevel,
				),
			);

		this.currentPlay.addEvent({
			type: "dropback",
			pbw,
		});

		this.playByPlay.logEvent({
			type: "dropback",
			clock: this.clock,
			names: [
				qb.name,
			],
			t: o,
		});

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

		if (
			Math.random() <
				this.probSack(
					qb,
					pbw,
				)
		) {
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

		const getPassTargetCandidates = (
			positions:
				Array<
					"WR" |
					"TE" |
					"RB"
				>,
			allowProtected:
				boolean = false,
		) =>
			positions
				.flatMap(
					(pos) =>
						this
							.playersOnField[
							o
						][pos] ??
							[],
				)
				.filter(
					(candidate) =>
						allowProtected ||
						(
							!passProtectors.has(
								candidate,
							) &&
							!pbw.has(
								candidate,
							)
						),
				);

		const pickTargetFromPositions = (
			positions:
				Array<
					"WR" |
					"TE" |
					"RB"
				>,
		) => {
			let candidates =
				getPassTargetCandidates(
					positions,
				);

			/*
			 * If every preferred receiver stayed in protection,
			 * allow one to release late as an outlet rather than
			 * feeding choice() an empty array.
			 */
			if (
				candidates.length ===
					0
			) {
				candidates =
					getPassTargetCandidates(
						positions,
						true,
					);
			}

			/*
			 * Catastrophic injuries or unusual old-save rosters can
			 * leave the concept's preferred position group empty.
			 * Fall back to any skill-position player on the field.
			 */
			if (
				candidates.length ===
					0
			) {
				candidates =
					getPassTargetCandidates(
						[
							"WR",
							"TE",
							"RB",
						],
						true,
					);
			}

			if (
				candidates.length ===
					0
			) {
				throw new Error(
					"No eligible pass target on field",
				);
			}

			return choice(
				candidates,
				(candidate) =>
					getPassTargetWeight(
						candidate,
						passConcept,
					),
			);
		};

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
				? pickTargetFromPositions(
						[
							"RB",
						],
					)
				: passConcept ===
						"SCREEN"
					? pickTargetFromPositions(
							[
								"WR",
							],
						)
					: passConcept ===
							"DEEP_SHOT"
						? pickTargetFromPositions(
								[
									"WR",
									"TE",
								],
							)
						: pickTargetFromPositions(
								[
									"WR",
									"TE",
									"RB",
								],
							);

		const isRbTarget =
			this.playersOnField[
				o
			].RB?.includes(
				target,
			) ??
				false;

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
			this.team[
				o
			].compositeRating
				.passBlocking /
				this.team[
					d
				].compositeRating
					.passRushing;

		let meanYds:
			number;

		let spreadYds:
			number;

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

			spreadYds = 4.5;
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

			spreadYds = 10;
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

			spreadYds = 8;
		} else if (
			passConcept ===
				"SCREEN"
		) {
			const tackling =
				Math.max(
					0.05,
					this.team[
						d
					]
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

			spreadYds = 8.5;
		} else {
			meanYds =
				helpers.bound(
					rbFactor *
						9.5 *
						protectionRatio,
					-5,
					65,
				);

			spreadYds = 7;
		}

		meanYds =
			helpers.bound(
				meanYds *
					defensivePassEffects
						.yardageMultiplier *
					passPressureEffects
						.yardageMultiplier,
				-5,
				100,
			);

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
					0.08 *
					defensivePassEffects
						.explosiveMultiplier *
					passPressureEffects
						.explosiveMultiplier
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
					0.04 *
					defensivePassEffects
						.explosiveMultiplier *
					passPressureEffects
						.explosiveMultiplier
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
					0.02 *
					defensivePassEffects
						.explosiveMultiplier *
					passPressureEffects
						.explosiveMultiplier
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
					speedExplosiveChance *
					defensivePassEffects
						.explosiveMultiplier *
					passPressureEffects
						.explosiveMultiplier
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

		if (ydsRaw < 0) {
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

		const defenderPositions:
			Array<
				"CB" |
					"S" |
					"LB"
			> =
			passConcept ===
				"DEEP_SHOT"
				? [
						"CB",
						"S",
					]
				: passConcept ===
						"SCREEN"
					? [
							"LB",
							"CB",
							"S",
						]
					: [
							"CB",
							"S",
							"LB",
						];

		let defenderCandidates =
			defenderPositions.flatMap(
				(pos) =>
					this
						.playersOnField[
						d
					][pos] ??
						[],
			);

		if (
			defenderCandidates.length ===
				0
		) {
			const fallbackDefenderPositions:
				Array<
					"CB" |
						"S" |
						"LB" |
						"DL"
				> = [
					"CB",
					"S",
					"LB",
					"DL",
				];

			defenderCandidates =
				fallbackDefenderPositions.flatMap(
					(pos) =>
						this
							.playersOnField[
							d
						][pos] ??
							[],
				);
		}

		if (
			defenderCandidates.length ===
				0
		) {
			throw new Error(
				"No coverage defender on field",
			);
		}

		const defender =
			choice(
				defenderCandidates,
				(candidate) =>
					getCoverageDefenderWeight(
						candidate,
						passConcept,
					),
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

		this.currentPlay.addEvent({
			type: "pss",
			qb,
			target,
		});

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
				) /
					20;

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
					this.playByPlay.logEvent({
						totalPssTD:
							undefined,
						totalRecTD:
							undefined,
						...completeEvent,
					});

					return (
						dt +
							this.doFumble(
								target,
								0,
							)
					);
				}

				if (td) {
					this.currentPlay.addEvent({
						type: "pssTD",
						qb,
						target,
					});
				}

				if (safety) {
					this.doSafety();
				}

				this.playByPlay.logEvent({
					totalPssTD:
						this
							.allStarGame
							? undefined
							: qb
									.seasonStats[
									"pssTD"
								] +
								qb.stat[
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
								target.stat[
									"recTD"
								],
					...completeEvent,
				});

				if (
					!td &&
					!safety
				) {
					this.doTackle({
						ydsFromScrimmage:
							yds,
					});
				}
			} else {
				this.currentPlay.addEvent({
					type:
						"pssInc",
					defender:
						Math.random() <
							0.28
							? defender
							: undefined,
				});

				this.playByPlay.logEvent({
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
				});
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