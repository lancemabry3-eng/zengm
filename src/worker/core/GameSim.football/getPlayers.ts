import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { POSITIONS } from "../../../common/constants.football.ts";
import { choice } from "../../../common/random.ts";
import type { Position } from "../../../common/types.football.ts";
import helpers from "../../util/helpers.ts";
import type { FunctionalRole } from "../player/roleOvr.football.ts";
import {
	DEFENSIVE_ROLES_BY_FRONT,
	OFFENSIVE_ROLES_BY_PERSONNEL,
	getDefensiveRoleOrder,
	getOffensiveRoleOrder,
} from "./formations.ts";
import type {
	DefensivePlayConcept,
	Formation,
	OffensivePersonnel,
	PassConcept,
	PlayerGameSim,
	PlayersOnField,
	TeamGameSim,
} from "./types.ts";

const roleDepthCache = new WeakMap<
	PlayerGameSim[],
	Map<string, PlayerGameSim[]>
>();

const getDefensiveCoachingDecisionExponent = (
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

const applyDefensiveCoachingDecisionWeight = (
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
		getDefensiveCoachingDecisionExponent(
			team,
		)
	);
};

const getRoleCacheKey = (roles: FunctionalRole[]): string => roles.join("|");

export const getRoleBasedDepth = (
	depth: PlayerGameSim[],
	roles: FunctionalRole[],
): PlayerGameSim[] => {
	if (roles.length === 0 || depth.length < roles.length) {
		return depth;
	}

	const cacheKey = getRoleCacheKey(roles);
	let cacheForDepth = roleDepthCache.get(depth);
	if (!cacheForDepth) {
		cacheForDepth = new Map();
		roleDepthCache.set(depth, cacheForDepth);
	}

	const cached = cacheForDepth.get(cacheKey);
	if (cached) {
		return cached;
	}

	let bestScore = -Infinity;
	let bestPlayers: PlayerGameSim[] = [];
	const currentPlayers: PlayerGameSim[] = [];
	const usedPlayerIds = new Set<number>();

	const search = (roleIndex: number, totalScore: number) => {
		if (roleIndex === roles.length) {
			if (totalScore > bestScore) {
				bestScore = totalScore;
				bestPlayers = currentPlayers.slice();
			}
			return;
		}

		const role = roles[roleIndex]!;

		for (const p of depth) {
			if (usedPlayerIds.has(p.id)) {
				continue;
			}

			const roleScore = p.roleOvrs?.[role];
			if (roleScore === undefined) {
				continue;
			}

			usedPlayerIds.add(p.id);
			currentPlayers.push(p);

			search(
				roleIndex + 1,
				totalScore + roleScore,
			);

			currentPlayers.pop();
			usedPlayerIds.delete(p.id);
		}
	};

	search(0, 0);

	if (bestPlayers.length !== roles.length) {
		cacheForDepth.set(
			cacheKey,
			depth,
		);
		return depth;
	}

	const rolePlayerIds =
		new Set(
			bestPlayers.map(
				(p) => p.id,
			),
		);

	const reorderedDepth = [
		...bestPlayers,
		...depth.filter(
			(p) =>
				!rolePlayerIds.has(
					p.id,
				),
		),
	];

	cacheForDepth.set(
		cacheKey,
		reorderedDepth,
	);

	return reorderedDepth;
};

const offensivePersonnelFitCache =
	new WeakMap<
		TeamGameSim,
		Map<
			OffensivePersonnel,
			number | undefined
		>
	>();

export const getOffensivePersonnelFit = (
	team: TeamGameSim,
	personnel: OffensivePersonnel,
): number | undefined => {
	let cacheForTeam =
		offensivePersonnelFitCache.get(
			team,
		);

	if (!cacheForTeam) {
		cacheForTeam =
			new Map();

		offensivePersonnelFitCache.set(
			team,
			cacheForTeam,
		);
	}

	if (
		cacheForTeam.has(
			personnel,
		)
	) {
		return cacheForTeam.get(
			personnel,
		);
	}

	let totalScore = 0;
	let roleCount = 0;

	for (
		const pos of
			["RB", "WR", "TE"] as const
	) {
		const roles =
			OFFENSIVE_ROLES_BY_PERSONNEL[
				personnel
			][pos];

		if (
			roles === undefined ||
			roles.length === 0
		) {
			continue;
		}

		const depth =
			team.depth[pos];

		if (
			depth === undefined ||
			depth.length <
				roles.length
		) {
			cacheForTeam.set(
				personnel,
				undefined,
			);

			return undefined;
		}

		const orderedDepth =
			getRoleBasedDepth(
				depth,
				roles,
			);

		for (
			let i = 0;
			i < roles.length;
			i++
		) {
			const role =
				roles[i]!;

			const score =
				orderedDepth[i]
					?.roleOvrs?.[
						role
					];

			if (
				score ===
				undefined
			) {
				cacheForTeam.set(
					personnel,
					undefined,
				);

				return undefined;
			}

			totalScore +=
				score;

			roleCount +=
				1;
		}
	}

	const fit =
		roleCount > 0
			? totalScore /
				roleCount
			: undefined;

	cacheForTeam.set(
		personnel,
		fit,
	);

	return fit;
};

const maxDefined = (
	values: Array<
		number | undefined
	>,
): number | undefined => {
	let best:
		| number
		| undefined;

	for (
		const value of
			values
	) {
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

	return best;
};

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

	if (
		defined.length ===
		0
	) {
		return undefined;
	}

	return (
		defined.reduce(
			(
				sum,
				value,
			) =>
				sum +
				value,
			0,
		) /
		defined.length
	);
};

const getPassTargetRoleScore = (
	p: PlayerGameSim,
	concept: PassConcept,
): number | undefined => {
	if (
		concept ===
		"QUICK_GAME"
	) {
		return maxDefined([
			p.roleOvrs
				?.WR_SLOT,
			p.roleOvrs
				?.WR_POSSESSION,
			p.roleOvrs
				?.WR_Z,
			p.roleOvrs
				?.TE_RECEIVING,
			p.roleOvrs
				?.RB_RECEIVING,
			p.roleOvrs
				?.RB_THIRD_DOWN,
		]);
	}

	if (
		concept ===
		"INTERMEDIATE"
	) {
		return maxDefined([
			p.roleOvrs
				?.WR_X,
			p.roleOvrs
				?.WR_Z,
			p.roleOvrs
				?.WR_POSSESSION,
			p.roleOvrs
				?.TE_RECEIVING,
			p.roleOvrs
				?.TE_Y,
			p.roleOvrs
				?.RB_RECEIVING,
		]);
	}

	if (
		concept ===
		"DEEP_SHOT"
	) {
		return maxDefined([
			p.roleOvrs
				?.WR_DEEP_THREAT,
			p.roleOvrs
				?.WR_X,
			p.roleOvrs
				?.WR_Z,
			p.roleOvrs
				?.TE_RECEIVING,
		]);
	}

	if (
		concept ===
		"PLAY_ACTION"
	) {
		return maxDefined([
			p.roleOvrs
				?.WR_X,
			p.roleOvrs
				?.WR_Z,
			p.roleOvrs
				?.TE_RECEIVING,
			p.roleOvrs
				?.TE_Y,
			p.roleOvrs
				?.RB_RECEIVING,
		]);
	}

	return maxDefined([
		p.roleOvrs
			?.RB_RECEIVING,
		p.roleOvrs
			?.RB_THIRD_DOWN,
		p.roleOvrs
			?.WR_SLOT,
		p.roleOvrs
			?.WR_Z,
	]);
};

export const getPassTargetWeight = (
	p: PlayerGameSim,
	concept: PassConcept,
): number => {
	const roleScore =
		getPassTargetRoleScore(
			p,
			concept,
		);

	const roleFactor =
		roleScore === undefined
			? 1
			: helpers.bound(
					0.7 +
						(roleScore /
							100) *
							0.9,
					0.7,
					1.6,
				);

	const catching =
		Math.max(
			0.05,
			p.compositeRating
				.catching,
		);

	const gettingOpen =
		Math.max(
			0.05,
			p.compositeRating
				.gettingOpen,
		);

	const speed =
		Math.max(
			0.05,
			p.compositeRating
				.speed,
		);

	const rushing =
		Math.max(
			0.05,
			p.compositeRating
				.rushing,
		);

	const energy =
		helpers.bound(
			p.stat.energy ??
				1,
			0.25,
			1,
		);

	let skillWeight:
		number;

	if (
		concept ===
		"QUICK_GAME"
	) {
		skillWeight =
			catching *
				0.5 +
			gettingOpen *
				0.5;
	} else if (
		concept ===
		"DEEP_SHOT"
	) {
		skillWeight =
			gettingOpen *
				0.45 +
			speed *
				0.35 +
			catching *
				0.2;
	} else if (
		concept ===
		"PLAY_ACTION"
	) {
		skillWeight =
			gettingOpen *
				0.55 +
			catching *
				0.3 +
			speed *
				0.15;
	} else if (
		concept ===
		"SCREEN"
	) {
		skillWeight =
			catching *
				0.35 +
			rushing *
				0.35 +
			speed *
				0.3;
	} else {
		skillWeight =
			gettingOpen *
				0.6 +
			catching *
				0.4;
	}

	return (
		Math.max(
			0.01,
			skillWeight,
		) **
			1.5 *
		roleFactor *
		energy
	);
};

const getCoverageRoleScore = (
	p: PlayerGameSim,
	concept: PassConcept,
): number | undefined => {
	if (
		concept ===
		"DEEP_SHOT"
	) {
		return maxDefined([
			p.roleOvrs
				?.CB_OUTSIDE,
			p.roleOvrs
				?.FS,
			p.roleOvrs
				?.SS,
		]);
	}

	if (
		concept ===
		"QUICK_GAME"
	) {
		return maxDefined([
			p.roleOvrs
				?.CB_SLOT,
			p.roleOvrs
				?.MIKE,
			p.roleOvrs
				?.WILL,
			p.roleOvrs
				?.SS,
			p.roleOvrs
				?.CB_OUTSIDE,
		]);
	}

	if (
		concept ===
		"SCREEN"
	) {
		return maxDefined([
			p.roleOvrs
				?.WILL,
			p.roleOvrs
				?.SAM,
			p.roleOvrs
				?.CB_SLOT,
			p.roleOvrs
				?.SS,
			p.roleOvrs
				?.MIKE,
		]);
	}

	if (
		concept ===
		"PLAY_ACTION"
	) {
		return maxDefined([
			p.roleOvrs
				?.FS,
			p.roleOvrs
				?.SS,
			p.roleOvrs
				?.MIKE,
			p.roleOvrs
				?.WILL,
			p.roleOvrs
				?.CB_OUTSIDE,
		]);
	}

	return maxDefined([
		p.roleOvrs
			?.CB_OUTSIDE,
		p.roleOvrs
			?.CB_SLOT,
		p.roleOvrs
			?.FS,
		p.roleOvrs
			?.SS,
		p.roleOvrs
			?.WILL,
	]);
};

export const getCoverageDefenderWeight = (
	p: PlayerGameSim,
	concept: PassConcept,
): number => {
	const roleScore =
		getCoverageRoleScore(
			p,
			concept,
		);

	const roleFactor =
		roleScore === undefined
			? 1
			: helpers.bound(
					0.75 +
						(roleScore /
							100) *
							0.75,
					0.75,
					1.5,
				);

	const coverage =
		Math.max(
			0.05,
			p.compositeRating
				.passCoverage,
		);

	const tackling =
		Math.max(
			0.05,
			p.compositeRating
				.tackling,
		);

	const energy =
		helpers.bound(
			p.stat.energy ??
				1,
			0.25,
			1,
		);

	const skillWeight =
		concept ===
		"SCREEN"
			? coverage *
					0.55 +
				tackling *
					0.45
			: coverage;

	return (
		skillWeight ** 2 *
		roleFactor *
		energy
	);
};

const DEFENSIVE_PLAY_CONCEPTS:
	DefensivePlayConcept[] = [
		"BASE",
		"MAN_PRESS",
		"COVER_1",
		"COVER_2",
		"COVER_3",
		"COVER_4",
		"BLITZ",
		"RUN_BLITZ",
		"EDGE_CONTAIN",
	];

const defensiveConceptFitCache =
	new WeakMap<
		TeamGameSim,
		Map<
			DefensivePlayConcept,
			number | undefined
		>
	>();

const getBestDefensiveRoleScore = (
	team: TeamGameSim,
	pos:
		| "DL"
		| "LB"
		| "CB"
		| "S",
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
					score >
						best)
			) {
				best =
					score;
			}
		}
	}

	return best;
};

const getTeamCompositePercent = (
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

const getDefensivePlayConceptFitScore = (
	team: TeamGameSim,
	concept: DefensivePlayConcept,
): number | undefined => {
	let cacheForTeam =
		defensiveConceptFitCache.get(
			team,
		);

	if (!cacheForTeam) {
		cacheForTeam =
			new Map();

		defensiveConceptFitCache.set(
			team,
			cacheForTeam,
		);
	}

	if (
		cacheForTeam.has(
			concept,
		)
	) {
		return cacheForTeam.get(
			concept,
		);
	}

	let score:
		| number
		| undefined;

	if (
		concept ===
		"BASE"
	) {
		score =
			averageDefined([
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
				getTeamCompositePercent(
					team,
					"runStopping",
				),
				getTeamCompositePercent(
					team,
					"tackling",
				),
			]);
	} else if (
		concept ===
		"MAN_PRESS"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"CB",
					[
						"CB_OUTSIDE",
						"CB_SLOT",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"SS",
					],
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	} else if (
		concept ===
		"COVER_1"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"CB",
					[
						"CB_OUTSIDE",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"FS",
					],
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	} else if (
		concept ===
		"COVER_2"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"CB",
					[
						"CB_OUTSIDE",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"FS",
						"SS",
					],
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	} else if (
		concept ===
		"COVER_3"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"CB",
					[
						"CB_OUTSIDE",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"FS",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"LB",
					[
						"WILL",
					],
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	} else if (
		concept ===
		"COVER_4"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"CB",
					[
						"CB_OUTSIDE",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"FS",
						"SS",
					],
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	} else if (
		concept ===
		"BLITZ"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"DL",
					[
						"DL_EDGE",
						"DE",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"LB",
					[
						"LB_EDGE",
						"SAM",
					],
				),
				getTeamCompositePercent(
					team,
					"passRushing",
				),
			]);
	} else if (
		concept ===
		"RUN_BLITZ"
	) {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"LB",
					[
						"MIKE",
						"SAM",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"BOX_SAFETY",
						"SS",
					],
				),
				getTeamCompositePercent(
					team,
					"runStopping",
				),
				getTeamCompositePercent(
					team,
					"tackling",
				),
			]);
	} else {
		score =
			averageDefined([
				getBestDefensiveRoleScore(
					team,
					"LB",
					[
						"LB_EDGE",
						"WILL",
						"SAM",
					],
				),
				getBestDefensiveRoleScore(
					team,
					"S",
					[
						"SS",
						"BOX_SAFETY",
					],
				),
				getTeamCompositePercent(
					team,
					"runStopping",
				),
				getTeamCompositePercent(
					team,
					"passCoverage",
				),
			]);
	}

	cacheForTeam.set(
		concept,
		score,
	);

	return score;
};

const getDefensivePlayConceptSituationWeight = (
	concept: DefensivePlayConcept,
	offensivePersonnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): number => {
	let weight =
		concept ===
		"BASE"
			? 4
			: concept ===
				  "MAN_PRESS"
				? 1.6
				: concept ===
					  "COVER_1"
					? 2.4
					: concept ===
						  "COVER_2"
						? 2.2
						: concept ===
							  "COVER_3"
							? 3
							: concept ===
								  "COVER_4"
								? 1.5
								: concept ===
									  "BLITZ"
									? 1.3
									: concept ===
										  "RUN_BLITZ"
										? 1
										: 0.9;

	if (
		offensivePersonnel ===
		"11"
	) {
		if (
			concept ===
			"MAN_PRESS"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"COVER_2"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 0.65;
		} else if (
			concept ===
			"EDGE_CONTAIN"
		) {
			weight *= 1.05;
		}
	} else if (
		offensivePersonnel ===
		"12"
	) {
		if (
			concept ===
			"BASE"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"COVER_3"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 1.1;
		} else if (
			concept ===
			"EDGE_CONTAIN"
		) {
			weight *= 1.1;
		}
	} else if (
		offensivePersonnel ===
		"21"
	) {
		if (
			concept ===
			"BASE"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 0.7;
		} else if (
			concept ===
			"MAN_PRESS"
		) {
			weight *= 0.85;
		}
	} else {
		if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 1.55;
		} else if (
			concept ===
			"BASE"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 0.55;
		} else if (
			concept ===
			"BLITZ"
		) {
			weight *= 0.8;
		}
	}

	if (toGo <= 2) {
		if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 2.2;
		} else if (
			concept ===
			"EDGE_CONTAIN"
		) {
			weight *= 1.25;
		} else if (
			concept ===
			"BASE"
		) {
			weight *= 1.15;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 0.45;
		} else if (
			concept ===
			"BLITZ"
		) {
			weight *= 0.8;
		}
	}

	if (toGo >= 8) {
		if (
			concept ===
			"COVER_4"
		) {
			weight *= 1.8;
		} else if (
			concept ===
			"COVER_3"
		) {
			weight *= 1.35;
		} else if (
			concept ===
			"COVER_2"
		) {
			weight *= 1.25;
		} else if (
			concept ===
			"BLITZ"
		) {
			weight *= 1.35;
		} else if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 0.3;
		} else if (
			concept ===
			"MAN_PRESS"
		) {
			weight *= 0.85;
		}
	}

	if (
		down >= 3 &&
		toGo >= 5
	) {
		if (
			concept ===
			"BLITZ"
		) {
			weight *= 1.65;
		} else if (
			concept ===
			"COVER_1"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 1.4;
		} else if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 0.25;
		} else if (
			concept ===
			"EDGE_CONTAIN"
		) {
			weight *= 1.1;
		}
	}

	if (
		scrimmage >=
		95
	) {
		if (
			concept ===
			"RUN_BLITZ"
		) {
			weight *= 1.7;
		} else if (
			concept ===
			"MAN_PRESS"
		) {
			weight *= 1.55;
		} else if (
			concept ===
			"COVER_1"
		) {
			weight *= 1.3;
		} else if (
			concept ===
			"EDGE_CONTAIN"
		) {
			weight *= 1.2;
		} else if (
			concept ===
			"COVER_4"
		) {
			weight *= 0.4;
		}
	}

	return weight;
};

export const chooseDefensivePlayConcept = (
	team: TeamGameSim,
	offensivePersonnel: OffensivePersonnel,
	down: number,
	toGo: number,
	scrimmage: number,
): DefensivePlayConcept => {
	return choice(
		DEFENSIVE_PLAY_CONCEPTS,
		(concept) => {
			const situationWeight =
				getDefensivePlayConceptSituationWeight(
					concept,
					offensivePersonnel,
					down,
					toGo,
					scrimmage,
				);

			const fit =
				getDefensivePlayConceptFitScore(
					team,
					concept,
				);

			const fitFactor =
				fit === undefined
					? 1
					: helpers.bound(
							1 +
								(fit -
									50) /
									125,
							0.7,
							1.3,
						);

			const baseWeight =
				Math.max(
					0.01,
					situationWeight *
						fitFactor,
				);

			return applyDefensiveCoachingDecisionWeight(
				team,
				baseWeight,
			);
		},
	);
};

type BaseDefensiveFront =
	| "BASE_3_4"
	| "BASE_4_3";

const baseDefensiveFrontCache =
	new WeakMap<
		TeamGameSim,
		BaseDefensiveFront
	>();

const getDefensiveFrontFitScore = (
	team: TeamGameSim,
	front: BaseDefensiveFront,
): number => {
	let totalScore = 0;

	for (
		const pos of
			["DL", "LB"] as const
	) {
		const roles =
			DEFENSIVE_ROLES_BY_FRONT[
				front
			][pos];

		const depth =
			team.depth[pos];

		if (
			roles === undefined ||
			depth === undefined ||
			depth.length <
				roles.length
		) {
			return -Infinity;
		}

		const orderedDepth =
			getRoleBasedDepth(
				depth,
				roles,
			);

		for (
			let i = 0;
			i < roles.length;
			i++
		) {
			const role =
				roles[i]!;

			const score =
				orderedDepth[i]
					?.roleOvrs?.[
						role
					];

			if (
				score ===
				undefined
			) {
				return -Infinity;
			}

			totalScore +=
				score;
		}
	}

	return totalScore;
};

export const getBaseDefensiveFront = (
	team: TeamGameSim,
): BaseDefensiveFront => {
	const cached =
		baseDefensiveFrontCache.get(
			team,
		);

	if (cached) {
		return cached;
	}

	const score34 =
		getDefensiveFrontFitScore(
			team,
			"BASE_3_4",
		);

	const score43 =
		getDefensiveFrontFitScore(
			team,
			"BASE_4_3",
		);

	const front:
		BaseDefensiveFront =
			score34 >
			score43
				? "BASE_3_4"
				: "BASE_4_3";

	baseDefensiveFrontCache.set(
		team,
		front,
	);

	return front;
};

export const getFormationDepth = (
	depth: PlayerGameSim[],
	formation: Formation,
	side: "off" | "def",
	pos: Position,
): PlayerGameSim[] => {
	const roles =
		side === "off"
			? getOffensiveRoleOrder(
					formation,
					pos,
				)
			: getDefensiveRoleOrder(
					formation,
					pos,
				);

	if (
		roles === undefined ||
		roles.length === 0
	) {
		return depth;
	}

	return getRoleBasedDepth(
		depth,
		roles,
	);
};

const getPlayers = (
	playersOnField: PlayersOnField,
	positions: Position[] = POSITIONS,
): PlayerGameSim[] => {
	const players:
		PlayerGameSim[] = [];

	for (
		const pos of
			helpers.keys(
				playersOnField,
			)
	) {
		if (
			positions.includes(
				pos,
			) &&
			playersOnField[
				pos
			]
		) {
			players.push(
				...playersOnField[
					pos
				],
			);
		}
	}

	return players;
};

export default getPlayers;